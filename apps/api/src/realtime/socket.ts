import type { Server as HttpServer } from "node:http";
import mongoose from "mongoose";
import { Server } from "socket.io";
import { verifyAccessToken } from "../auth/tokens.js";
import { Machine } from "../models/machine.js";
import type { Hub } from "./hub.js";

export function attachSocketServer(httpServer: HttpServer, corsOrigin: string) {
  const io = new Server(httpServer, {
    cors: { origin: corsOrigin, credentials: true },
  });

  io.use((socket, next) => {
    const token: unknown = socket.handshake.auth?.token;
    if (typeof token !== "string") {
      next(new Error("unauthorized"));
      return;
    }
    try {
      const { orgId } = verifyAccessToken(token);
      socket.data.orgId = orgId;
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const orgId = socket.data.orgId as string;
    void socket.join(`org:${orgId}`);

    socket.on("machine:subscribe", async (machineId: unknown, ack?: (ok: boolean) => void) => {
      const allowed =
        typeof machineId === "string" &&
        mongoose.isValidObjectId(machineId) &&
        Boolean(await Machine.exists({ _id: machineId, orgId }));
      if (allowed) await socket.join(`machine:${machineId}`);
      ack?.(allowed);
    });

    socket.on("machine:unsubscribe", (machineId: unknown) => {
      if (typeof machineId === "string") void socket.leave(`machine:${machineId}`);
    });
  });

  const hub: Hub = {
    healthChanged(orgId, payload) {
      io.to(`org:${orgId}`).emit("machine:health", payload);
    },
    alertChanged(orgId, payload) {
      io.to(`org:${orgId}`).emit("alert", payload);
    },
    reading(reading) {
      const room = `machine:${reading.machineId}`;
      if ((io.sockets.adapter.rooms.get(room)?.size ?? 0) === 0) return;
      io.to(room).emit("reading", {
        sensorId: reading.sensorId,
        value: reading.value,
        ts: reading.ts,
      });
    },
  };

  return {
    hub,
    close: () => io.close(),
  };
}
