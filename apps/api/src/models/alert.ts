import { Schema, model } from "mongoose";

export const ALERT_RULES = [
  "max_exceeded",
  "min_exceeded",
  "rate_of_change",
  "sensor_offline",
] as const;

export const ALERT_SEVERITIES = ["warning", "critical"] as const;

export const ALERT_STATUSES = [
  "OPEN",
  "ACKNOWLEDGED",
  "IN_PROGRESS",
  "RESOLVED",
  "DISMISSED",
] as const;

export const ACTIVE_ALERT_STATUSES = ["OPEN", "ACKNOWLEDGED", "IN_PROGRESS"] as const;

const objectId = (ref: string) => ({
  type: Schema.Types.ObjectId,
  ref,
  required: true,
  index: true,
});

const alertSchema = new Schema(
  {
    orgId: objectId("Organization"),
    plantId: objectId("Plant"),
    machineId: objectId("Machine"),
    sensorId: objectId("Sensor"),
    machineName: { type: String, required: true },
    rule: { type: String, enum: ALERT_RULES, required: true },
    severity: { type: String, enum: ALERT_SEVERITIES, required: true },
    status: { type: String, enum: ALERT_STATUSES, default: "OPEN", required: true },
    value: { type: Number },
    limit: { type: Number },
    message: { type: String, required: true },
    resolvedMessage: { type: String },
    openedAt: { type: Date, required: true },
    lastEventAt: { type: Date, required: true },
    resolvedAt: { type: Date },
  },
  { timestamps: true },
);

alertSchema.index({ orgId: 1, status: 1, openedAt: -1 });
alertSchema.index({ sensorId: 1, rule: 1, status: 1 });

export const Alert = model("Alert", alertSchema);
