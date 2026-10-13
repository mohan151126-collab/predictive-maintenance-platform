import { useState } from "react";
import { errorMessage } from "../lib/errors";
import { Dialog } from "./Dialog";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => Promise<unknown>;
  onClose: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Delete",
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Dialog title={title} onClose={onClose}>
      <p>{message}</p>

      {error && (
        <div className="alert-error" role="alert">
          {error}
        </div>
      )}

      <div className="dialog-actions">
        <button
          className="btn"
          type="button"
          onClick={onClose}
          disabled={busy}
        >
          Cancel
        </button>
        <button
          className="btn btn-danger"
          type="button"
          onClick={() => void confirm()}
          disabled={busy}
        >
          {busy ? "Deleting..." : confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
