import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { isDuplicateKeyError } from "../lib/mongo-errors.js";
import { Plant } from "../models/plant.js";

function isValidTimezone(tz: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const fields = {
  name: z.string().trim().min(1).max(100),
  location: z.string().trim().max(200),
  timezone: z.string().refine(isValidTimezone, "Invalid time zone"),
};

const createSchema = z.object({
  name: fields.name,
  location: fields.location.default(""),
  timezone: fields.timezone.default("UTC"),
});

const updateSchema = z
  .object(fields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

function toDto(plant: {
  id: string;
  name: string;
  location?: string | null;
  timezone: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: plant.id,
    name: plant.name,
    location: plant.location ?? "",
    timezone: plant.timezone,
    createdAt: plant.createdAt,
    updatedAt: plant.updatedAt,
  };
}

export const plantsRouter = Router();

plantsRouter.use(requireAuth);

plantsRouter.get("/", async (req, res) => {
  const { orgId } = req.auth!;
  const plants = await Plant.find({ orgId }).sort({ name: 1 });
  res.json(plants.map(toDto));
});

plantsRouter.get("/:id", async (req, res) => {
  const { orgId } = req.auth!;
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    res.status(404).json({ error: "Plant not found" });
    return;
  }

  const plant = await Plant.findOne({ _id: id, orgId });
  if (!plant) {
    res.status(404).json({ error: "Plant not found" });
    return;
  }
  res.json(toDto(plant));
});

plantsRouter.post("/", requireRole("admin", "manager"), async (req, res) => {
  const { orgId } = req.auth!;
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "Invalid input", issues: parsed.error.issues });
    return;
  }

  try {
    const plant = await Plant.create({ ...parsed.data, orgId });
    res.status(201).json(toDto(plant));
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      res.status(409).json({ error: "A plant with this name already exists" });
      return;
    }
    throw err;
  }
});

plantsRouter.patch(
  "/:id",
  requireRole("admin", "manager"),
  async (req, res) => {
    const { orgId } = req.auth!;
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      res.status(404).json({ error: "Plant not found" });
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
      const plant = await Plant.findOneAndUpdate(
        { _id: id, orgId },
        parsed.data,
        { new: true, runValidators: true },
      );
      if (!plant) {
        res.status(404).json({ error: "Plant not found" });
        return;
      }
      res.json(toDto(plant));
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        res
          .status(409)
          .json({ error: "A plant with this name already exists" });
        return;
      }
      throw err;
    }
  },
);
