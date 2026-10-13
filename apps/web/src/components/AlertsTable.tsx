import { Link } from "react-router-dom";
import type { Alert, AlertStatus } from "../api/types";

const STATUS_LABEL: Record<AlertStatus, string> = {
  OPEN: "Open",
  ACKNOWLEDGED: "Acknowledged",
  IN_PROGRESS: "In progress",
  RESOLVED: "Resolved",
  DISMISSED: "Dismissed",
};

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
          </tr>
        </thead>
        <tbody>
          {alerts.map((alert) => (
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
              <td>{STATUS_LABEL[alert.status]}</td>
              <td className="mono">{new Date(alert.openedAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
