import { useState, type FormEvent } from "react";
import { useAllMachines, useCreateWorkOrder, useUsers } from "../api/hooks";
import type { Alert, WorkOrderPriority } from "../api/types";
import { errorMessage } from "../lib/errors";
import { Dialog } from "./Dialog";

const PRIORITIES: WorkOrderPriority[] = ["low", "medium", "high", "critical"];

export function WorkOrderDialog({
  alert,
  onClose,
}: {
  alert?: Alert;
  onClose: () => void;
}) {
  const create = useCreateWorkOrder();
  const machines = useAllMachines();
  const users = useUsers();
  const [machineId, setMachineId] = useState(alert?.machineId ?? "");
  const [title, setTitle] = useState(
    alert ? `Investigate: ${alert.message}`.slice(0, 120) : "",
  );
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<WorkOrderPriority>(
    alert?.severity === "critical" ? "critical" : "medium",
  );
  const [assigneeId, setAssigneeId] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [error, setError] = useState<string | null>(null);

  const people = (users.data ?? []).filter((u) => u.role !== "viewer");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!machineId) {
      setError("Choose a machine.");
      return;
    }
    if (title.trim().length < 3) {
      setError("Enter a title of at least 3 characters.");
      return;
    }
    try {
      await create.mutateAsync({
        machineId,
        alertId: alert?.id,
        title: title.trim(),
        description: description.trim(),
        priority,
        assigneeId: assigneeId || undefined,
        dueAt: dueAt || undefined,
      });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Dialog title="New work order" onClose={onClose}>
      {error && (
        <div className="alert-error" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={onSubmit} noValidate>
        {!alert && (
          <div className="field">
            <label htmlFor="wo-machine">Machine</label>
            <select
              id="wo-machine"
              className="select"
              value={machineId}
              onChange={(e) => setMachineId(e.target.value)}
            >
              <option value="">Choose a machine</option>
              {(machines.data ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="field">
          <label htmlFor="wo-title">Title</label>
          <input
            id="wo-title"
            className="input"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="wo-description">Details (optional)</label>
          <input
            id="wo-description"
            className="input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="form-row">
          <div className="field">
            <label htmlFor="wo-priority">Priority</label>
            <select
              id="wo-priority"
              className="select"
              value={priority}
              onChange={(e) => setPriority(e.target.value as WorkOrderPriority)}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p[0]!.toUpperCase() + p.slice(1)}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="wo-due">Due date (optional)</label>
            <input
              id="wo-due"
              className="input"
              type="date"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="wo-assignee">Assign to (optional)</label>
          <select
            id="wo-assignee"
            className="select"
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
          >
            <option value="">Unassigned</option>
            {people.map((u) => (
              <option key={u.id} value={u.id}>
                {u.email} ({u.role})
              </option>
            ))}
          </select>
        </div>

        <div className="dialog-actions">
          <button className="btn" type="button" onClick={onClose} disabled={create.isPending}>
            Cancel
          </button>
          <button className="btn btn-primary" type="submit" disabled={create.isPending}>
            {create.isPending ? "Creating..." : "Create work order"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
