import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { isDuplicateKeyError } from "../lib/mongo-errors.js";
import { Machine } from "../models/machine.js";
import { Plant } from "../models/plant.js";
import { Sensor } from "../models/sensor.js";

const objectId = z
  .string()
  .refine((v) => mongoose.isValidObjectId(v), "Invalid id");

const fields = {
  name: z.string().trim().min(1).max(100),
  type: z.string().trim().min(1).max(50),
  modelNumber: z.string().trim().max(100),
  installedAt: z.iso.date().transform((v) => new Date(v)),
  downtimeCostPerHour: z.number().min(0).max(1_000_000),
};

const createSchema = z.object({
  plantId: objectId,
  name: fields.name,
  type: fields.type,
  modelNumber: fields.modelNumber.default(""),
  installedAt: fields.installedAt.optional(),
  downtimeCostPerHour: fields.downtimeCostPerHour.default(0),
});

const updateSchema = z
  .object(fields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

function toDto(machine: {
  id: string;
  plantId: { toString(): string };
  name: string;
  type: string;
  modelNumber?: string | null;
  installedAt?: Date | null;
  downtimeCostPerHour?: number | null;
  status: string;
  healthScore?: number | null;
  healthReasons?: string[] | null;
  healthUpdatedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: machine.id,
    plantId: machine.plantId.toString(),
    name: machine.name,
    type: machine.type,
    modelNumber: machine.modelNumber ?? "",
    installedAt: machine.installedAt ?? null,
    downtimeCostPerHour: machine.downtimeCostPerHour ?? 0,
    status: machine.status,
    healthScore: machine.healthScore ?? null,
    healthReasons: machine.healthReasons ?? [],
    healthUpdatedAt: machine.healthUpdatedAt ?? null,
    createdAt: machine.createdAt,
    updatedAt: machine.updatedAt,
  };
}

export const machinesRouter = Router();

machinesRouter.use(requireAuth);

machinesRouter.get("/", async (req, res) => {
  const { orgId } = req.auth!;
  const filter: { orgId: string; plantId?: string } = { orgId };

  if (req.query.plantId !== undefined) {
    const plantId = objectId.safeParse(req.query.plantId);
    if (!plantId.success) {
      res.status(400).json({ error: "Invalid plantId" });
      return;
    }
    filter.plantId = plantId.data;
  }

  const machines = await Machine.find(filter).sort({ name: 1 });
  res.json(machines.map(toDto));
});

machinesRouter.get("/:id", async (req, res) => {
  const { orgId } = req.auth!;
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    res.status(404).json({ error: "Machine not found" });
    return;
  }

  const machine = await Machine.findOne({ _id: id, orgId });
  if (!machine) {
    res.status(404).json({ error: "Machine not found" });
    return;
  }
  res.json(toDto(machine));
});

const telemetryQuerySchema = z.object({
  minutes: z.coerce.number().int().min(1).max(60).default(15),
});

machinesRouter.get("/:id/telemetry", async (req, res) => {
  const { orgId } = req.auth!;
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id) || !(await Machine.exists({ _id: id, orgId }))) {
    res.status(404).json({ error: "Machine not found" });
    return;
  }

  const query = telemetryQuerySchema.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "Invalid query", issues: query.error.issues });
    return;
  }

  const since = new Date(Date.now() - query.data.minutes * 60_000);
  const rows = await mongoose.connection
    .collection("telemetry")
    .find(
      { "meta.machineId": id, ts: { $gte: since } },
      { projection: { _id: 0, ts: 1, value: 1, "meta.sensorId": 1 } },
    )
    .sort({ ts: 1 })
    .limit(20_000)
    .toArray();

  const bySensor = new Map<string, { ts: Date; value: number }[]>();
  for (const row of rows) {
    const sensorId = String(row.meta?.sensorId);
    const points = bySensor.get(sensorId) ?? [];
    points.push({ ts: row.ts as Date, value: row.value as number });
    bySensor.set(sensorId, points);
  }

  res.json({
    sensors: [...bySensor.entries()].map(([sensorId, points]) => ({ sensorId, points })),
  });
});

machinesRouter.post(
  "/",
  requireRole("admin", "manager"),
  async (req, res) => {
    const { orgId } = req.auth!;
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: "Invalid input", issues: parsed.error.issues });
      return;
    }

    const plantExists = await Plant.exists({
      _id: parsed.data.plantId,
      orgId,
    });
    if (!plantExists) {
      res.status(404).json({ error: "Plant not found" });
      return;
    }

    try {
      const machine = await Machine.create({ ...parsed.data, orgId });
      res.status(201).json(toDto(machine));
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        res
          .status(409)
          .json({ error: "A machine with this name already exists in this plant" });
        return;
      }
      throw err;
    }
  },
);

machinesRouter.patch(
  "/:id",
  requireRole("admin", "manager"),
  async (req, res) => {
    const { orgId } = req.auth!;
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      res.status(404).json({ error: "Machine not found" });
      return;
    }

    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: "Invalid input", issues: parsed.error.issues });
      return;
    }

    try {
      const machine = await Machine.findOneAndUpdate(
        { _id: id, orgId },
        parsed.data,
        { returnDocument: "after", runValidators: true },
      );
      if (!machine) {
        res.status(404).json({ error: "Machine not found" });
        return;
      }
      res.json(toDto(machine));
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        res
          .status(409)
          .json({ error: "A machine with this name already exists in this plant" });
        return;
      }
      throw err;
    }
  },
);
machinesRouter.delete(
  "/:id",
  requireRole("admin", "manager"),
  async (req, res) => {
    const { orgId } = req.auth!;
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      res.status(404).json({ error: "Machine not found" });
      return;
    }

    const machine = await Machine.findOne({ _id: id, orgId });
    if (!machine) {
      res.status(404).json({ error: "Machine not found" });
      return;
    }

    if (await Sensor.exists({ machineId: machine._id, orgId })) {
      res
        .status(409)
        .json({ error: "Delete this machine's sensors first" });
      return;
    }

    await machine.deleteOne();
    res.status(204).end();
  },
);
