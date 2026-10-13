import { Router, type Request } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { Alert } from "../models/alert.js";
import { Machine } from "../models/machine.js";
import { User } from "../models/user.js";
import {
  WORK_ORDER_PRIORITIES,
  WORK_ORDER_STATUSES,
  WorkOrder,
} from "../models/workOrder.js";
import { toAlertDto, toWorkOrderDto } from "../realtime/dto.js";
import { getHub } from "../realtime/hubRegistry.js";

const objectId = z.string().refine((v) => mongoose.isValidObjectId(v), "Invalid id");
const date = z.iso.date().transform((v) => new Date(v));

const createSchema = z.object({
  machineId: objectId,
  alertId: objectId.optional(),
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(1000).default(""),
  priority: z.enum(WORK_ORDER_PRIORITIES).default("medium"),
  assigneeId: objectId.optional(),
  dueAt: date.optional(),
});

const updateSchema = z
  .object({
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().max(1000),
    priority: z.enum(WORK_ORDER_PRIORITIES),
    assigneeId: objectId.nullable(),
    dueAt: date.nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

const completeSchema = z.object({
  actionTaken: z.string().trim().min(3).max(500),
  partsReplaced: z.string().trim().max(200).optional(),
  downtimeMinutes: z.number().min(0).max(100_000).optional(),
});

const listSchema = z.object({
  status: z.enum(["active", "all", ...WORK_ORDER_STATUSES]).default("active"),
  machineId: objectId.optional(),
  mine: z.enum(["true", "false"]).default("false"),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

const OPEN_STATES = ["OPEN", "IN_PROGRESS"] as const;
const notFound = { error: "Work order not found" };

function canWorkOn(req: Request, order: { assigneeId?: { toString(): string } | null }) {
  const { role, sub } = req.auth!;
  return role === "admin" || role === "manager" || order.assigneeId?.toString() === sub;
}

async function findAssignee(orgId: string, assigneeId: string) {
  const user = await User.findOne({ _id: assigneeId, orgId });
  return user && user.role !== "viewer" ? user : null;
}

export const workOrdersRouter = Router();

workOrdersRouter.use(requireAuth);

workOrdersRouter.get("/", async (req, res) => {
  const { orgId, sub } = req.auth!;
  const parsed = listSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query", issues: parsed.error.issues });
    return;
  }
  const { status, machineId, mine, limit } = parsed.data;

  const filter: Record<string, unknown> = { orgId };
  if (status === "active") filter.status = { $in: OPEN_STATES };
  else if (status !== "all") filter.status = status;
  if (machineId) filter.machineId = machineId;
  if (mine === "true") filter.assigneeId = sub;

  const orders = await WorkOrder.find(filter).sort({ createdAt: -1 }).limit(limit);
  res.json(orders.map(toWorkOrderDto));
});

workOrdersRouter.get("/:id", async (req, res) => {
  const { orgId } = req.auth!;
  const { id } = req.params;
  const order = mongoose.isValidObjectId(id) ? await WorkOrder.findOne({ _id: id, orgId }) : null;
  if (!order) {
    res.status(404).json(notFound);
    return;
  }
  res.json(toWorkOrderDto(order));
});

workOrdersRouter.post("/", requireRole("admin", "manager"), async (req, res) => {
  const { orgId, sub } = req.auth!;
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", issues: parsed.error.issues });
    return;
  }
  const input = parsed.data;

  const machine = await Machine.findOne({ _id: input.machineId, orgId });
  if (!machine) {
    res.status(404).json({ error: "Machine not found" });
    return;
  }

  let assignee = null;
  if (input.assigneeId) {
    assignee = await findAssignee(orgId, input.assigneeId);
    if (!assignee) {
      res.status(400).json({ error: "The assignee must be a technician, manager or admin of your organization" });
      return;
    }
  }

  if (input.alertId) {
    const linkable = await Alert.exists({
      _id: input.alertId,
      orgId,
      machineId: machine._id,
      status: { $in: ["OPEN", "ACKNOWLEDGED"] },
      workOrderId: { $exists: false },
    });
    if (!linkable) {
      res.status(409).json({ error: "That alert is not open or already has a work order" });
      return;
    }
  }

  const creator = await User.findById(sub).select("email");
  const order = await WorkOrder.create({
    orgId,
    plantId: machine.plantId,
    machineId: machine._id,
    machineName: machine.name,
    alertId: input.alertId,
    title: input.title,
    description: input.description,
    priority: input.priority,
    assigneeId: assignee?._id,
    assigneeEmail: assignee?.email,
    createdByEmail: creator?.email ?? "unknown",
    dueAt: input.dueAt,
  });

  if (input.alertId) {
    const alert = await Alert.findOneAndUpdate(
      { _id: input.alertId, orgId },
      { status: "IN_PROGRESS", workOrderId: order._id },
      { returnDocument: "after" },
    );
    if (alert) getHub().alertChanged(orgId, toAlertDto(alert));
  }

  res.status(201).json(toWorkOrderDto(order));
});

workOrdersRouter.patch("/:id", requireRole("admin", "manager"), async (req, res) => {
  const { orgId } = req.auth!;
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    res.status(404).json(notFound);
    return;
  }
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", issues: parsed.error.issues });
    return;
  }
  const { assigneeId, dueAt, ...rest } = parsed.data;

  const changes: Record<string, unknown> = { ...rest };
  if (dueAt !== undefined) changes.dueAt = dueAt;
  if (assigneeId !== undefined) {
    if (assigneeId === null) {
      changes.assigneeId = null;
      changes.assigneeEmail = null;
    } else {
      const assignee = await findAssignee(orgId, assigneeId);
      if (!assignee) {
        res.status(400).json({ error: "The assignee must be a technician, manager or admin of your organization" });
        return;
      }
      changes.assigneeId = assignee._id;
      changes.assigneeEmail = assignee.email;
    }
  }

  const order = await WorkOrder.findOneAndUpdate(
    { _id: id, orgId, status: { $in: OPEN_STATES } },
    changes,
    { returnDocument: "after" },
  );
  if (!order) {
    const exists = await WorkOrder.exists({ _id: id, orgId });
    res.status(exists ? 409 : 404).json(exists ? { error: "A finished work order cannot be edited" } : notFound);
    return;
  }
  res.json(toWorkOrderDto(order));
});

workOrdersRouter.post("/:id/start", async (req, res) => {
  const { orgId } = req.auth!;
  const { id } = req.params;
  const current = mongoose.isValidObjectId(id) ? await WorkOrder.findOne({ _id: id, orgId }) : null;
  if (!current) {
    res.status(404).json(notFound);
    return;
  }
  if (!canWorkOn(req, current)) {
    res.status(403).json({ error: "Only the assignee, a manager or an admin can start this work order" });
    return;
  }

  const order = await WorkOrder.findOneAndUpdate(
    { _id: id, orgId, status: "OPEN" },
    { status: "IN_PROGRESS", startedAt: new Date() },
    { returnDocument: "after" },
  );
  if (!order) {
    res.status(409).json({ error: "Only open work orders can be started" });
    return;
  }
  res.json(toWorkOrderDto(order));
});

workOrdersRouter.post("/:id/complete", async (req, res) => {
  const { orgId } = req.auth!;
  const { id } = req.params;
  const current = mongoose.isValidObjectId(id) ? await WorkOrder.findOne({ _id: id, orgId }) : null;
  if (!current) {
    res.status(404).json(notFound);
    return;
  }
  if (!canWorkOn(req, current)) {
    res.status(403).json({ error: "Only the assignee, a manager or an admin can complete this work order" });
    return;
  }
  const parsed = completeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", issues: parsed.error.issues });
    return;
  }

  const now = new Date();
  const order = await WorkOrder.findOneAndUpdate(
    { _id: id, orgId, status: { $in: OPEN_STATES } },
    {
      status: "COMPLETED",
      completedAt: now,
      startedAt: current.startedAt ?? now,
      ...parsed.data,
    },
    { returnDocument: "after" },
  );
  if (!order) {
    res.status(409).json({ error: "This work order is already finished" });
    return;
  }
  res.json(toWorkOrderDto(order));
});

workOrdersRouter.post("/:id/cancel", requireRole("admin", "manager"), async (req, res) => {
  const { orgId } = req.auth!;
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    res.status(404).json(notFound);
    return;
  }

  const order = await WorkOrder.findOneAndUpdate(
    { _id: id, orgId, status: { $in: OPEN_STATES } },
    { status: "CANCELLED", cancelledAt: new Date() },
    { returnDocument: "after" },
  );
  if (!order) {
    const exists = await WorkOrder.exists({ _id: id, orgId });
    res.status(exists ? 409 : 404).json(exists ? { error: "This work order is already finished" } : notFound);
    return;
  }

  if (order.alertId) {
    const alert = await Alert.findOneAndUpdate(
      { _id: order.alertId, orgId, workOrderId: order._id, status: "IN_PROGRESS" },
      { status: "ACKNOWLEDGED", $unset: { workOrderId: "" } },
      { returnDocument: "after" },
    );
    if (alert) getHub().alertChanged(orgId, toAlertDto(alert));
  }
  res.json(toWorkOrderDto(order));
});
