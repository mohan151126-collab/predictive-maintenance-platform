import { useCallback, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  useCancelWorkOrder,
  useCompleteWorkOrder,
  useStartWorkOrder,
  useWorkOrders,
} from "../api/hooks";
import type { WorkOrder, WorkOrderPriority, WorkOrderStatus } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Dialog } from "../components/Dialog";
import { WorkOrderDialog } from "../components/WorkOrderDialog";
import { errorMessage } from "../lib/errors";

const STATUS_LABEL: Record<WorkOrderStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

const PRIORITY_BADGE: Record<WorkOrderPriority, string> = {
  critical: "badge-critical",
  high: "badge-warning",
  medium: "badge-watch",
  low: "badge-unknown",
};

type DialogState =
  | { kind: "create" }
  | { kind: "complete"; order: WorkOrder }
  | { kind: "cancel"; order: WorkOrder }
  | null;

function CompleteDialog({ order, onClose }: { order: WorkOrder; onClose: () => void }) {
  const complete = useCompleteWorkOrder();
  const [actionTaken, setActionTaken] = useState("");
  const [parts, setParts] = useState("");
  const [downtime, setDowntime] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const minutes = downtime.trim() === "" ? undefined : Number(downtime);
    if (actionTaken.trim().length < 3) {
      setError("Describe what was done (at least 3 characters).");
      return;
    }
    if (minutes !== undefined && (!Number.isFinite(minutes) || minutes < 0)) {
      setError("Downtime must be a number of minutes, 0 or more.");
      return;
    }
    try {
      await complete.mutateAsync({
        id: order.id,
        input: {
          actionTaken: actionTaken.trim(),
          partsReplaced: parts.trim() || undefined,
          downtimeMinutes: minutes,
        },
      });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Dialog title="Complete work order" onClose={onClose}>
      <p className="muted">{order.title}</p>
      {error && (
        <div className="alert-error" role="alert">
          {error}
        </div>
      )}
      <form onSubmit={onSubmit} noValidate>
        <div className="field">
          <label htmlFor="done-action">What was done</label>
          <input
            id="done-action"
            className="input"
            autoFocus
            value={actionTaken}
            onChange={(e) => setActionTaken(e.target.value)}
          />
        </div>
        <div className="form-row">
          <div className="field">
            <label htmlFor="done-parts">Parts replaced (optional)</label>
            <input
              id="done-parts"
              className="input"
              value={parts}
              onChange={(e) => setParts(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="done-downtime">Downtime in minutes (optional)</label>
            <input
              id="done-downtime"
              className="input"
              type="number"
              min="0"
              value={downtime}
              onChange={(e) => setDowntime(e.target.value)}
            />
          </div>
        </div>
        <div className="dialog-actions">
          <button className="btn" type="button" onClick={onClose} disabled={complete.isPending}>
            Cancel
          </button>
          <button className="btn btn-primary" type="submit" disabled={complete.isPending}>
            {complete.isPending ? "Saving..." : "Mark as completed"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function WorkOrdersPage() {
  const { user } = useAuth();
  const isPlanner = user?.role === "admin" || user?.role === "manager";
  const [status, setStatus] = useState("active");
  const [mineOnly, setMineOnly] = useState(false);
  const orders = useWorkOrders({ status, mine: mineOnly });
  const start = useStartWorkOrder();
  const cancel = useCancelWorkOrder();
  const [dialog, setDialog] = useState<DialogState>(null);
  const close = useCallback(() => setDialog(null), []);

  const canWork = (order: WorkOrder) => isPlanner || order.assigneeId === user?.id;

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <h1>Work orders</h1>
          <p className="muted">Maintenance jobs, who is doing them, and what was done.</p>
        </div>
        {isPlanner && (
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => setDialog({ kind: "create" })}
          >
            New work order
          </button>
        )}
      </div>

      <div className="form-row" style={{ marginBottom: "1rem" }}>
        <div className="field">
          <label htmlFor="wo-filter">Show</label>
          <select
            id="wo-filter"
            className="select"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="active">Open and in progress</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="all">All</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="wo-mine">Assigned to</label>
          <select
            id="wo-mine"
            className="select"
            value={mineOnly ? "me" : "anyone"}
            onChange={(e) => setMineOnly(e.target.value === "me")}
          >
            <option value="anyone">Anyone</option>
            <option value="me">Me</option>
          </select>
        </div>
      </div>

      {start.isError && <div className="alert-error">{errorMessage(start.error)}</div>}
      {orders.isPending && <p className="muted">Loading work orders...</p>}
      {orders.isError && (
        <div className="alert-error" role="alert">
          Could not load work orders.
        </div>
      )}

      {orders.data && orders.data.length === 0 && (
        <div className="panel empty-state">
          <p>No work orders to show.</p>
          <p>
            {isPlanner
              ? "Create one here, or from an alert on the Alerts page."
              : "A manager will assign work to you."}
          </p>
        </div>
      )}

      {orders.data && orders.data.length > 0 && (
        <div className="panel table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Priority</th>
                <th>Work order</th>
                <th>Machine</th>
                <th>Status</th>
                <th>Assigned to</th>
                <th>Due</th>
                <th className="col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.data.map((order) => (
                <tr key={order.id}>
                  <td>
                    <span className={`badge ${PRIORITY_BADGE[order.priority]}`}>
                      {order.priority[0]!.toUpperCase() + order.priority.slice(1)}
                    </span>
                  </td>
                  <td>
                    {order.title}
                    {order.status === "COMPLETED" && (
                      <div className="muted small">
                        {order.actionTaken}
                        {order.partsReplaced ? ` | Parts: ${order.partsReplaced}` : ""}
                        {order.downtimeMinutes !== null ? ` | Downtime: ${order.downtimeMinutes} min` : ""}
                      </div>
                    )}
                  </td>
                  <td>
                    <Link to={`/machines/${order.machineId}`}>{order.machineName}</Link>
                  </td>
                  <td>{STATUS_LABEL[order.status]}</td>
                  <td>{order.assigneeEmail ?? <span className="muted">Unassigned</span>}</td>
                  <td className="mono">
                    {order.dueAt ? order.dueAt.slice(0, 10) : <span className="muted">None</span>}
                  </td>
                  <td>
                    <div className="actions">
                      {order.status === "OPEN" && canWork(order) && (
                        <button
                          className="btn"
                          type="button"
                          disabled={start.isPending}
                          onClick={() => start.mutate(order.id)}
                        >
                          Start
                        </button>
                      )}
                      {(order.status === "OPEN" || order.status === "IN_PROGRESS") &&
                        canWork(order) && (
                          <button
                            className="btn btn-primary"
                            type="button"
                            onClick={() => setDialog({ kind: "complete", order })}
                          >
                            Complete
                          </button>
                        )}
                      {(order.status === "OPEN" || order.status === "IN_PROGRESS") && isPlanner && (
                        <button
                          className="btn btn-danger"
                          type="button"
                          onClick={() => setDialog({ kind: "cancel", order })}
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dialog?.kind === "create" && <WorkOrderDialog onClose={close} />}
      {dialog?.kind === "complete" && <CompleteDialog order={dialog.order} onClose={close} />}
      {dialog?.kind === "cancel" && (
        <ConfirmDialog
          title="Cancel work order"
          message={`Cancel "${dialog.order.title}"? If it was created from an alert, the alert goes back to acknowledged.`}
          confirmLabel="Cancel work order"
          onConfirm={() => cancel.mutateAsync(dialog.order.id)}
          onClose={close}
        />
      )}
    </main>
  );
}
