import type { Machine } from "../api/types";
import { StatusBadge } from "./StatusBadge";

export function HealthCard({ machine }: { machine: Machine }) {
  const updated = machine.healthUpdatedAt
    ? new Date(machine.healthUpdatedAt).toLocaleTimeString()
    : null;

  return (
    <div className="panel health-card">
      <div>
        <p className="muted health-label">Health score</p>
        <p className="health-number">
          {machine.healthScore === null ? (
            <span className="muted">No data</span>
          ) : (
            <>
              {machine.healthScore}
              <span className="muted health-scale"> / 100</span>
            </>
          )}
        </p>
        <StatusBadge status={machine.status} />
        {updated && <p className="muted health-updated">Updated at {updated}</p>}
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
