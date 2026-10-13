import { Schema, model } from "mongoose";

export const WORK_ORDER_PRIORITIES = ["low", "medium", "high", "critical"] as const;
export const WORK_ORDER_STATUSES = ["OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;

const ref = (to: string, required = true) => ({
  type: Schema.Types.ObjectId,
  ref: to,
  required,
  index: required,
});

const workOrderSchema = new Schema(
  {
    orgId: ref("Organization"),
    plantId: ref("Plant"),
    machineId: ref("Machine"),
    machineName: { type: String, required: true },
    alertId: { type: Schema.Types.ObjectId, ref: "Alert" },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    priority: { type: String, enum: WORK_ORDER_PRIORITIES, default: "medium", required: true },
    status: { type: String, enum: WORK_ORDER_STATUSES, default: "OPEN", required: true },
    assigneeId: { type: Schema.Types.ObjectId, ref: "User" },
    assigneeEmail: { type: String },
    createdByEmail: { type: String, required: true },
    dueAt: { type: Date },
    startedAt: { type: Date },
    completedAt: { type: Date },
    cancelledAt: { type: Date },
    actionTaken: { type: String },
    partsReplaced: { type: String },
    downtimeMinutes: { type: Number, min: 0 },
  },
  { timestamps: true },
);

workOrderSchema.index({ orgId: 1, status: 1, createdAt: -1 });
workOrderSchema.index({ machineId: 1, status: 1 });

export const WorkOrder = model("WorkOrder", workOrderSchema);
