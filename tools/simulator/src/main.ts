import mqtt from "mqtt";
import { loadFleet } from "./api.js";
import { config } from "./config.js";
import { nextValue, parseFaults } from "./signals.js";

const faults = parseFaults(process.argv.slice(2));
const fleet = await loadFleet();
const machines = new Map(fleet.machines.map((m) => [m.id, m]));

if (fleet.sensors.length === 0) {
  console.error("No sensors found. Add sensors in the web app first.");
  process.exit(1);
}

for (const fault of faults) {
  if (!fleet.machines.some((m) => m.name === fault.machineName)) {
    console.warn(
      `Warning: no machine named "${fault.machineName}", so fault "${fault.kind}" has no effect.`,
    );
  }
}

const client = mqtt.connect(config.MQTT_URL);
await new Promise<void>((resolve, reject) => {
  client.once("connect", () => resolve());
  client.once("error", reject);
});
client.on("error", (err) => console.error("MQTT error:", err.message));

console.log(
  `Connected to ${config.MQTT_URL}. Simulating ${fleet.sensors.length} sensors on ${fleet.machines.length} machines.`,
);
for (const fault of faults) {
  console.log(`Fault active: "${fault.machineName}" = ${fault.kind}`);
}

const startedAt = Date.now();
let published = 0;

const timers = fleet.sensors.flatMap((sensor) => {
  const machine = machines.get(sensor.machineId);
  if (!machine) return [];

  const topic = `plant/${machine.plantId}/machine/${machine.id}/sensor/${sensor.id}`;
  const intervalMs = Math.max(50, Math.round(1000 / sensor.samplingHz));

  return [
    setInterval(() => {
      const elapsedMinutes = (Date.now() - startedAt) / 60_000;
      const reading = {
        schemaVersion: 1,
        orgId: fleet.orgId,
        plantId: machine.plantId,
        machineId: machine.id,
        sensorId: sensor.id,
        type: sensor.type,
        unit: sensor.unit,
        value: nextValue(sensor, machine.name, elapsedMinutes, faults),
        ts: new Date().toISOString(),
      };
      client.publish(topic, JSON.stringify(reading), { qos: 1 });
      published++;
    }, intervalMs),
  ];
});

const statusTimer = setInterval(() => {
  console.log(
    `${new Date().toISOString()} published ${published} readings from ${timers.length} sensors`,
  );
}, 10_000);

function shutdown() {
  clearInterval(statusTimer);
  timers.forEach(clearInterval);
  client.end(false, () => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
