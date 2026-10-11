import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { isDuplicateKeyError } from "../lib/mongo-errors.js";
import { Machine } from "../models/machine.js";
import { SENSOR_TYPES, Sensor } from "../models/sensor.js";

const objectId = z
  .string()
  .refine((v) => mongoose.isValidObjectId(v), "Invalid id");

const thresholds = z
  .object({
    min: z.number().optional(),
    max: z.number().optional(),
    rateOfChange: z.number().min(0).optional(),
  })
  .refine(
    (t) => t.min === undefined || t.max === undefined || t.min < t.max,
    "min must be less than max",
  );

const fields = {
  name: z.string().trim().min(1).max(100),
  type: z.enum(SENSOR_TYPES),
  unit: z.string().trim().min(1).max(20),
  samplingHz: z.number().min(0.001).max(10_000),
  thresholds,
};

const createSchema = z.object({
  machineId: objectId,
  name: fields.name,
  type: fields.type,
  unit: fields.unit,
  samplingHz: fields.samplingHz.default(1),
  thresholds: fields.thresholds.default({}),
});

const updateSchema = z
  .object(fields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

function toDto(sensor: {
  id: string;
  machineId: { toString(): string };
  name: string;
  type: string;
  unit: string;
  samplingHz: number;
  thresholds?: {
    min?: number | null;
    max?: number | null;
    rateOfChange?: number | null;
  } | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: sensor.id,
    machineId: sensor.machineId.toString(),
    name: sensor.name,
    type: sensor.type,
    unit: sensor.unit,
    samplingHz: sensor.samplingHz,
    thresholds: {
      min: sensor.thresholds?.min ?? null,
      max: sensor.thresholds?.max ?? null,
      rateOfChange: sensor.thresholds?.rateOfChange ?? null,
    },
    createdAt: sensor.createdAt,
    updatedAt: sensor.updatedAt,
  };
}

export const sensorsRouter = Router();

sensorsRouter.use(requireAuth);

sensorsRouter.get("/", async (req, res) => {
  const { orgId } = req.auth!;
  const filter: { orgId: string; machineId?: string } = { orgId };

  if (req.query.machineId !== undefined) {
    const machineId = objectId.safeParse(req.query.machineId);
    if (!machineId.success) {
      res.status(400).json({ error: "Invalid machineId" });
      return;
    }
    filter.machineId = machineId.data;
  }

  const sensors = await Sensor.find(filter).sort({ name: 1 });
  res.json(sensors.map(toDto));
});

sensorsRouter.get("/:id", async (req, res) => {
  const { orgId } = req.auth!;
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    res.status(404).json({ error: "Sensor not found" });
    return;
  }

  const sensor = await Sensor.findOne({ _id: id, orgId });
  if (!sensor) {
    res.status(404).json({ error: "Sensor not found" });
    return;
  }
  res.json(toDto(sensor));
});

sensorsRouter.post(
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

    const machineExists = await Machine.exists({
      _id: parsed.data.machineId,
      orgId,
    });
    if (!machineExists) {
      res.status(404).json({ error: "Machine not found" });
      return;
    }

    try {
      const sensor = await Sensor.create({ ...parsed.data, orgId });
      res.status(201).json(toDto(sensor));
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        res.status(409).json({
          error: "A sensor with this name already exists on this machine",
        });
        return;
      }
      throw err;
    }
  },
);

sensorsRouter.patch(
  "/:id",
  requireRole("admin", "manager"),
  async (req, res) => {
    const { orgId } = req.auth!;
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      res.status(404).json({ error: "Sensor not found" });
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
      const sensor = await Sensor.findOneAndUpdate(
        { _id: id, orgId },
        parsed.data,
        { new: true, runValidators: true },
      );
      if (!sensor) {
        res.status(404).json({ error: "Sensor not found" });
        return;
      }
      res.json(toDto(sensor));
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        res.status(409).json({
          error: "A sensor with this name already exists on this machine",
        });
        return;
      }
      throw err;
    }
  },
);
