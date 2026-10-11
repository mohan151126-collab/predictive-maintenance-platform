import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  PASSWORD,
  app,
  bearer,
  setupDb,
  teardownDb,
} from "./helpers.js";

const EMAIL = "admin@acme.test";

beforeAll(setupDb);
afterAll(teardownDb);

describe("registration", () => {
  it("creates an organization with an admin user", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ organizationName: "Acme Works", email: "Admin@Acme.test", password: PASSWORD });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ email: EMAIL, role: "admin" });
    expect(res.body.passwordHash).toBeUndefined();
  });

  it("rejects a duplicate email", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ organizationName: "Other", email: EMAIL, password: PASSWORD });

    expect(res.status).toBe(409);
  });

  it("rejects invalid input", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ organizationName: "X", email: "not-an-email", password: "123" });

    expect(res.status).toBe(400);
    const fields = res.body.issues.map((i: { path: string[] }) => i.path[0]);
    expect(fields).toEqual(["organizationName", "email", "password"]);
  });

  it("rejects malformed JSON", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .set("Content-Type", "application/json")
      .send("{not json");

    expect(res.status).toBe(400);
  });
});

describe("login", () => {
  it("returns an access token and sets an httpOnly refresh cookie", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: EMAIL, password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ email: EMAIL, role: "admin" });

    const cookies = res.headers["set-cookie"] as unknown as string[];
    expect(cookies[0]).toContain("refresh_token=");
    expect(cookies[0]).toContain("HttpOnly");
  });

  it("gives the same error for a wrong password and an unknown email", async () => {
    const wrongPassword = await request(app)
      .post("/api/auth/login")
      .send({ email: EMAIL, password: "wrong-password" });
    const unknownEmail = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@acme.test", password: PASSWORD });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
  });
});

describe("refresh and logout", () => {
  it("issues a new access token from the refresh cookie", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: EMAIL, password: PASSWORD });

    const res = await agent.post("/api/auth/refresh");
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
  });

  it("refuses to refresh without a cookie", async () => {
    const res = await request(app).post("/api/auth/refresh");
    expect(res.status).toBe(401);
  });

  it("clears the cookie on logout", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: EMAIL, password: PASSWORD });

    const logout = await agent.post("/api/auth/logout");
    expect(logout.status).toBe(204);

    const refresh = await agent.post("/api/auth/refresh");
    expect(refresh.status).toBe(401);
  });
});

describe("GET /api/me", () => {
  it("returns the current user for a valid token", async () => {
    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: EMAIL, password: PASSWORD });

    const res = await request(app)
      .get("/api/me")
      .set(bearer(login.body.accessToken));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ email: EMAIL, role: "admin" });
  });

  it("rejects a missing token", async () => {
    const res = await request(app).get("/api/me");
    expect(res.status).toBe(401);
  });

  it("rejects a fake token", async () => {
    const res = await request(app).get("/api/me").set(bearer("not.a.real.token"));
    expect(res.status).toBe(401);
  });
});
