import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Alert } from "../src/models/alert.js";
import type { AlertPayload } from "../src/realtime/dto.js";
import { applyAlertEvent } from "../src/realtime/handlers.js";
import { silentHub, type Hub } from "../src/realtime/hub.js";
import { setHub } from "../src/realtime/hubRegistry.js";
import { PASSWORD, app, bearer, registerAndLogin, setupDb, teardownDb } from "./helpers.js";

class RecordingHub implements Hub {
  alerts: AlertPayload[] = [];
  healthChanged() {}
  alertChanged(_orgId: string, payload: AlertPayload) {
    this.alerts.push(payload);
  }
  reading() {}
}

const hub = new RecordingHub();

async function addUser(adminToken: string, email: string, role: string) {
  const created = await request(app)
    .post("/api/users")
    .set(bearer(adminToken))
    .send({ email, role, password: PASSWORD });
  expect(created.status).toBe(201);
  const login = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
  return { token: login.body.accessToken as string, id: created.body.id as string };
}

let admin: { token: string; orgId: string };
let manager: { token: string; id: string };
let tech: { token: string; id: string };
let tech2: { token: string; id: string };
let viewer: { token: string; id: string };
let other: { token: string; orgId: string };
let plantId: string;
let machineId: string;
let otherMachineId: string;
let sensorId: string;

async function newAlert(
  status: "OPEN" | "ACKNOWLEDGED" = "OPEN",
  machine = machineId,
  sensor = sensorId,
) {
  return Alert.create({
    orgId: admin.orgId,
    plantId,
    machineId: machine,
    machineName: "Lathe",
    sensorId: sensor,
    rule: "max_exceeded",
    severity: "critical",
    status,
    message: "Vibration is too high",
    openedAt: new Date(),
    lastEventAt: new Date(),
  });
}

beforeAll(async () => {
  await setupDb();
  setHub(hub);
  const a = await registerAndLogin("admin@acme.test", "Acme");
  admin = { token: a.token, orgId: a.user.orgId };
  manager = await addUser(admin.token, "manager@acme.test", "manager");
  tech = await addUser(admin.token, "tech@acme.test", "technician");
  tech2 = await addUser(admin.token, "tech2@acme.test", "technician");
  viewer = await addUser(admin.token, "viewer@acme.test", "viewer");
  const o = await registerAndLogin("boss@other.test", "Other Co");
  other = { token: o.token, orgId: o.user.orgId };

  plantId = (await request(app).post("/api/plants").set(bearer(admin.token)).send({ name: "Plant" })).body.id;
  machineId = (await request(app).post("/api/machines").set(bearer(admin.token)).send({ plantId, name: "Lathe", type: "CNC" })).body.id;
  otherMachineId = (await request(app).post("/api/machines").set(bearer(admin.token)).send({ plantId, name: "Press", type: "Press" })).body.id;
  sensorId = (
    await request(app)
      .post("/api/sensors")
      .set(bearer(admin.token))
      .send({ machineId, name: "Vibration", type: "vibration_rms", unit: "mm/s", thresholds: { max: 9 } })
  ).body.id;
});

afterAll(async () => {
  setHub(silentHub);
  await teardownDb();
});

describe("team", () => {
  it("lets admins and managers list their organization's users, nobody else", async () => {
    const asManager = await request(app).get("/api/users").set(bearer(manager.token));
    expect(asManager.status).toBe(200);
    expect(asManager.body.map((u: { email: string }) => u.email)).toEqual([
      "admin@acme.test",
      "manager@acme.test",
      "tech2@acme.test",
      "tech@acme.test",
      "viewer@acme.test",
    ]);
    expect(JSON.stringify(asManager.body)).not.toContain("passwordHash");

    expect((await request(app).get("/api/users").set(bearer(tech.token))).status).toBe(403);
    expect((await request(app).get("/api/users").set(bearer(viewer.token))).status).toBe(403);
    expect((await request(app).get("/api/users")).status).toBe(401);
  });

  it("never shows another organization's users", async () => {
    const res = await request(app).get("/api/users").set(bearer(other.token));
    expect(res.body.map((u: { email: string }) => u.email)).toEqual(["boss@other.test"]);
  });

  it("only lets admins add users, with validation and unique emails", async () => {
    const body = { email: "new@acme.test", role: "technician", password: PASSWORD };
    expect((await request(app).post("/api/users").set(bearer(manager.token)).send(body)).status).toBe(403);
    expect((await request(app).post("/api/users").set(bearer(admin.token)).send({ ...body, password: "short" })).status).toBe(400);
    expect((await request(app).post("/api/users").set(bearer(admin.token)).send({ ...body, role: "boss" })).status).toBe(400);
    expect((await request(app).post("/api/users").set(bearer(admin.token)).send({ ...body, email: "tech@acme.test" })).status).toBe(409);
  });

  it("lets an admin change another user's role but not their own", async () => {
    const changed = await request(app).patch(`/api/users/${tech2.id}`).set(bearer(admin.token)).send({ role: "manager" });
    expect(changed.body.role).toBe("manager");
    await request(app).patch(`/api/users/${tech2.id}`).set(bearer(admin.token)).send({ role: "technician" });

    const adminId = (await request(app).get("/api/me").set(bearer(admin.token))).body.id;
    expect((await request(app).patch(`/api/users/${adminId}`).set(bearer(admin.token)).send({ role: "viewer" })).status).toBe(409);
    expect((await request(app).patch(`/api/users/${tech.id}`).set(bearer(other.token)).send({ role: "viewer" })).status).toBe(404);
  });
});

describe("alert actions", () => {
  it("lets a technician acknowledge an open alert and tells the browser", async () => {
    const alert = await newAlert();

    const res = await request(app).post(`/api/alerts/${alert.id}/acknowledge`).set(bearer(tech.token));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ACKNOWLEDGED", acknowledgedByEmail: "tech@acme.test" });
    expect(res.body.acknowledgedAt).toBeTruthy();
    expect(hub.alerts.at(-1)).toMatchObject({ id: alert.id, status: "ACKNOWLEDGED" });
  });

  it("refuses to acknowledge twice, for viewers, and across organizations", async () => {
    const alert = await newAlert();
    await request(app).post(`/api/alerts/${alert.id}/acknowledge`).set(bearer(tech.token));

    expect((await request(app).post(`/api/alerts/${alert.id}/acknowledge`).set(bearer(tech.token))).status).toBe(409);
    const fresh = await newAlert();
    expect((await request(app).post(`/api/alerts/${fresh.id}/acknowledge`).set(bearer(viewer.token))).status).toBe(403);
    expect((await request(app).post(`/api/alerts/${fresh.id}/acknowledge`).set(bearer(other.token))).status).toBe(404);
    expect((await request(app).post("/api/alerts/abc/acknowledge").set(bearer(tech.token))).status).toBe(404);
  });

  it("dismisses a false alarm only with a reason", async () => {
    const alert = await newAlert("ACKNOWLEDGED");

    expect((await request(app).post(`/api/alerts/${alert.id}/dismiss`).set(bearer(tech.token)).send({})).status).toBe(400);
    expect((await request(app).post(`/api/alerts/${alert.id}/dismiss`).set(bearer(tech.token)).send({ reason: "no" })).status).toBe(400);

    const res = await request(app)
      .post(`/api/alerts/${alert.id}/dismiss`)
      .set(bearer(tech.token))
      .send({ reason: "Sensor was being calibrated" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: "DISMISSED",
      dismissReason: "Sensor was being calibrated",
      dismissedByEmail: "tech@acme.test",
    });
    expect((await request(app).post(`/api/alerts/${alert.id}/dismiss`).set(bearer(tech.token)).send({ reason: "again please" })).status).toBe(409);
    expect((await request(app).post(`/api/alerts/${alert.id}/dismiss`).set(bearer(viewer.token)).send({ reason: "not allowed" })).status).toBe(403);
  });

  it("removes a dismissed alert from the active list", async () => {
    const alert = await newAlert();
    await request(app).post(`/api/alerts/${alert.id}/dismiss`).set(bearer(tech.token)).send({ reason: "False alarm" });

    const active = await request(app).get("/api/alerts?status=active").set(bearer(admin.token));
    expect(active.body.map((a: { id: string }) => a.id)).not.toContain(alert.id);
  });
});

describe("work orders", () => {
  const create = (token: string, body: Record<string, unknown>) =>
    request(app).post("/api/work-orders").set(bearer(token)).send(body);

  it("creates a work order from an alert and moves the alert to in progress", async () => {
    const alert = await newAlert("ACKNOWLEDGED");

    const res = await create(manager.token, {
      machineId,
      alertId: alert.id,
      title: "Replace spindle bearing",
      priority: "high",
      assigneeId: tech.id,
      dueAt: "2026-10-20",
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      status: "OPEN",
      priority: "high",
      machineName: "Lathe",
      assigneeEmail: "tech@acme.test",
      createdByEmail: "manager@acme.test",
      alertId: alert.id,
    });
    expect(res.body.dueAt).toBe("2026-10-20T00:00:00.000Z");

    const updated = await Alert.findById(alert.id);
    expect(updated?.status).toBe("IN_PROGRESS");
    expect(updated?.workOrderId?.toString()).toBe(res.body.id);
    expect(hub.alerts.at(-1)).toMatchObject({ id: alert.id, status: "IN_PROGRESS", workOrderId: res.body.id });
  });

  it("only lets admins and managers create, and checks every reference", async () => {
    const base = { machineId, title: "Inspect machine" };
    expect((await create(tech.token, base)).status).toBe(403);
    expect((await create(viewer.token, base)).status).toBe(403);
    expect((await create(manager.token, { ...base, title: "x" })).status).toBe(400);
    expect((await create(manager.token, { ...base, priority: "urgent" })).status).toBe(400);
    expect((await create(manager.token, { ...base, assigneeId: viewer.id })).status).toBe(400);
    expect((await create(other.token, base)).status).toBe(404);
    expect((await create(manager.token, { ...base, machineId: "aaaaaaaaaaaaaaaaaaaaaaaa" })).status).toBe(404);

    const otherUser = (await request(app).get("/api/users").set(bearer(other.token))).body[0].id;
    expect((await create(manager.token, { ...base, assigneeId: otherUser })).status).toBe(400);
  });

  it("refuses to link an alert that is closed, already linked, or on another machine", async () => {
    const taken = await newAlert("ACKNOWLEDGED");
    await create(manager.token, { machineId, alertId: taken.id, title: "First order" });
    const resolved = await Alert.create({
      orgId: admin.orgId, plantId, machineId, machineName: "Lathe", sensorId, rule: "min_exceeded",
      severity: "critical", status: "RESOLVED", message: "x", openedAt: new Date(), lastEventAt: new Date(),
    });
    const elsewhere = await newAlert("OPEN", otherMachineId);

    expect((await create(manager.token, { machineId, alertId: taken.id, title: "Second order" })).status).toBe(409);
    expect((await create(manager.token, { machineId, alertId: resolved.id, title: "Closed alert" })).status).toBe(409);
    expect((await create(manager.token, { machineId, alertId: elsewhere.id, title: "Wrong machine" })).status).toBe(409);
  });

  it("runs the whole life of a repair: start, complete, then the system resolves the alert", async () => {
    const ownSensor = (
      await request(app)
        .post("/api/sensors")
        .set(bearer(admin.token))
        .send({ machineId, name: "Spindle speed", type: "rpm", unit: "rpm", thresholds: { max: 3000 } })
    ).body.id as string;
    const alert = await newAlert("ACKNOWLEDGED", machineId, ownSensor);
    const order = (await create(manager.token, { machineId, alertId: alert.id, title: "Tighten spindle", assigneeId: tech.id })).body;

    expect((await request(app).post(`/api/work-orders/${order.id}/start`).set(bearer(tech2.token))).status).toBe(403);
    expect((await request(app).post(`/api/work-orders/${order.id}/start`).set(bearer(viewer.token))).status).toBe(403);
    const started = await request(app).post(`/api/work-orders/${order.id}/start`).set(bearer(tech.token));
    expect(started.body.status).toBe("IN_PROGRESS");
    expect(started.body.startedAt).toBeTruthy();
    expect((await request(app).post(`/api/work-orders/${order.id}/start`).set(bearer(tech.token))).status).toBe(409);

    expect((await request(app).post(`/api/work-orders/${order.id}/complete`).set(bearer(tech.token)).send({})).status).toBe(400);
    expect((await request(app).post(`/api/work-orders/${order.id}/complete`).set(bearer(tech2.token)).send({ actionTaken: "Tightened it" })).status).toBe(403);
    const done = await request(app)
      .post(`/api/work-orders/${order.id}/complete`)
      .set(bearer(tech.token))
      .send({ actionTaken: "Tightened and re-balanced the spindle", partsReplaced: "Bearing 6204", downtimeMinutes: 45 });

    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({
      status: "COMPLETED",
      actionTaken: "Tightened and re-balanced the spindle",
      partsReplaced: "Bearing 6204",
      downtimeMinutes: 45,
    });
    expect(done.body.completedAt).toBeTruthy();

    expect((await Alert.findById(alert.id))?.status).toBe("IN_PROGRESS");
    await applyAlertEvent(
      {
        schemaVersion: 1, orgId: admin.orgId, plantId, machineId, sensorId: ownSensor, rule: "max_exceeded",
        state: "RESOLVED", severity: "critical", message: "Speed is back within its maximum", ts: new Date().toISOString(),
      },
      silentHub,
    );
    expect((await Alert.findById(alert.id))?.status).toBe("RESOLVED");

    expect((await request(app).post(`/api/work-orders/${order.id}/complete`).set(bearer(tech.token)).send({ actionTaken: "Again" })).status).toBe(409);
    expect((await request(app).post(`/api/work-orders/${order.id}/cancel`).set(bearer(manager.token))).status).toBe(409);
    expect((await request(app).patch(`/api/work-orders/${order.id}`).set(bearer(manager.token)).send({ title: "Renamed" })).status).toBe(409);
  });

  it("lets a manager cancel an order, which puts the alert back to acknowledged", async () => {
    const alert = await newAlert("ACKNOWLEDGED");
    const order = (await create(manager.token, { machineId, alertId: alert.id, title: "Wrong plan" })).body;

    expect((await request(app).post(`/api/work-orders/${order.id}/cancel`).set(bearer(tech.token))).status).toBe(403);
    const cancelled = await request(app).post(`/api/work-orders/${order.id}/cancel`).set(bearer(manager.token));

    expect(cancelled.body.status).toBe("CANCELLED");
    const back = await Alert.findById(alert.id);
    expect(back?.status).toBe("ACKNOWLEDGED");
    expect(back?.workOrderId).toBeUndefined();
    expect((await request(app).post(`/api/alerts/${alert.id}/dismiss`).set(bearer(tech.token)).send({ reason: "Plan dropped" })).status).toBe(200);
  });

  it("cannot dismiss an alert while a work order is open on it", async () => {
    const alert = await newAlert("ACKNOWLEDGED");
    await create(manager.token, { machineId, alertId: alert.id, title: "In the works" });

    const res = await request(app).post(`/api/alerts/${alert.id}/dismiss`).set(bearer(tech.token)).send({ reason: "Changed my mind" });

    expect(res.status).toBe(409);
  });

  it("edits, reassigns and unassigns an open order", async () => {
    const order = (await create(manager.token, { machineId, title: "Quarterly inspection", assigneeId: tech.id })).body;

    const changed = await request(app)
      .patch(`/api/work-orders/${order.id}`)
      .set(bearer(manager.token))
      .send({ priority: "low", assigneeId: tech2.id, dueAt: "2026-11-01" });
    expect(changed.body).toMatchObject({ priority: "low", assigneeEmail: "tech2@acme.test" });
    expect(changed.body.dueAt).toBe("2026-11-01T00:00:00.000Z");

    const unassigned = await request(app).patch(`/api/work-orders/${order.id}`).set(bearer(manager.token)).send({ assigneeId: null, dueAt: null });
    expect(unassigned.body).toMatchObject({ assigneeId: null, assigneeEmail: null, dueAt: null });

    expect((await request(app).patch(`/api/work-orders/${order.id}`).set(bearer(manager.token)).send({})).status).toBe(400);
    expect((await request(app).patch(`/api/work-orders/${order.id}`).set(bearer(tech.token)).send({ title: "Not allowed" })).status).toBe(403);
    expect((await request(app).patch(`/api/work-orders/${order.id}`).set(bearer(manager.token)).send({ assigneeId: viewer.id })).status).toBe(400);
  });

  it("lists with filters and never leaks another organization's orders", async () => {
    const mine = await request(app).get("/api/work-orders?mine=true").set(bearer(tech.token));
    expect(mine.status).toBe(200);
    expect(mine.body.every((o: { assigneeEmail: string }) => o.assigneeEmail === "tech@acme.test")).toBe(true);

    const completed = await request(app).get("/api/work-orders?status=COMPLETED").set(bearer(admin.token));
    expect(completed.body.length).toBeGreaterThan(0);
    expect(completed.body.every((o: { status: string }) => o.status === "COMPLETED")).toBe(true);

    const active = await request(app).get("/api/work-orders?status=active").set(bearer(admin.token));
    expect(active.body.every((o: { status: string }) => ["OPEN", "IN_PROGRESS"].includes(o.status))).toBe(true);

    const all = await request(app).get("/api/work-orders?status=all").set(bearer(admin.token));
    expect(all.body.length).toBeGreaterThan(completed.body.length);

    const byMachine = await request(app).get(`/api/work-orders?status=all&machineId=${otherMachineId}`).set(bearer(admin.token));
    expect(byMachine.body).toEqual([]);

    expect((await request(app).get("/api/work-orders?status=all").set(bearer(other.token))).body).toEqual([]);
    expect((await request(app).get("/api/work-orders?status=bogus").set(bearer(admin.token))).status).toBe(400);
    expect((await request(app).get("/api/work-orders")).status).toBe(401);

    const id = all.body[0].id;
    expect((await request(app).get(`/api/work-orders/${id}`).set(bearer(viewer.token))).status).toBe(200);
    expect((await request(app).get(`/api/work-orders/${id}`).set(bearer(other.token))).status).toBe(404);
    expect((await request(app).get("/api/work-orders/abc").set(bearer(admin.token))).status).toBe(404);
  });
});
