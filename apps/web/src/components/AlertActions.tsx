import { useCallback, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAcknowledgeAlert, useDismissAlert } from "../api/hooks";
import type { Alert } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { errorMessage } from "../lib/errors";
import { Dialog } from "./Dialog";
import { WorkOrderDialog } from "./WorkOrderDialog";

function DismissDialog({ alert, onClose }: { alert: Alert; onClose: () => void }) {
  const dismiss = useDismissAlert();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (reason.trim().length < 3) {
      setError("Explain why this is a false alarm (at least 3 characters).");
      return;
    }
    try {
      await dismiss.mutateAsync({ id: alert.id, reason: reason.trim() });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Dialog title="Dismiss alert" onClose={onClose}>
      <p className="muted">{alert.message}</p>
      {error && (
        <div className="alert-error" role="alert">
          {error}
        </div>
      )}
      <form onSubmit={onSubmit} noValidate>
        <div className="field">
          <label htmlFor="dismiss-reason">Reason</label>
          <input
            id="dismiss-reason"
            className="input"
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <div className="dialog-actions">
          <button className="btn" type="button" onClick={onClose} disabled={dismiss.isPending}>
            Cancel
          </button>
          <button className="btn btn-danger" type="submit" disabled={dismiss.isPending}>
            {dismiss.isPending ? "Dismissing..." : "Dismiss alert"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function AlertActions({ alert }: { alert: Alert }) {
  const { user } = useAuth();
  const acknowledge = useAcknowledgeAlert();
  const [dialog, setDialog] = useState<"dismiss" | "order" | null>(null);
  const close = useCallback(() => setDialog(null), []);

  const canAct = user?.role === "admin" || user?.role === "manager" || user?.role === "technician";
  const canPlan = user?.role === "admin" || user?.role === "manager";

  if (alert.status === "IN_PROGRESS") {
    return <Link to="/work-orders">View work order</Link>;
  }
  if ((alert.status !== "OPEN" && alert.status !== "ACKNOWLEDGED") || !canAct) {
    return null;
  }

  return (
    <>
      <div className="actions">
        {alert.status === "OPEN" && (
          <button
            className="btn"
            type="button"
            disabled={acknowledge.isPending}
            onClick={() => acknowledge.mutate(alert.id)}
          >
            Acknowledge
          </button>
        )}
        {canPlan && (
          <button className="btn btn-primary" type="button" onClick={() => setDialog("order")}>
            Create work order
          </button>
        )}
        <button className="btn" type="button" onClick={() => setDialog("dismiss")}>
          Dismiss
        </button>
      </div>
      {acknowledge.isError && (
        <p className="field-error">{errorMessage(acknowledge.error)}</p>
      )}
      {dialog === "dismiss" && <DismissDialog alert={alert} onClose={close} />}
      {dialog === "order" && <WorkOrderDialog alert={alert} onClose={close} />}
    </>
  );
}
