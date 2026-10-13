export interface MachineHealthPayload {
  machineId: string;
  plantId: string;
  status: string;
  healthScore: number | null;
  healthReasons: string[];
  healthUpdatedAt: string;
}

export interface AlertPayload {
  id: string;
  plantId: string;
  machineId: string;
  sensorId: string;
  rule: string;
  severity: string;
  status: string;
  value: number | null;
  limit: number | null;
  message: string;
  resolvedMessage: string | null;
  openedAt: Date;
  lastEventAt: Date;
  resolvedAt: Date | null;
}

export function toAlertDto(alert: {
  id: string;
  plantId: { toString(): string };
  machineId: { toString(): string };
  sensorId: { toString(): string };
  rule: string;
  severity: string;
  status: string;
  value?: number | null;
  limit?: number | null;
  message: string;
  resolvedMessage?: string | null;
  openedAt: Date;
  lastEventAt: Date;
  resolvedAt?: Date | null;
}): AlertPayload {
  return {
    id: alert.id,
    plantId: alert.plantId.toString(),
    machineId: alert.machineId.toString(),
    sensorId: alert.sensorId.toString(),
    rule: alert.rule,
    severity: alert.severity,
    status: alert.status,
    value: alert.value ?? null,
    limit: alert.limit ?? null,
    message: alert.message,
    resolvedMessage: alert.resolvedMessage ?? null,
    openedAt: alert.openedAt,
    lastEventAt: alert.lastEventAt,
    resolvedAt: alert.resolvedAt ?? null,
  };
}
