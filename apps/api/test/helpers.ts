import mongoose from "mongoose";
import request from "supertest";
import { createApp } from "../src/app.js";
import { connectDb, disconnectDb } from "../src/db.js";

export const app = createApp();
export const PASSWORD = "Str0ngPass!234";

export async function setupDb() {
  await connectDb();
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
}

export async function teardownDb() {
  await mongoose.connection.dropDatabase();
  await disconnectDb();
}

export function bearer(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export async function registerAndLogin(email: string, organizationName = "Test Org") {
  await request(app)
    .post("/api/auth/register")
    .send({ organizationName, email, password: PASSWORD })
    .expect(201);

  const res = await request(app)
    .post("/api/auth/login")
    .send({ email, password: PASSWORD })
    .expect(200);

  return {
    token: res.body.accessToken as string,
    user: res.body.user as { id: string; email: string; role: string; orgId: string },
  };
}
