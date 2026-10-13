import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import mongoose from "mongoose";
import request from "supertest";
import { io as connect, type Socket } from "socket.io-client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Alert } from "../src/models/alert.js";
import { TOPICS, handleMessage } from "../src/realtime/consumer.js";
import type { ReadingEvent } from "../src/realtime/events.js";
import { silentHub, type Hub } from "../src/realtime/hub.js";
import { attachSocketServer } from "../src/realtime/socket.js";
import { app, bearer, registerAndLogin, setupDb, teardownDb } from "./helpers.js";

type Session = { token: string; orgId: string; plantId: string; machineId: string; sensorId: string };

async function createFleet(email: string, org: string): Promise<Session> {
  const { token, user } = await registerAndLogin(email, org);
  const plantId = (await request(app).post("/api/plants").set(bearer(token)).send({ name: "Plant" })).body.id;
  const machineId = (
    await request(app).post("/api/machines").set(bearer(token)).send({ plantId, name: "Lathe", type: "CNC" })
  ).body.id;
  const sensorId = (
    await request(app)
      .post("/api/sensors")
      .set(bearer(token))
      .send({ machineId, name: "Vibration", type: "vibration_rms", unit: "mm/s", thresholds: { max: 9 } })
  ).body.id;
  return { token, orgId: user.orgId, plantId, machineId, sensorId };
}

let a: Session;
let b: Session;

beforeAll(async () => {
  await setupDb();
  a = await createFleet("a@acme.test", "Acme");
  b = await createFleet("b@other.test", "Other");
});

afterAll(teardownDb);

describe("GET /api/alerts", () => {
  beforeAll(async () => {
    const base = { rule: "max_exceeded", severity: "critical", message: "x", machineName: "Lathe" };
    await Alert.create([
      { ...base, orgId: a.orgId, plantId: a.plantId, machineId: a.machineId, sensorId: a.sensorId, status: "OPEN", openedAt: new Date("2026-10-13T10:00:00Z"), lastEventAt: new Date("2026-10-13T10:00:00Z") },
      { ...base, rule: "rate_of_change", severity: "warning", orgId: a.orgId, plantId: a.plantId, machineId: a.machineId, sensorId: a.sensorId, status: "ACKNOWLEDGED", openedAt: new Date("2026-10-13T11:00:00Z"), lastEventAt: new Date("2026-10-13T11:00:00Z") },
      { ...base, orgId: a.orgId, plantId: a.plantId, machineId: a.machineId, sensorId: a.sensorId, status: "RESOLVED", openedAt: new Date("2026-10-13T09:00:00Z"), lastEventAt: new Date("2026-10-13T09:30:00Z"), resolvedAt: new Date("2026-10-13T09:30:00Z") },
      { ...base, orgId: b.orgId, plantId: b.plantId, machineId: b.machineId, sensorId: b.sensorId, status: "OPEN", openedAt: new Date("2026-10-13T12:00:00Z"), lastEventAt: new Date("2026-10-13T12:00:00Z") },
    ]);
  });

  it("requires authentication", async () => {
    expect((await request(app).get("/api/alerts")).status).toBe(401);
  });

  it("lists active alerts of the organization, newest first", async () => {
    const res = await request(app).get("/api/alerts").set(bearer(a.token));

    expect(res.status).toBe(200);
    expect(res.body.map((x: { status: string }) => x.status)).toEqual(["ACKNOWLEDGED", "OPEN"]);
    expect(res.body[0]).toMatchObject({ machineId: a.machineId, sensorId: a.sensorId, value: null, resolvedAt: null });
  });

  it("never shows another organization's alerts", async () => {
    const res = await request(app).get("/api/alerts?status=all").set(bearer(a.token));

    expect(res.body).toHaveLength(3);
    expect(res.body.every((x: { machineId: string }) => x.machineId === a.machineId)).toBe(true);
  });

  it("filters by status and machine", async () => {
    const resolved = await request(app).get("/api/alerts?status=RESOLVED").set(bearer(a.token));
    expect(resolved.body).toHaveLength(1);

    const otherMachine = await request(app).get(`/api/alerts?status=all&machineId=${b.machineId}`).set(bearer(a.token));
    expect(otherMachine.body).toEqual([]);
  });

  it("rejects a bad query", async () => {
    expect((await request(app).get("/api/alerts?status=bogus").set(bearer(a.token))).status).toBe(400);
    expect((await request(app).get("/api/alerts?machineId=abc").set(bearer(a.token))).status).toBe(400);
    expect((await request(app).get("/api/alerts?limit=0").set(bearer(a.token))).status).toBe(400);
  });

  it("returns one alert and hides other organizations' alerts", async () => {
    const list = await request(app).get("/api/alerts?status=all").set(bearer(a.token));
    const id = list.body[0].id;

    expect((await request(app).get(`/api/alerts/${id}`).set(bearer(a.token))).status).toBe(200);
    expect((await request(app).get(`/api/alerts/${id}`).set(bearer(b.token))).status).toBe(404);
    expect((await request(app).get("/api/alerts/abc").set(bearer(a.token))).status).toBe(404);
  });
});

describe("GET /api/machines/:id/telemetry", () => {
  beforeAll(async () => {
    const now = Date.now();
    const row = (sensorId: string, machineId: string, minutesAgo: number, value: number) => ({
      ts: new Date(now - minutesAgo * 60_000),
      meta: { orgId: "x", plantId: "x", machineId, sensorId, type: "vibration_rms" },
      value,
    });
    await mongoose.connection.collection("telemetry").insertMany([
      row(a.sensorId, a.machineId, 20, 1),
      row(a.sensorId, a.machineId, 10, 2),
      row(a.sensorId, a.machineId, 5, 3),
      row("cccccccccccccccccccccccc", a.machineId, 4, 40),
      row(b.sensorId, b.machineId, 5, 99),
    ]);
  });

  it("returns the last 15 minutes grouped by sensor, oldest first", async () => {
    const res = await request(app).get(`/api/machines/${a.machineId}/telemetry`).set(bearer(a.token));

    expect(res.status).toBe(200);
    const mine = res.body.sensors.find((s: { sensorId: string }) => s.sensorId === a.sensorId);
    expect(mine.points.map((p: { value: number }) => p.value)).toEqual([2, 3]);
    expect(res.body.sensors).toHaveLength(2);
  });

  it("can look further back", async () => {
    const res = await request(app).get(`/api/machines/${a.machineId}/telemetry?minutes=30`).set(bearer(a.token));

    const mine = res.body.sensors.find((s: { sensorId: string }) => s.sensorId === a.sensorId);
    expect(mine.points.map((p: { value: number }) => p.value)).toEqual([1, 2, 3]);
  });

  it("hides other organizations' machines", async () => {
    expect((await request(app).get(`/api/machines/${b.machineId}/telemetry`).set(bearer(a.token))).status).toBe(404);
  });

  it("rejects a bad window and requires authentication", async () => {
    expect((await request(app).get(`/api/machines/${a.machineId}/telemetry?minutes=0`).set(bearer(a.token))).status).toBe(400);
    expect((await request(app).get(`/api/machines/${a.machineId}/telemetry?minutes=61`).set(bearer(a.token))).status).toBe(400);
    expect((await request(app).get(`/api/machines/${a.machineId}/telemetry`)).status).toBe(401);
  });
});

describe("handling Kafka messages", () => {
  const recorded: ReadingEvent[] = [];
  const hub: Hub = { ...silentHub, reading: (r) => recorded.push(r) };

  it("applies a valid machine.health message", async () => {
    await handleMessage(
      TOPICS.health,
      JSON.stringify({
        schemaVersion: 1,
        orgId: a.orgId,
        plantId: a.plantId,
        machineId: a.machineId,
        status: "watch",
        healthScore: 70,
        reasons: ["Vibration is at 85% of its limit"],
        ts: "2026-10-13T12:00:00.000Z",
      }),
      hub,
    );

    const res = await request(app).get(`/api/machines/${a.machineId}`).set(bearer(a.token));
    expect(res.body).toMatchObject({ status: "watch", healthScore: 70 });
  });

  it("skips broken or invalid messages without throwing", async () => {
    await expect(handleMessage(TOPICS.health, "{not json", hub)).resolves.toBeUndefined();
    await expect(handleMessage(TOPICS.alerts, JSON.stringify({ nope: true }), hub)).resolves.toBeUndefined();
    await expect(handleMessage(TOPICS.health, JSON.stringify({ schemaVersion: 1 }), hub)).resolves.toBeUndefined();
    await expect(handleMessage("some.other.topic", "{}", hub)).resolves.toBeUndefined();

    const res = await request(app).get(`/api/machines/${a.machineId}`).set(bearer(a.token));
    expect(res.body.status).toBe("watch");
  });

  it("forwards valid readings to the hub and drops invalid ones", async () => {
    const reading = {
      schemaVersion: 1,
      orgId: a.orgId,
      plantId: a.plantId,
      machineId: a.machineId,
      sensorId: a.sensorId,
      type: "vibration_rms",
      unit: "mm/s",
      value: 4.2,
      ts: "2026-10-13T12:00:01.000Z",
    };

    await handleMessage(TOPICS.telemetry, JSON.stringify(reading), hub);
    await handleMessage(TOPICS.telemetry, JSON.stringify({ ...reading, value: "4.2" }), hub);

    expect(recorded).toHaveLength(1);
    expect(recorded[0]?.value).toBe(4.2);
  });
});

describe("live updates over Socket.IO", () => {
  let httpServer: Server;
  let url: string;
  let hub: Hub;
  let closeSockets: () => Promise<void> | void;
  const open: Socket[] = [];

  beforeAll(async () => {
    httpServer = createServer();
    const sockets = attachSocketServer(httpServer, "http://localhost:5173");
    hub = sockets.hub;
    closeSockets = sockets.close;
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    url = `http://localhost:${(httpServer.address() as AddressInfo).port}`;
  });

  afterEach(() => {
    open.splice(0).forEach((s) => s.disconnect());
  });

  afterAll(async () => {
    await closeSockets();
    httpServer.close();
  });

  function client(token?: string) {
    const socket = connect(url, { auth: token ? { token } : {}, transports: ["websocket"], reconnection: false });
    open.push(socket);
    return socket;
  }

  const connected = (s: Socket) => new Promise<void>((resolve, reject) => {
    s.once("connect", () => resolve());
    s.once("connect_error", (e) => reject(e));
  });

  const nextEvent = <T>(s: Socket, name: string, ms = 1500) =>
    new Promise<T | undefined>((resolve) => {
      const timer = setTimeout(() => resolve(undefined), ms);
      s.once(name, (payload: T) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });

  const health = (machineId: string, plantId: string) => ({
    machineId,
    plantId,
    status: "critical",
    healthScore: 0,
    healthReasons: ["x"],
    healthUpdatedAt: "2026-10-13T12:00:00.000Z",
  });

  it("refuses a connection without a valid token", async () => {
    await expect(connected(client())).rejects.toThrow("unauthorized");
    await expect(connected(client("not.a.token"))).rejects.toThrow("unauthorized");
  });

  it("sends health changes only to the organization they belong to", async () => {
    const mine = client(a.token);
    const theirs = client(b.token);
    await Promise.all([connected(mine), connected(theirs)]);
    const gotMine = nextEvent<{ machineId: string }>(mine, "machine:health");
    const gotTheirs = nextEvent(theirs, "machine:health", 400);

    hub.healthChanged(a.orgId, health(a.machineId, a.plantId));

    expect((await gotMine)?.machineId).toBe(a.machineId);
    expect(await gotTheirs).toBeUndefined();
  });

  it("sends alert changes only to the organization they belong to", async () => {
    const mine = client(a.token);
    const theirs = client(b.token);
    await Promise.all([connected(mine), connected(theirs)]);
    const gotMine = nextEvent<{ id: string }>(mine, "alert");
    const gotTheirs = nextEvent(theirs, "alert", 400);

    hub.alertChanged(a.orgId, { id: "1" } as never);

    expect((await gotMine)?.id).toBe("1");
    expect(await gotTheirs).toBeUndefined();
  });

  it("delivers live readings only to clients that subscribed to that machine", async () => {
    const subscribed = client(a.token);
    const notSubscribed = client(a.token);
    await Promise.all([connected(subscribed), connected(notSubscribed)]);
    const ok = await new Promise<boolean>((resolve) => subscribed.emit("machine:subscribe", a.machineId, resolve));
    expect(ok).toBe(true);
    const got = nextEvent<{ sensorId: string; value: number }>(subscribed, "reading");
    const missed = nextEvent(notSubscribed, "reading", 400);

    hub.reading({
      schemaVersion: 1,
      orgId: a.orgId,
      plantId: a.plantId,
      machineId: a.machineId,
      sensorId: a.sensorId,
      type: "vibration_rms",
      unit: "mm/s",
      value: 5.5,
      ts: "2026-10-13T12:00:02.000Z",
    });

    expect(await got).toEqual({ sensorId: a.sensorId, value: 5.5, ts: "2026-10-13T12:00:02.000Z" });
    expect(await missed).toBeUndefined();
  });

  it("refuses to subscribe to another organization's machine or a bad id", async () => {
    const socket = client(a.token);
    await connected(socket);

    const other = await new Promise<boolean>((resolve) => socket.emit("machine:subscribe", b.machineId, resolve));
    const bad = await new Promise<boolean>((resolve) => socket.emit("machine:subscribe", "abc", resolve));
    const notText = await new Promise<boolean>((resolve) => socket.emit("machine:subscribe", 42, resolve));

    expect([other, bad, notText]).toEqual([false, false, false]);
  });

  it("stops live readings after unsubscribing", async () => {
    const socket = client(a.token);
    await connected(socket);
    await new Promise<boolean>((resolve) => socket.emit("machine:subscribe", a.machineId, resolve));
    socket.emit("machine:unsubscribe", a.machineId);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const missed = nextEvent(socket, "reading", 400);

    hub.reading({
      schemaVersion: 1,
      orgId: a.orgId,
      plantId: a.plantId,
      machineId: a.machineId,
      sensorId: a.sensorId,
      type: "vibration_rms",
      unit: "mm/s",
      value: 1,
      ts: "2026-10-13T12:00:03.000Z",
    });

    expect(await missed).toBeUndefined();
  });
});
