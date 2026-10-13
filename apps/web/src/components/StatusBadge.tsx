import type { MachineStatus } from "../api/types";

const LABELS: Record<MachineStatus, string> = {
  unknown: "No data",
  healthy: "Healthy",
  watch: "Watch",
  warning: "Warning",
  critical: "Critical",
};

export function StatusBadge({ status }: { status: MachineStatus }) {
  return <span className={`badge badge-${status}`}>{LABELS[status]}</span>;
}
