import { useAlerts, useAllMachines } from "../api/hooks";
import type { MachineStatus } from "../api/types";

const STATUSES: { key: MachineStatus; label: string }[] = [
  { key: "healthy", label: "Healthy" },
  { key: "watch", label: "Watch" },
  { key: "warning", label: "Warning" },
  { key: "critical", label: "Critical" },
  { key: "unknown", label: "No data" },
];

export function FleetSummary() {
  const machines = useAllMachines();
  const alerts = useAlerts({ status: "active" });

  if (!machines.data || machines.data.length === 0) return null;

  const counts: Record<MachineStatus, number> = {
    healthy: 0,
    watch: 0,
    warning: 0,
    critical: 0,
    unknown: 0,
  };
  for (const machine of machines.data) counts[machine.status] += 1;

  const needAttention = counts.warning + counts.critical;
  const costAtRisk = machines.data
    .filter((m) => m.status === "warning" || m.status === "critical")
    .reduce((sum, m) => sum + m.downtimeCostPerHour, 0);
  const activeAlerts = alerts.data?.length ?? 0;

  return (
    <section aria-label="Fleet summary">
      <div className="stat-grid">
        <div className="stat">
          <p className="stat-label">Machines monitored</p>
          <p className="stat-value">{machines.data.length}</p>
        </div>
        <div className="stat" style={{ "--tone": needAttention > 0 ? "var(--crit)" : "var(--ok)" } as React.CSSProperties}>
          <p className="stat-label">Need attention</p>
          <p className="stat-value">{needAttention}</p>
          <p className="stat-note">In Warning or Critical</p>
        </div>
        <div className="stat" style={{ "--tone": activeAlerts > 0 ? "var(--warn)" : "var(--ok)" } as React.CSSProperties}>
          <p className="stat-label">Active alerts</p>
          <p className="stat-value">{activeAlerts}</p>
        </div>
        <div className="stat" style={{ "--tone": costAtRisk > 0 ? "var(--crit)" : "var(--ok)" } as React.CSSProperties}>
          <p className="stat-label">Downtime cost at risk per hour</p>
          <p className="stat-value">{costAtRisk.toLocaleString()}</p>
          <p className="stat-note">Machines in Warning or Critical</p>
        </div>
      </div>

      <div className="status-row">
        {STATUSES.map(({ key, label }) => (
          <span key={key} className={`badge badge-${key}`}>
            {label} <span className="count">{counts[key]}</span>
          </span>
        ))}
      </div>
    </section>
  );
}
