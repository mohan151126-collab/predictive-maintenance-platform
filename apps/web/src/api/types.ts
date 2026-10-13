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
  createdAt: string;
  updatedAt: string;
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
