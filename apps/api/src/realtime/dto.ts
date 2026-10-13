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
  machineName: string;
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
  acknowledgedAt: Date | null;
  acknowledgedByEmail: string | null;
  dismissedAt: Date | null;
  dismissedByEmail: string | null;
  dismissReason: string | null;
  workOrderId: string | null;
}

export function toAlertDto(alert: {
  id: string;
  plantId: { toString(): string };
  machineId: { toString(): string };
  machineName: string;
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
  acknowledgedAt?: Date | null;
  acknowledgedByEmail?: string | null;
  dismissedAt?: Date | null;
  dismissedByEmail?: string | null;
  dismissReason?: string | null;
  workOrderId?: { toString(): string } | null;
}): AlertPayload {
  return {
    id: alert.id,
    plantId: alert.plantId.toString(),
    machineId: alert.machineId.toString(),
    machineName: alert.machineName,
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
    acknowledgedAt: alert.acknowledgedAt ?? null,
    acknowledgedByEmail: alert.acknowledgedByEmail ?? null,
    dismissedAt: alert.dismissedAt ?? null,
    dismissedByEmail: alert.dismissedByEmail ?? null,
    dismissReason: alert.dismissReason ?? null,
    workOrderId: alert.workOrderId?.toString() ?? null,
  };
}

export function toWorkOrderDto(order: {
  id: string;
  plantId: { toString(): string };
  machineId: { toString(): string };
  machineName: string;
  alertId?: { toString(): string } | null;
  title: string;
  description?: string | null;
  priority: string;
  status: string;
  assigneeId?: { toString(): string } | null;
  assigneeEmail?: string | null;
  createdByEmail: string;
  dueAt?: Date | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  cancelledAt?: Date | null;
  actionTaken?: string | null;
  partsReplaced?: string | null;
  downtimeMinutes?: number | null;
  createdAt: Date;
}) {
  return {
    id: order.id,
    plantId: order.plantId.toString(),
    machineId: order.machineId.toString(),
    machineName: order.machineName,
    alertId: order.alertId?.toString() ?? null,
    title: order.title,
    description: order.description ?? "",
    priority: order.priority,
    status: order.status,
    assigneeId: order.assigneeId?.toString() ?? null,
    assigneeEmail: order.assigneeEmail ?? null,
    createdByEmail: order.createdByEmail,
    dueAt: order.dueAt ?? null,
    startedAt: order.startedAt ?? null,
    completedAt: order.completedAt ?? null,
    cancelledAt: order.cancelledAt ?? null,
    actionTaken: order.actionTaken ?? null,
    partsReplaced: order.partsReplaced ?? null,
    downtimeMinutes: order.downtimeMinutes ?? null,
    createdAt: order.createdAt,
  };
}
