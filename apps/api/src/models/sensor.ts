import { Schema, model } from "mongoose";

export const SENSOR_TYPES = [
  "vibration_rms",
  "temperature",
  "current",
  "pressure",
  "rpm",
] as const;

const sensorSchema = new Schema(
  {
    orgId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    machineId: {
      type: Schema.Types.ObjectId,
      ref: "Machine",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: SENSOR_TYPES, required: true },
    unit: { type: String, required: true, trim: true },
    samplingHz: { type: Number, required: true, min: 0.001, default: 1 },
    thresholds: {
      min: { type: Number },
      max: { type: Number },
      rateOfChange: { type: Number, min: 0 },
    },
  },
  { timestamps: true },
);

sensorSchema.index({ machineId: 1, name: 1 }, { unique: true });

export const Sensor = model("Sensor", sensorSchema);
