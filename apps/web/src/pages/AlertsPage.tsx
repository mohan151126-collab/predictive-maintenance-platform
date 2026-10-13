import { useState } from "react";
import { useAlerts } from "../api/hooks";
import { AlertsTable } from "../components/AlertsTable";

export function AlertsPage() {
  const [status, setStatus] = useState("active");
  const alerts = useAlerts({ status });

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <h1>Alerts</h1>
          <p className="muted">
            Problems found by the monitoring service. This page updates by itself.
          </p>
        </div>
        <div className="field" style={{ minWidth: "12rem", marginBottom: 0 }}>
          <label htmlFor="alert-filter">Show</label>
          <select
            id="alert-filter"
            className="select"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="active">Active alerts</option>
            <option value="RESOLVED">Resolved alerts</option>
            <option value="all">All alerts</option>
          </select>
        </div>
      </div>

      {alerts.isPending && <p className="muted">Loading alerts...</p>}

      {alerts.isError && (
        <div className="alert-error" role="alert">
          Could not load alerts.{" "}
          <button className="btn" type="button" onClick={() => void alerts.refetch()}>
            Try again
          </button>
        </div>
      )}

      {alerts.data && alerts.data.length === 0 && (
        <div className="panel empty-state">
          <p>{status === "active" ? "No active alerts." : "No alerts to show."}</p>
          <p>
            {status === "active"
              ? "When a sensor goes outside its limits, it will appear here."
              : "Change the filter to see other alerts."}
          </p>
        </div>
      )}

      {alerts.data && alerts.data.length > 0 && <AlertsTable alerts={alerts.data} />}
    </main>
  );
}
