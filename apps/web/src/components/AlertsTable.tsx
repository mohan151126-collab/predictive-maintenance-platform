import { Link } from "react-router-dom";
import type { Alert, AlertStatus } from "../api/types";
import { AlertActions } from "./AlertActions";

const STATUS_LABEL: Record<AlertStatus, string> = {
  OPEN: "Open",
  ACKNOWLEDGED: "Acknowledged",
  IN_PROGRESS: "In progress",
  RESOLVED: "Resolved",
  DISMISSED: "Dismissed",
};

function statusDetail(alert: Alert) {
  if (alert.status === "ACKNOWLEDGED" && alert.acknowledgedByEmail) {
    return `by ${alert.acknowledgedByEmail}`;
  }
  if (alert.status === "DISMISSED") {
    return `${alert.dismissedByEmail ?? "someone"}: ${alert.dismissReason ?? ""}`;
  }
  return null;
}

export function AlertsTable({
  alerts,
  showMachine = true,
}: {
  alerts: Alert[];
  showMachine?: boolean;
}) {
  return (
    <div className="panel table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Severity</th>
            <th>Alert</th>
            {showMachine && <th>Machine</th>}
            <th>Status</th>
            <th>Opened</th>
            <th className="col-actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          {alerts.map((alert) => {
            const detail = statusDetail(alert);
            return (
              <tr key={alert.id}>
                <td>
                  <span className={`badge badge-${alert.severity}`}>
                    {alert.severity === "critical" ? "Critical" : "Warning"}
                  </span>
                </td>
                <td>
                  {alert.status === "RESOLVED" && alert.resolvedMessage
                    ? alert.resolvedMessage
                    : alert.message}
                </td>
                {showMachine && (
                  <td>
                    <Link to={`/machines/${alert.machineId}`}>{alert.machineName}</Link>
                  </td>
                )}
                <td>
                  {STATUS_LABEL[alert.status]}
                  {detail && <div className="muted small">{detail}</div>}
                </td>
                <td className="mono">{new Date(alert.openedAt).toLocaleString()}</td>
                <td>
                  <AlertActions alert={alert} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
