import type { Sensor, SensorType } from "./api.js";

export type FaultKind = "overheat" | "vibration" | "spike";

export interface Fault {
  machineName: string;
  kind: FaultKind;
}

const FAULT_KINDS: readonly FaultKind[] = ["overheat", "vibration", "spike"];

const DEFAULT_BASELINE: Record<SensorType, number> = {
  vibration_rms: 2,
  temperature: 60,
  current: 12,
  pressure: 6.5,
  rpm: 1500,
};

export function parseFaults(args: string[]): Fault[] {
  const faults: Fault[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] !== "--fault") continue;
    const spec = args[i + 1] ?? "";
    const split = spec.lastIndexOf("=");
    const machineName = spec.slice(0, split).trim();
    const kind = spec.slice(split + 1).trim();
    if (split < 1 || !FAULT_KINDS.includes(kind as FaultKind)) {
      throw new Error(
        `Invalid --fault "${spec}". Use --fault "Machine name=kind" with kind one of: ${FAULT_KINDS.join(", ")}`,
      );
    }
    faults.push({ machineName, kind: kind as FaultKind });
    i++;
  }
  return faults;
}

export function parseSpeed(args: string[]): number {
  const index = args.indexOf("--speed");
  if (index === -1) return 1;
  const speed = Number(args[index + 1]);
  if (!Number.isFinite(speed) || speed < 1 || speed > 60) {
    throw new Error(`Invalid --speed "${args[index + 1] ?? ""}". Use a number from 1 to 60, for example --speed 6`);
  }
  return speed;
}

function gaussian(): number {
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function baselineOf(sensor: Sensor): number {
  const { min, max } = sensor.thresholds;
  if (min !== null && max !== null) return (min + max) / 2;
  if (max !== null) return max * 0.55;
  if (min !== null) return min + Math.max(Math.abs(min) * 0.5, 1);
  return DEFAULT_BASELINE[sensor.type];
}

export function nextValue(
  sensor: Sensor,
  machineName: string,
  elapsedMinutes: number,
  faults: Fault[],
): number {
  const base = baselineOf(sensor);
  let value =
    base +
    base * 0.02 * Math.sin(elapsedMinutes / 8) +
    gaussian() * Math.abs(base) * 0.01;
  const reference = sensor.thresholds.max ?? Math.abs(base) * 1.8;

  for (const fault of faults) {
    if (fault.machineName !== machineName) continue;
    if (fault.kind === "overheat" && sensor.type === "temperature") {
      value += reference * 0.04 * elapsedMinutes;
    }
    if (fault.kind === "vibration" && sensor.type === "vibration_rms") {
      value *= 1 + 0.15 * elapsedMinutes;
    }
    if (fault.kind === "spike" && Math.random() < 0.02) {
      value += reference * 0.6;
    }
  }
  return Math.round(value * 1000) / 1000;
}
