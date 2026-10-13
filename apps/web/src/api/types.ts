export type Role = "admin" | "manager" | "technician" | "viewer";

export interface User {
  id: string;
  email: string;
  role: Role;
  orgId: string;
}

export interface Plant {
  id: string;
  name: string;
  location: string;
  timezone: string;
  createdAt: string;
  updatedAt: string;
}

export type MachineStatus =
  | "unknown"
  | "healthy"
  | "watch"
  | "warning"
  | "critical";

export interface Machine {
  id: string;
  plantId: string;
  name: string;
  type: string;
  modelNumber: string;
  installedAt: string | null;
  downtimeCostPerHour: number;
  status: MachineStatus;
  healthScore: number | null;
  healthReasons: string[];
  healthUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MachineHealth {
  machineId: string;
  plantId: string;
  status: MachineStatus;
  healthScore: number | null;
  healthReasons: string[];
  healthUpdatedAt: string;
}

export type AlertRule =
  | "max_exceeded"
  | "min_exceeded"
  | "rate_of_change"
  | "sensor_offline";

export type AlertStatus =
  | "OPEN"
  | "ACKNOWLEDGED"
  | "IN_PROGRESS"
  | "RESOLVED"
  | "DISMISSED";

export interface Alert {
  id: string;
  plantId: string;
  machineId: string;
  machineName: string;
  sensorId: string;
  rule: AlertRule;
  severity: "warning" | "critical";
  status: AlertStatus;
  value: number | null;
  limit: number | null;
  message: string;
  resolvedMessage: string | null;
  openedAt: string;
  lastEventAt: string;
  resolvedAt: string | null;
}

export interface TelemetrySeries {
  sensorId: string;
  points: { ts: string; value: number }[];
}

export const SENSOR_TYPES = [
  "vibration_rms",
  "temperature",
  "current",
  "pressure",
  "rpm",
] as const;

export type SensorType = (typeof SENSOR_TYPES)[number];

export interface Thresholds {
  min: number | null;
  max: number | null;
  rateOfChange: number | null;
}

export interface Sensor {
  id: string;
  machineId: string;
  name: string;
  type: SensorType;
  unit: string;
  samplingHz: number;
  thresholds: Thresholds;
  createdAt: string;
  updatedAt: string;
}
