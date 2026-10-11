import bcrypt from "bcryptjs";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { User } from "../src/models/user.js";
import {
  PASSWORD,
  app,
  bearer,
  registerAndLogin,
  setupDb,
  teardownDb,
} from "./helpers.js";

type Session = { token: string; user: { orgId: string } };

let a: Session;
let b: Session;
let viewerToken: string;

beforeAll(async () => {
  await setupDb();
  a = await registerAndLogin("a@acme.test", "Acme");
  b = await registerAndLogin("b@other.test", "Other Co");

  await User.create({
    orgId: a.user.orgId,
    email: "viewer@acme.test",
    passwordHash: await bcrypt.hash(PASSWORD, 4),
    role: "viewer",
  });
  const login = await request(app)
    .post("/api/auth/login")
    .send({ email: "viewer@acme.test", password: PASSWORD });
  viewerToken = login.body.accessToken;
});

afterAll(teardownDb);

async function createPlant(token: string, name: string) {
  const res = await request(app)
    .post("/api/plants")
    .set(bearer(token))
    .send({ name });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

async function createMachine(token: string, plantId: string, name: string) {
  const res = await request(app)
    .post("/api/machines")
    .set(bearer(token))
    .send({ plantId, name, type: "CNC Lathe" });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

async function createSensor(token: string, machineId: string, name: string) {
  const res = await request(app)
    .post("/api/sensors")
    .set(bearer(token))
    .send({ machineId, name, type: "temperature", unit: "C" });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

describe("plants", () => {
  let plantId: string;

  beforeAll(async () => {
    plantId = await createPlant(a.token, "Main Plant");
  });

  it("creates a plant with defaults", async () => {
    const res = await request(app)
      .post("/api/plants")
      .set(bearer(a.token))
      .send({ name: "Defaults Plant" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: "Defaults Plant",
      location: "",
      timezone: "UTC",
    });
  });

  it("requires authentication", async () => {
    const res = await request(app).get("/api/plants");
    expect(res.status).toBe(401);
  });

  it("lets a viewer read but not create", async () => {
    const read = await request(app)
      .get("/api/plants")
      .set(bearer(viewerToken));
    const create = await request(app)
      .post("/api/plants")
      .set(bearer(viewerToken))
      .send({ name: "Not allowed" });

    expect(read.status).toBe(200);
    expect(create.status).toBe(403);
  });

  it("rejects an invalid time zone", async () => {
    const res = await request(app)
      .post("/api/plants")
      .set(bearer(a.token))
      .send({ name: "Bad Zone", timezone: "Mars/Base" });

    expect(res.status).toBe(400);
  });

  it("rejects a duplicate name in the same organization", async () => {
    const res = await request(app)
      .post("/api/plants")
      .set(bearer(a.token))
      .send({ name: "Main Plant" });

    expect(res.status).toBe(409);
  });

  it("allows the same name in another organization", async () => {
    const res = await request(app)
      .post("/api/plants")
      .set(bearer(b.token))
      .send({ name: "Main Plant" });

    expect(res.status).toBe(201);
  });

  it("only lists the caller's own plants", async () => {
    const mine = await request(app).get("/api/plants").set(bearer(a.token));
    const theirs = await request(app).get("/api/plants").set(bearer(b.token));

    const mineIds = mine.body.map((p: { id: string }) => p.id);
    const theirIds = theirs.body.map((p: { id: string }) => p.id);
    expect(mineIds).toContain(plantId);
    expect(theirIds).not.toContain(plantId);
  });

  it("hides other organizations' plants", async () => {
    const get = await request(app)
      .get(`/api/plants/${plantId}`)
      .set(bearer(b.token));
    const patch = await request(app)
      .patch(`/api/plants/${plantId}`)
      .set(bearer(b.token))
      .send({ location: "Hacked" });
    const del = await request(app)
      .delete(`/api/plants/${plantId}`)
      .set(bearer(b.token));

    expect([get.status, patch.status, del.status]).toEqual([404, 404, 404]);
  });

  it("updates only the given fields", async () => {
    const res = await request(app)
      .patch(`/api/plants/${plantId}`)
      .set(bearer(a.token))
      .send({ location: "Chennai, India" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      name: "Main Plant",
      location: "Chennai, India",
      timezone: "UTC",
    });
  });

  it("refuses an empty update", async () => {
    const res = await request(app)
      .patch(`/api/plants/${plantId}`)
      .set(bearer(a.token))
      .send({});

    expect(res.status).toBe(400);
  });

  it("refuses to delete a plant that still has machines", async () => {
    const id = await createPlant(a.token, "Plant With Machine");
    const machineId = await createMachine(a.token, id, "Press 1");

    const blocked = await request(app)
      .delete(`/api/plants/${id}`)
      .set(bearer(a.token));
    expect(blocked.status).toBe(409);

    await request(app)
      .delete(`/api/machines/${machineId}`)
      .set(bearer(a.token))
      .expect(204);
    const deleted = await request(app)
      .delete(`/api/plants/${id}`)
      .set(bearer(a.token));
    expect(deleted.status).toBe(204);
  });
});

describe("machines", () => {
  let plantId: string;
  let otherPlantId: string;
  let machineId: string;

  beforeAll(async () => {
    plantId = await createPlant(a.token, "Machine Plant");
    otherPlantId = await createPlant(a.token, "Second Plant");
    machineId = await createMachine(a.token, plantId, "Lathe 1");
  });

  it("ignores status and healthScore sent by the client", async () => {
    const res = await request(app)
      .post("/api/machines")
      .set(bearer(a.token))
      .send({
        plantId,
        name: "Sneaky",
        type: "Press",
        status: "critical",
        healthScore: 3,
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("unknown");
    expect(res.body.healthScore).toBeNull();
  });

  it("rejects a negative downtime cost and a bad date", async () => {
    const cost = await request(app)
      .post("/api/machines")
      .set(bearer(a.token))
      .send({ plantId, name: "M2", type: "Press", downtimeCostPerHour: -5 });
    const date = await request(app)
      .post("/api/machines")
      .set(bearer(a.token))
      .send({ plantId, name: "M3", type: "Press", installedAt: "yesterday" });

    expect(cost.status).toBe(400);
    expect(date.status).toBe(400);
  });

  it("refuses to add a machine to another organization's plant", async () => {
    const res = await request(app)
      .post("/api/machines")
      .set(bearer(b.token))
      .send({ plantId, name: "Intruder", type: "Press" });

    expect(res.status).toBe(404);
  });

  it("lets a viewer read but not create", async () => {
    const read = await request(app)
      .get("/api/machines")
      .set(bearer(viewerToken));
    const create = await request(app)
      .post("/api/machines")
      .set(bearer(viewerToken))
      .send({ plantId, name: "Not allowed", type: "Press" });

    expect(read.status).toBe(200);
    expect(create.status).toBe(403);
  });

  it("rejects a duplicate name in the same plant but allows it in another", async () => {
    const duplicate = await request(app)
      .post("/api/machines")
      .set(bearer(a.token))
      .send({ plantId, name: "Lathe 1", type: "CNC Lathe" });
    const elsewhere = await request(app)
      .post("/api/machines")
      .set(bearer(a.token))
      .send({ plantId: otherPlantId, name: "Lathe 1", type: "CNC Lathe" });

    expect(duplicate.status).toBe(409);
    expect(elsewhere.status).toBe(201);
  });

  it("filters by plant and rejects a malformed plant id", async () => {
    const filtered = await request(app)
      .get(`/api/machines?plantId=${otherPlantId}`)
      .set(bearer(a.token));
    const bad = await request(app)
      .get("/api/machines?plantId=abc")
      .set(bearer(a.token));

    expect(filtered.status).toBe(200);
    expect(filtered.body).toHaveLength(1);
    expect(bad.status).toBe(400);
  });

  it("hides other organizations' machines", async () => {
    const get = await request(app)
      .get(`/api/machines/${machineId}`)
      .set(bearer(b.token));
    const list = await request(app)
      .get(`/api/machines?plantId=${plantId}`)
      .set(bearer(b.token));

    expect(get.status).toBe(404);
    expect(list.body).toEqual([]);
  });

  it("updates cost and install date, and refuses to change status", async () => {
    const ok = await request(app)
      .patch(`/api/machines/${machineId}`)
      .set(bearer(a.token))
      .send({ downtimeCostPerHour: 900, installedAt: "2023-01-10" });
    const status = await request(app)
      .patch(`/api/machines/${machineId}`)
      .set(bearer(a.token))
      .send({ status: "critical" });

    expect(ok.status).toBe(200);
    expect(ok.body.downtimeCostPerHour).toBe(900);
    expect(ok.body.installedAt).toBe("2023-01-10T00:00:00.000Z");
    expect(status.status).toBe(400);
  });

  it("refuses to delete a machine that still has sensors", async () => {
    const id = await createMachine(a.token, plantId, "Machine With Sensor");
    const sensorId = await createSensor(a.token, id, "Temp");

    const blocked = await request(app)
      .delete(`/api/machines/${id}`)
      .set(bearer(a.token));
    expect(blocked.status).toBe(409);

    await request(app)
      .delete(`/api/sensors/${sensorId}`)
      .set(bearer(a.token))
      .expect(204);
    const deleted = await request(app)
      .delete(`/api/machines/${id}`)
      .set(bearer(a.token));
    expect(deleted.status).toBe(204);
  });
});

describe("sensors", () => {
  let machineId: string;
  let sensorId: string;

  beforeAll(async () => {
    const plantId = await createPlant(a.token, "Sensor Plant");
    machineId = await createMachine(a.token, plantId, "Sensor Machine");
    sensorId = await createSensor(a.token, machineId, "Motor temperature");
  });

  it("creates a sensor with default sampling and empty limits", async () => {
    const res = await request(app)
      .post("/api/sensors")
      .set(bearer(a.token))
      .send({ machineId, name: "Defaults", type: "rpm", unit: "rpm" });

    expect(res.status).toBe(201);
    expect(res.body.samplingHz).toBe(1);
    expect(res.body.thresholds).toEqual({
      min: null,
      max: null,
      rateOfChange: null,
    });
  });

  it("stores alert limits", async () => {
    const res = await request(app)
      .post("/api/sensors")
      .set(bearer(a.token))
      .send({
        machineId,
        name: "Spindle vibration",
        type: "vibration_rms",
        unit: "mm/s",
        thresholds: { max: 7.1, rateOfChange: 2 },
      });

    expect(res.status).toBe(201);
    expect(res.body.thresholds).toEqual({
      min: null,
      max: 7.1,
      rateOfChange: 2,
    });
  });

  it("rejects min >= max, unknown types and non-positive sampling", async () => {
    const limits = await request(app)
      .post("/api/sensors")
      .set(bearer(a.token))
      .send({
        machineId,
        name: "S1",
        type: "temperature",
        unit: "C",
        thresholds: { min: 90, max: 80 },
      });
    const type = await request(app)
      .post("/api/sensors")
      .set(bearer(a.token))
      .send({ machineId, name: "S2", type: "banana", unit: "C" });
    const rate = await request(app)
      .post("/api/sensors")
      .set(bearer(a.token))
      .send({ machineId, name: "S3", type: "rpm", unit: "rpm", samplingHz: 0 });

    expect([limits.status, type.status, rate.status]).toEqual([400, 400, 400]);
  });

  it("rejects a duplicate name on the same machine", async () => {
    const res = await request(app)
      .post("/api/sensors")
      .set(bearer(a.token))
      .send({ machineId, name: "Motor temperature", type: "rpm", unit: "rpm" });

    expect(res.status).toBe(409);
  });

  it("lets a viewer read but not create", async () => {
    const read = await request(app)
      .get(`/api/sensors?machineId=${machineId}`)
      .set(bearer(viewerToken));
    const create = await request(app)
      .post("/api/sensors")
      .set(bearer(viewerToken))
      .send({ machineId, name: "Not allowed", type: "rpm", unit: "rpm" });

    expect(read.status).toBe(200);
    expect(create.status).toBe(403);
  });

  it("refuses to add a sensor to another organization's machine", async () => {
    const res = await request(app)
      .post("/api/sensors")
      .set(bearer(b.token))
      .send({ machineId, name: "Intruder", type: "rpm", unit: "rpm" });

    expect(res.status).toBe(404);
  });

  it("hides other organizations' sensors", async () => {
    const get = await request(app)
      .get(`/api/sensors/${sensorId}`)
      .set(bearer(b.token));
    const del = await request(app)
      .delete(`/api/sensors/${sensorId}`)
      .set(bearer(b.token));
    const list = await request(app).get("/api/sensors").set(bearer(b.token));

    expect(get.status).toBe(404);
    expect(del.status).toBe(404);
    expect(list.body).toEqual([]);
  });

  it("replaces all limits when thresholds are updated", async () => {
    await request(app)
      .patch(`/api/sensors/${sensorId}`)
      .set(bearer(a.token))
      .send({ thresholds: { min: 10, max: 90 } })
      .expect(200);

    const res = await request(app)
      .patch(`/api/sensors/${sensorId}`)
      .set(bearer(a.token))
      .send({ thresholds: { max: 95 } });

    expect(res.status).toBe(200);
    expect(res.body.thresholds).toEqual({
      min: null,
      max: 95,
      rateOfChange: null,
    });
  });

  it("deletes a sensor once, then reports it missing", async () => {
    const id = await createSensor(a.token, machineId, "Short lived");

    const first = await request(app)
      .delete(`/api/sensors/${id}`)
      .set(bearer(a.token));
    const second = await request(app)
      .delete(`/api/sensors/${id}`)
      .set(bearer(a.token));

    expect(first.status).toBe(204);
    expect(second.status).toBe(404);
  });
});
