import { z } from "zod";
import { ALERT_RULES, ALERT_SEVERITIES } from "../models/alert.js";
import { MACHINE_STATUSES } from "../models/machine.js";
import { SENSOR_TYPES } from "../models/sensor.js";

const id = z.string().regex(/^[a-f0-9]{24}$/);
const timestamp = z.iso.datetime();

export const alertEventSchema = z.strictObject({
  schemaVersion: z.literal(1),
  orgId: id,
  plantId: id,
  machineId: id,
  sensorId: id,
  rule: z.enum(ALERT_RULES),
  state: z.enum(["OPEN", "RESOLVED"]),
  severity: z.enum(ALERT_SEVERITIES),
  value: z.number().optional(),
  limit: z.number().optional(),
  message: z.string().min(1).max(300),
  ts: timestamp,
});

export const healthEventSchema = z.strictObject({
  schemaVersion: z.literal(1),
  orgId: id,
  plantId: id,
  machineId: id,
  status: z.enum(MACHINE_STATUSES),
  healthScore: z.number().int().min(0).max(100).optional(),
  worstSensorId: id.optional(),
  reasons: z.array(z.string().min(1).max(200)).max(10).optional(),
  ts: timestamp,
});

export const readingSchema = z.strictObject({
  schemaVersion: z.literal(1),
  orgId: id,
  plantId: id,
  machineId: id,
  sensorId: id,
  type: z.enum(SENSOR_TYPES),
  unit: z.string().min(1).max(20),
  value: z.number(),
  ts: timestamp,
});

export type AlertEvent = z.infer<typeof alertEventSchema>;
export type HealthEvent = z.infer<typeof healthEventSchema>;
export type ReadingEvent = z.infer<typeof readingSchema>;
