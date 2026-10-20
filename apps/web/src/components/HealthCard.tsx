import type { Machine } from "../api/types";
import { StatusBadge } from "./StatusBadge";

const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function HealthRing({ score, status }: Pick<Machine, "status"> & { score: number | null }) {
  const filled = score === null ? 0 : (Math.min(Math.max(score, 0), 100) / 100) * CIRCUMFERENCE;

  return (
    <div className={`health-ring health-ring-${status}`}>
      <svg viewBox="0 0 120 120" aria-hidden="true" focusable="false">
        <circle className="health-ring-track" cx="60" cy="60" r={RADIUS} />
        {score !== null && score > 0 && (
          <circle
            className="health-ring-value"
            cx="60"
            cy="60"
            r={RADIUS}
            strokeDasharray={`${filled} ${CIRCUMFERENCE}`}
            transform="rotate(-90 60 60)"
          />
        )}
      </svg>
      <p className="health-number">
        {score === null ? (
          <span className="muted health-empty">No data</span>
        ) : (
          <>
            {score}
            <span className="muted health-scale">/ 100</span>
          </>
        )}
      </p>
    </div>
  );
}

export function HealthCard({ machine }: { machine: Machine }) {
  const updated = machine.healthUpdatedAt
    ? new Date(machine.healthUpdatedAt).toLocaleTimeString()
    : null;

  return (
    <div className="panel health-card">
      <div className="health-summary">
        <HealthRing score={machine.healthScore} status={machine.status} />
        <div>
          <p className="muted health-label">Health score</p>
          <StatusBadge status={machine.status} />
          {updated && <p className="muted health-updated">Updated at {updated}</p>}
        </div>
      </div>

      <div className="health-reasons">
        <p className="muted health-label">What is affecting it</p>
        {machine.healthReasons.length > 0 ? (
          <ul>
            {machine.healthReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        ) : machine.healthScore === null ? (
          <p className="muted">
            A score appears once sensors with alert limits are reporting.
          </p>
        ) : (
          <p>Nothing. All monitored sensors are well within their limits.</p>
        )}
      </div>
    </div>
  );
}
