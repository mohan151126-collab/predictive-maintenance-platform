import { Schema, model } from "mongoose";

export const MACHINE_STATUSES = [
  "unknown",
  "healthy",
  "watch",
  "warning",
  "critical",
] as const;

const machineSchema = new Schema(
  {
    orgId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    plantId: {
      type: Schema.Types.ObjectId,
      ref: "Plant",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    type: { type: String, required: true, trim: true },
    modelNumber: { type: String, trim: true, default: "" },
    installedAt: { type: Date },
    downtimeCostPerHour: { type: Number, min: 0, default: 0 },
    status: { type: String, enum: MACHINE_STATUSES, default: "unknown" },
    healthScore: { type: Number, min: 0, max: 100, default: null },
    healthReasons: { type: [String], default: [] },
    healthUpdatedAt: { type: Date },
  },
  { timestamps: true },
);

machineSchema.index({ plantId: 1, name: 1 }, { unique: true });

export const Machine = model("Machine", machineSchema);
