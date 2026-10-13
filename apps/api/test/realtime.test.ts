import fs from "node:fs";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Alert } from "../src/models/alert.js";
import type { AlertPayload, MachineHealthPayload } from "../src/realtime/dto.js";
import {
  alertEventSchema,
  healthEventSchema,
  readingSchema,
  type AlertEvent,
  type HealthEvent,
} from "../src/realtime/events.js";
import { applyAlertEvent, applyHealthEvent } from "../src/realtime/handlers.js";
import type { Hub } from "../src/realtime/hub.js";
import { app, bearer, registerAndLogin, setupDb, teardownDb } from "./helpers.js";

const contractsDir = path.resolve(import.meta.dirname, "../../../contracts");
const readContract = (file: string) =>
  JSON.parse(fs.readFileSync(path.join(contractsDir, file), "utf8")) as Record<string, unknown>;

class RecordingHub implements Hub {
  health: { orgId: string; payload: MachineHealthPayload }[] = [];
  alerts: { orgId: string; payload: AlertPayload }[] = [];
  healthChanged(orgId: string, payload: MachineHealthPayload) {
    this.health.push({ orgId, payload });
  }
  alertChanged(orgId: string, payload: AlertPayload) {
    this.alerts.push({ orgId, payload });
  }
  reading() {}
}

describe("event definitions match the contracts", () => {
  const cases = [
    ["telemetry", readingSchema],
    ["alert", alertEventSchema],
    ["machine-health", healthEventSchema],
  ] as const;

  for (const [name, schema] of cases) {
    it(`${name}: the contract example is accepted by both the JSON Schema and the API`, () => {
      const example = readContract(`${name}.example.json`);
      const ajv = new Ajv2020({ strict: true });
      addFormats(ajv);

      expect(ajv.validate(readContract(`${name}.schema.json`), example)).toBe(true);
      expect(schema.safeParse(example).success).toBe(true);
    });

    it(`${name}: an extra field is refused`, () => {
      const example = { ...readContract(`${name}.example.json`), extra: 1 };
      expect(schema.safeParse(example).success).toBe(false);
    });
  }

  it("machine-health: a minimal unknown event is accepted", () => {
    const minimal = {
      schemaVersion: 1,
      orgId: "6acb97418f15672ff985c5ef",
      plantId: "6acba134ed0ec5f5a756b95d",
      machineId: "6acba4c1b8f3bc79fe53fcb9",
      status: "unknown",
      ts: "2026-10-13T09:15:05.000Z",
    };
    expect(healthEventSchema.safeParse(minimal).success).toBe(true);
  });

  it("alert: timestamps with nanoseconds from Java are accepted", () => {
    const example = { ...readContract("alert.example.json"), ts: "2026-10-13T09:15:02.120123456Z" };
    expect(alertEventSchema.safeParse(example).success).toBe(true);
  });
});

describe("applying events", () => {
  let token: string;
  let orgId: string;
  let plantId: string;
  let machineId: string;
  let sensorId: string;
  let otherOrgId: string;
  const hub = new RecordingHub();

  beforeAll(async () => {
    await setupDb();
    const a = await registerAndLogin("a@acme.test", "Acme");
    const b = await registerAndLogin("b@other.test", "Other");
    token = a.token;
    orgId = a.user.orgId;
    otherOrgId = b.user.orgId;

    plantId = (await request(app).post("/api/plants").set(bearer(token)).send({ name: "Plant" })).body.id;
    machineId = (
      await request(app)
        .post("/api/machines")
        .set(bearer(token))
        .send({ plantId, name: "Lathe", type: "CNC" })
    ).body.id;
    sensorId = (
      await request(app)
        .post("/api/sensors")
        .set(bearer(token))
        .send({ machineId, name: "Vibration", type: "vibration_rms", unit: "mm/s", thresholds: { max: 9 } })
    ).body.id;
  });

  afterAll(teardownDb);

  const healthEvent = (overrides: Partial<HealthEvent> = {}): HealthEvent => ({
    schemaVersion: 1,
    orgId,
    plantId,
    machineId,
    status: "warning",
    healthScore: 38,
    reasons: ["Vibration is at 93% of its limit"],
    ts: "2026-10-13T10:00:00.000Z",
    ...overrides,
  });

  const alertEvent = (overrides: Partial<AlertEvent> = {}): AlertEvent => ({
    schemaVersion: 1,
    orgId,
    plantId,
    machineId,
    sensorId,
    rule: "max_exceeded",
    state: "OPEN",
    severity: "critical",
    value: 9.4,
    limit: 9,
    message: "Vibration is 9.4 mm/s, above its maximum of 9 mm/s",
    ts: "2026-10-13T10:00:00.000Z",
    ...overrides,
  });

  describe("machine health", () => {
    it("stores status, score and reasons and tells the browser", async () => {
      const applied = await applyHealthEvent(healthEvent(), hub);

      expect(applied).toBe(true);
      const res = await request(app).get(`/api/machines/${machineId}`).set(bearer(token));
      expect(res.body).toMatchObject({
        status: "warning",
        healthScore: 38,
        healthReasons: ["Vibration is at 93% of its limit"],
        healthUpdatedAt: "2026-10-13T10:00:00.000Z",
      });
      expect(hub.health.at(-1)).toEqual({
        orgId,
        payload: {
          machineId,
          plantId,
          status: "warning",
          healthScore: 38,
          healthReasons: ["Vibration is at 93% of its limit"],
          healthUpdatedAt: "2026-10-13T10:00:00.000Z",
        },
      });
    });

    it("ignores an older event that arrives late", async () => {
      const before = hub.health.length;

      const applied = await applyHealthEvent(
        healthEvent({ status: "healthy", healthScore: 100, ts: "2026-10-13T09:59:00.000Z" }),
        hub,
      );

      expect(applied).toBe(false);
      expect(hub.health).toHaveLength(before);
      const res = await request(app).get(`/api/machines/${machineId}`).set(bearer(token));
      expect(res.body.status).toBe("warning");
    });

    it("clears the score and reasons when the status becomes unknown", async () => {
      await applyHealthEvent(
        healthEvent({ status: "unknown", healthScore: undefined, reasons: undefined, ts: "2026-10-13T10:05:00.000Z" }),
        hub,
      );

      const res = await request(app).get(`/api/machines/${machineId}`).set(bearer(token));
      expect(res.body).toMatchObject({ status: "unknown", healthScore: null, healthReasons: [] });
    });

    it("ignores events for machines of another organization or unknown machines", async () => {
      const before = hub.health.length;

      expect(await applyHealthEvent(healthEvent({ orgId: otherOrgId, ts: "2026-10-13T11:00:00.000Z" }), hub)).toBe(false);
      expect(await applyHealthEvent(healthEvent({ machineId: "aaaaaaaaaaaaaaaaaaaaaaaa", ts: "2026-10-13T11:00:00.000Z" }), hub)).toBe(false);
      expect(hub.health).toHaveLength(before);
    });
  });

  describe("alerts", () => {
    it("opens one alert and keeps updating it instead of creating duplicates", async () => {
      await applyAlertEvent(alertEvent(), hub);
      await applyAlertEvent(alertEvent({ value: 9.9, message: "Vibration is 9.9 mm/s, above its maximum of 9 mm/s", ts: "2026-10-13T10:00:05.000Z" }), hub);

      const alerts = await Alert.find({ sensorId });
      expect(alerts).toHaveLength(1);
      expect(alerts[0]?.status).toBe("OPEN");
      expect(alerts[0]?.machineName).toBe("Lathe");
      expect(hub.alerts.at(-1)?.payload.machineName).toBe("Lathe");
      expect(alerts[0]?.value).toBe(9.9);
      expect(alerts[0]?.openedAt.toISOString()).toBe("2026-10-13T10:00:00.000Z");
      expect(alerts[0]?.lastEventAt.toISOString()).toBe("2026-10-13T10:00:05.000Z");
      expect(hub.alerts.at(-1)?.payload.status).toBe("OPEN");
    });

    it("resolves the open alert", async () => {
      await applyAlertEvent(
        alertEvent({ state: "RESOLVED", message: "Vibration is back within its maximum of 9 mm/s", ts: "2026-10-13T10:01:00.000Z" }),
        hub,
      );

      const alert = await Alert.findOne({ sensorId });
      expect(alert?.status).toBe("RESOLVED");
      expect(alert?.resolvedAt?.toISOString()).toBe("2026-10-13T10:01:00.000Z");
      expect(alert?.resolvedMessage).toBe("Vibration is back within its maximum of 9 mm/s");
      expect(hub.alerts.at(-1)?.payload.status).toBe("RESOLVED");
    });

    it("ignores a resolve when nothing is open", async () => {
      const before = hub.alerts.length;

      const result = await applyAlertEvent(alertEvent({ state: "RESOLVED", ts: "2026-10-13T10:02:00.000Z" }), hub);

      expect(result).toBeNull();
      expect(hub.alerts).toHaveLength(before);
    });

    it("opens a new alert when the problem comes back", async () => {
      await applyAlertEvent(alertEvent({ ts: "2026-10-13T10:03:00.000Z" }), hub);

      const alerts = await Alert.find({ sensorId }).sort({ openedAt: 1 });
      expect(alerts.map((a) => a.status)).toEqual(["RESOLVED", "OPEN"]);
    });

    it("keeps different rules on the same sensor apart", async () => {
      await applyAlertEvent(
        alertEvent({ rule: "rate_of_change", severity: "warning", value: 3, limit: 2, message: "Vibration is changing fast", ts: "2026-10-13T10:04:00.000Z" }),
        hub,
      );

      const open = await Alert.find({ sensorId, status: "OPEN" });
      expect(open.map((a) => a.rule).sort()).toEqual(["max_exceeded", "rate_of_change"]);
    });

    it("ignores alerts for sensors that are unknown or belong to another organization", async () => {
      const before = await Alert.countDocuments();

      expect(await applyAlertEvent(alertEvent({ sensorId: "bbbbbbbbbbbbbbbbbbbbbbbb" }), hub)).toBeNull();
      expect(await applyAlertEvent(alertEvent({ orgId: otherOrgId }), hub)).toBeNull();
      expect(await Alert.countDocuments()).toBe(before);
    });

    it("keeps offline alerts without a value", async () => {
      const event = alertEvent({
        rule: "sensor_offline",
        severity: "warning",
        value: undefined,
        limit: undefined,
        message: "Vibration has not reported for 31 seconds",
        ts: "2026-10-13T10:05:00.000Z",
      });

      const alert = await applyAlertEvent(event, hub);

      expect(alert?.value).toBeUndefined();
      expect(hub.alerts.at(-1)?.payload).toMatchObject({ rule: "sensor_offline", value: null, limit: null });
    });
  });
});
