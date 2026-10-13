import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { ACTIVE_ALERT_STATUSES, ALERT_STATUSES, Alert } from "../models/alert.js";
import { User } from "../models/user.js";
import { toAlertDto } from "../realtime/dto.js";
import { getHub } from "../realtime/hubRegistry.js";

const objectId = z.string().refine((v) => mongoose.isValidObjectId(v), "Invalid id");

const querySchema = z.object({
  status: z.enum(["active", "all", ...ALERT_STATUSES]).default("active"),
  machineId: objectId.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const alertsRouter = Router();

alertsRouter.use(requireAuth);

alertsRouter.get("/", async (req, res) => {
  const { orgId } = req.auth!;
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query", issues: parsed.error.issues });
    return;
  }
  const { status, machineId, limit } = parsed.data;

  const filter: Record<string, unknown> = { orgId };
  if (status === "active") filter.status = { $in: ACTIVE_ALERT_STATUSES };
  else if (status !== "all") filter.status = status;
  if (machineId) filter.machineId = machineId;

  const alerts = await Alert.find(filter).sort({ openedAt: -1 }).limit(limit);
  res.json(alerts.map(toAlertDto));
});

alertsRouter.get("/:id", async (req, res) => {
  const { orgId } = req.auth!;
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    res.status(404).json({ error: "Alert not found" });
    return;
  }

  const alert = await Alert.findOne({ _id: id, orgId });
  if (!alert) {
    res.status(404).json({ error: "Alert not found" });
    return;
  }
  res.json(toAlertDto(alert));
});

const dismissSchema = z.object({ reason: z.string().trim().min(3).max(300) });

async function emailOf(userId: string) {
  const user = await User.findById(userId).select("email");
  return user?.email ?? "unknown";
}

alertsRouter.post(
  "/:id/acknowledge",
  requireRole("admin", "manager", "technician"),
  async (req, res) => {
    const { orgId, sub } = req.auth!;
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      res.status(404).json({ error: "Alert not found" });
      return;
    }

    const alert = await Alert.findOneAndUpdate(
      { _id: id, orgId, status: "OPEN" },
      {
        status: "ACKNOWLEDGED",
        acknowledgedAt: new Date(),
        acknowledgedByEmail: await emailOf(sub),
      },
      { returnDocument: "after" },
    );
    if (!alert) {
      const exists = await Alert.exists({ _id: id, orgId });
      res
        .status(exists ? 409 : 404)
        .json({ error: exists ? "Only open alerts can be acknowledged" : "Alert not found" });
      return;
    }

    getHub().alertChanged(orgId, toAlertDto(alert));
    res.json(toAlertDto(alert));
  },
);

alertsRouter.post(
  "/:id/dismiss",
  requireRole("admin", "manager", "technician"),
  async (req, res) => {
    const { orgId, sub } = req.auth!;
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      res.status(404).json({ error: "Alert not found" });
      return;
    }

    const parsed = dismissSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input", issues: parsed.error.issues });
      return;
    }

    const alert = await Alert.findOneAndUpdate(
      { _id: id, orgId, status: { $in: ["OPEN", "ACKNOWLEDGED"] } },
      {
        status: "DISMISSED",
        dismissedAt: new Date(),
        dismissedByEmail: await emailOf(sub),
        dismissReason: parsed.data.reason,
      },
      { returnDocument: "after" },
    );
    if (!alert) {
      const exists = await Alert.exists({ _id: id, orgId });
      res.status(exists ? 409 : 404).json({
        error: exists
          ? "Only open or acknowledged alerts can be dismissed. Cancel its work order first."
          : "Alert not found",
      });
      return;
    }

    getHub().alertChanged(orgId, toAlertDto(alert));
    res.json(toAlertDto(alert));
  },
);
