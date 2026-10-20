import { useEffect, useId, useRef, useState } from "react";
import { WINDOW_MINUTES, type Point } from "../live/useLiveReadings";

interface LiveChartProps {
  title: string;
  unit: string;
  points: Point[];
  min: number | null;
  max: number | null;
  paused?: boolean;
}

const STALE_MS = 5_000;
const INITIAL_SIZE = 360;
const HEIGHT = 190;
const MARGIN = { top: 12, right: 14, bottom: 26, left: 52 };
const MIN_SPAN_MS = 10_000;
const X_TICKS = [1, 0.75, 0.5, 0.25, 0];

function ago(ms: number) {
  if (ms < 1000) return "now";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `-${seconds} s`;
  return `-${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function niceStep(range: number, ticks: number) {
  const rough = range / ticks;
  const power = 10 ** Math.floor(Math.log10(rough));
  const fraction = rough / power;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return nice * power;
}

function readout(value: number) {
  return Number(value.toFixed(2)).toString();
}

function format(value: number, step: number) {
  const decimals = step >= 1 ? 0 : Math.min(3, Math.ceil(-Math.log10(step)));
  return value.toFixed(decimals);
}

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

export function LiveChart({ title, unit, points, min, max, paused = false }: LiveChartProps) {
  const panel = useRef<HTMLDivElement>(null);
  const gradientId = `fill-${useId().replace(/:/g, "")}`;
  const [measured, setMeasured] = useState(INITIAL_SIZE);
  const now = useNow(!paused);

  useEffect(() => {
    const element = panel.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setMeasured(Math.round(entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const WIDTH = Math.max(measured, 240);
  const latest = points.at(-1);

  if (!latest) {
    return (
      <div className="panel chart-panel" ref={panel}>
        <div className="chart-header">
          <h3>{title}</h3>
        </div>
        <p className="muted chart-empty">Waiting for readings...</p>
      </div>
    );
  }

  const exceeded = (max !== null && latest.v > max) || (min !== null && latest.v < min);
  const age = now - latest.t;
  const stale = !paused && age >= STALE_MS;
  const statusText = paused
    ? "Paused"
    : stale
      ? `Stale, last reading ${ago(age).replace("-", "")} ago`
      : "Live";
  const statusClass = paused ? "" : stale ? "live-connecting" : "live-live";
  const readings = points.map((p) => p.v);
  const lowest = Math.min(...readings);
  const highest = Math.max(...readings);
  const average = readings.reduce((sum, v) => sum + v, 0) / readings.length;
  const end = latest.t;
  const first = points[0]!;
  const start = Math.min(
    Math.max(end - WINDOW_MINUTES * 60_000, first.t),
    end - MIN_SPAN_MS,
  );

  const values = points.map((p) => p.v);
  if (min !== null) values.push(min);
  if (max !== null) values.push(max);
  let low = Math.min(...values);
  let high = Math.max(...values);
  const smallestRange = Math.max(Math.abs((high + low) / 2) * 0.06, 0.2);
  if (high - low < smallestRange) {
    const middle = (high + low) / 2;
    low = middle - smallestRange / 2;
    high = middle + smallestRange / 2;
  }
  const padding = (high - low) * 0.1;
  low -= padding;
  high += padding;

  const step = niceStep(high - low, 4);
  const yTicks: number[] = [];
  for (let v = Math.ceil(low / step) * step; v <= high; v += step) yTicks.push(v);

  const plotWidth = WIDTH - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const x = (t: number) => MARGIN.left + ((t - start) / (end - start)) * plotWidth;
  const y = (v: number) => MARGIN.top + (1 - (v - low) / (high - low)) * plotHeight;

  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`)
    .join("");
  const baseline = HEIGHT - MARGIN.bottom;
  const area = `${path}L${x(latest.t).toFixed(1)},${baseline}L${x(first.t).toFixed(1)},${baseline}Z`;
  const outOfLimits = points.filter(
    (p) => (max !== null && p.v > max) || (min !== null && p.v < min),
  );

  return (
    <div className="panel chart-panel" ref={panel}>
      <div className="chart-header">
        <h3>{title}</h3>
        <span className={exceeded ? "chart-value chart-value-bad" : "chart-value"}>
          {readout(latest.v)} {unit}
        </span>
      </div>

      <div className="chart-meta">
        <span className={`live-indicator ${statusClass}`}>{statusText}</span>
        <span className="mono">
          min {readout(lowest)}, avg {readout(average)}, max {readout(highest)} {unit}
        </span>
      </div>

      <svg
        className="chart"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`Last ${WINDOW_MINUTES} minutes of ${title}. Latest reading ${readout(latest.v)} ${unit}. Minimum ${readout(lowest)}, average ${readout(average)}, maximum ${readout(highest)}. ${statusText}.`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" className="chart-fill-top" />
            <stop offset="100%" className="chart-fill-bottom" />
          </linearGradient>
        </defs>

        {yTicks.map((v) => (
          <g key={v}>
            <line className="chart-grid" x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={y(v)} y2={y(v)} />
            <text className="chart-label" x={MARGIN.left - 6} y={y(v) + 4} textAnchor="end">
              {format(v, step)}
            </text>
          </g>
        ))}

        {X_TICKS.map((fraction) => (
          <text
            key={fraction}
            className="chart-label"
            x={x(end - fraction * (end - start))}
            y={HEIGHT - 8}
            textAnchor={fraction === 0 ? "end" : fraction === 1 ? "start" : "middle"}
          >
            {ago(fraction * (end - start))}
          </text>
        ))}

        {max !== null && (
          <g>
            <line className="chart-limit" x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={y(max)} y2={y(max)} />
            <text className="chart-limit-label" x={MARGIN.left + 4} y={y(max) - 4} textAnchor="start">
              max {format(max, step)}
            </text>
          </g>
        )}
        {min !== null && (
          <g>
            <line className="chart-limit" x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={y(min)} y2={y(min)} />
            <text className="chart-limit-label" x={MARGIN.left + 4} y={y(min) + 12} textAnchor="start">
              min {format(min, step)}
            </text>
          </g>
        )}

        <path className="chart-area" d={area} fill={`url(#${gradientId})`} />
        <path className="chart-line" d={path} />

        {outOfLimits.map((p, i) => (
          <rect
            key={`${p.t}-${i}`}
            className="chart-anomaly"
            x={x(p.t) - 3.5}
            y={y(p.v) - 3.5}
            width="7"
            height="7"
            transform={`rotate(45 ${x(p.t)} ${y(p.v)})`}
          />
        ))}

        <circle
          className={exceeded ? "chart-halo chart-halo-bad" : "chart-halo"}
          cx={x(latest.t)}
          cy={y(latest.v)}
          r="7"
        />
        <circle
          className={exceeded ? "chart-dot chart-dot-bad" : "chart-dot"}
          cx={x(latest.t)}
          cy={y(latest.v)}
          r="3.5"
        />
      </svg>
    </div>
  );
}
