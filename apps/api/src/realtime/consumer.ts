import { randomUUID } from "node:crypto";
import { Kafka, logLevel, type Consumer } from "kafkajs";
import { alertEventSchema, healthEventSchema, readingSchema } from "./events.js";
import { applyAlertEvent, applyHealthEvent } from "./handlers.js";
import type { Hub } from "./hub.js";

export const TOPICS = {
  telemetry: "telemetry.raw",
  alerts: "alerts",
  health: "machine.health",
} as const;

export async function handleMessage(topic: string, value: string, hub: Hub) {
  let json: unknown;
  try {
    json = JSON.parse(value);
  } catch {
    console.warn(`Skipping a message on ${topic}: not valid JSON`);
    return;
  }

  if (topic === TOPICS.health) {
    const parsed = healthEventSchema.safeParse(json);
    if (!parsed.success) {
      console.warn(`Skipping an invalid ${topic} message: ${parsed.error.message}`);
      return;
    }
    await applyHealthEvent(parsed.data, hub);
  } else if (topic === TOPICS.alerts) {
    const parsed = alertEventSchema.safeParse(json);
    if (!parsed.success) {
      console.warn(`Skipping an invalid ${topic} message: ${parsed.error.message}`);
      return;
    }
    await applyAlertEvent(parsed.data, hub);
  } else if (topic === TOPICS.telemetry) {
    const parsed = readingSchema.safeParse(json);
    if (parsed.success) hub.reading(parsed.data);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function startKafkaBridge(options: { brokers: string[]; hub: Hub }) {
  const kafka = new Kafka({
    clientId: "pm-api",
    brokers: options.brokers,
    logLevel: logLevel.WARN,
  });

  const consumers: Consumer[] = [];
  let stopped = false;

  async function start(groupId: string, topics: string[]) {
    while (!stopped) {
      const consumer = kafka.consumer({ groupId });
      try {
        await consumer.connect();
        for (const topic of topics) {
          await consumer.subscribe({ topic, fromBeginning: false });
        }
        await consumer.run({
          eachMessage: async ({ topic, message }) => {
            if (message.value) {
              await handleMessage(topic, message.value.toString("utf8"), options.hub);
            }
          },
        });
        consumers.push(consumer);
        console.log(`Kafka consumer ${groupId} listening to ${topics.join(", ")}`);
        return;
      } catch (err) {
        console.warn(`Kafka consumer ${groupId} could not start, retrying in 5 s:`, (err as Error).message);
        await consumer.disconnect().catch(() => {});
        await sleep(5000);
      }
    }
  }

  void start("pm-api", [TOPICS.health, TOPICS.alerts]);
  void start(`pm-api-live-${randomUUID()}`, [TOPICS.telemetry]);

  return {
    async stop() {
      stopped = true;
      await Promise.all(consumers.map((consumer) => consumer.disconnect().catch(() => {})));
    },
  };
}
