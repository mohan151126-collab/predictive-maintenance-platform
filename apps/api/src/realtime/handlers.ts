import { ACTIVE_ALERT_STATUSES, Alert } from "../models/alert.js";
import { Machine } from "../models/machine.js";
import { Sensor } from "../models/sensor.js";
import { toAlertDto } from "./dto.js";
import type { AlertEvent, HealthEvent } from "./events.js";
import type { Hub } from "./hub.js";

export async function applyHealthEvent(event: HealthEvent, hub: Hub) {
  const at = new Date(event.ts);

  const machine = await Machine.findOneAndUpdate(
    {
      _id: event.machineId,
      orgId: event.orgId,
      $or: [{ healthUpdatedAt: { $exists: false } }, { healthUpdatedAt: { $lte: at } }],
    },
    {
      status: event.status,
      healthScore: event.healthScore ?? null,
      healthReasons: event.reasons ?? [],
      healthUpdatedAt: at,
    },
    { returnDocument: "after" },
  );
  if (!machine) return false;

  hub.healthChanged(event.orgId, {
    machineId: event.machineId,
    plantId: machine.plantId.toString(),
    status: machine.status,
    healthScore: machine.healthScore ?? null,
    healthReasons: machine.healthReasons,
    healthUpdatedAt: at.toISOString(),
  });
  return true;
}

export async function applyAlertEvent(event: AlertEvent, hub: Hub) {
  const knownSensor = await Sensor.exists({
    _id: event.sensorId,
    machineId: event.machineId,
    orgId: event.orgId,
  });
  if (!knownSensor) return null;

  const at = new Date(event.ts);
  const active = {
    orgId: event.orgId,
    sensorId: event.sensorId,
    rule: event.rule,
    status: { $in: ACTIVE_ALERT_STATUSES },
  };

  if (event.state === "OPEN") {
    const existing = await Alert.findOneAndUpdate(
      active,
      {
        severity: event.severity,
        value: event.value,
        limit: event.limit,
        message: event.message,
        lastEventAt: at,
      },
      { returnDocument: "after" },
    );
    const alert =
      existing ??
      (await Alert.create({
        orgId: event.orgId,
        plantId: event.plantId,
        machineId: event.machineId,
        sensorId: event.sensorId,
        rule: event.rule,
        severity: event.severity,
        value: event.value,
        limit: event.limit,
        message: event.message,
        openedAt: at,
        lastEventAt: at,
      }));
    hub.alertChanged(event.orgId, toAlertDto(alert));
    return alert;
  }

  const resolved = await Alert.findOneAndUpdate(
    active,
    {
      status: "RESOLVED",
      resolvedAt: at,
      lastEventAt: at,
      resolvedMessage: event.message,
    },
    { returnDocument: "after" },
  );
  if (!resolved) return null;

  hub.alertChanged(event.orgId, toAlertDto(resolved));
  return resolved;
}
