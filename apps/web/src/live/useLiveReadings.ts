import { useEffect, useMemo, useState } from "react";
import { useTelemetry } from "../api/hooks";
import { useLive } from "./LiveContext";

export interface Point {
  t: number;
  v: number;
}

export const WINDOW_MINUTES = 5;
const WINDOW_MS = WINDOW_MINUTES * 60_000;

interface LiveReading {
  sensorId: string;
  value: number;
  ts: string;
}

export function useLiveReadings(machineId: string) {
  const { socket } = useLive();
  const history = useTelemetry(machineId, WINDOW_MINUTES);
  const [live, setLive] = useState<Record<string, Point[]>>({});

  useEffect(() => {
    setLive({});
  }, [machineId]);

  useEffect(() => {
    if (!socket || machineId === "") return;

    const subscribe = () => socket.emit("machine:subscribe", machineId);
    const onReading = (reading: LiveReading) => {
      const t = Date.parse(reading.ts);
      setLive((previous) => {
        const kept = (previous[reading.sensorId] ?? []).filter((p) => p.t >= t - WINDOW_MS);
        return { ...previous, [reading.sensorId]: [...kept, { t, v: reading.value }] };
      });
    };

    subscribe();
    socket.on("connect", subscribe);
    socket.on("reading", onReading);
    return () => {
      socket.off("connect", subscribe);
      socket.off("reading", onReading);
      socket.emit("machine:unsubscribe", machineId);
    };
  }, [socket, machineId]);

  const series = useMemo(() => {
    const merged: Record<string, Point[]> = {};

    for (const sensor of history.data?.sensors ?? []) {
      merged[sensor.sensorId] = sensor.points.map((p) => ({ t: Date.parse(p.ts), v: p.value }));
    }
    for (const [sensorId, points] of Object.entries(live)) {
      merged[sensorId] = [...(merged[sensorId] ?? []), ...points];
    }

    for (const [sensorId, points] of Object.entries(merged)) {
      const sorted = [...points].sort((a, b) => a.t - b.t);
      const unique = sorted.filter((p, i) => i === 0 || p.t !== sorted[i - 1]!.t);
      const latest = unique.at(-1)?.t ?? 0;
      merged[sensorId] = unique.filter((p) => p.t >= latest - WINDOW_MS);
    }
    return merged;
  }, [history.data, live]);

  return { series, loading: history.isPending };
}
