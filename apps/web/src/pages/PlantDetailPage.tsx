import { useCallback, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import {
  useCreateMachine,
  useDeleteMachine,
  useMachines,
  usePlant,
  useUpdateMachine,
} from "../api/hooks";
import type { Machine } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Dialog } from "../components/Dialog";
import { StatusBadge } from "../components/StatusBadge";
import { errorMessage } from "../lib/errors";

type DialogState =
  | { kind: "create" }
  | { kind: "edit"; machine: Machine }
  | { kind: "delete"; machine: Machine }
  | null;

function MachineFormDialog({
  plantId,
  machine,
  onClose,
}: {
  plantId: string;
  machine?: Machine;
  onClose: () => void;
}) {
  const create = useCreateMachine();
  const update = useUpdateMachine();
  const [name, setName] = useState(machine?.name ?? "");
  const [type, setType] = useState(machine?.type ?? "");
  const [modelNumber, setModelNumber] = useState(machine?.modelNumber ?? "");
  const [installedAt, setInstalledAt] = useState(
    machine?.installedAt?.slice(0, 10) ?? "",
  );
  const [cost, setCost] = useState(String(machine?.downtimeCostPerHour ?? 0));
  const [error, setError] = useState<string | null>(null);
  const saving = create.isPending || update.isPending;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const downtimeCostPerHour = Number(cost);
    if (!name.trim()) {
      setError("Enter a machine name.");
      return;
    }
    if (!type.trim()) {
      setError("Enter a machine type, for example CNC lathe.");
      return;
    }
    if (
      cost.trim() === "" ||
      !Number.isFinite(downtimeCostPerHour) ||
      downtimeCostPerHour < 0
    ) {
      setError("Enter the downtime cost per hour as a number, 0 or more.");
      return;
    }

    const fields = {
      name: name.trim(),
      type: type.trim(),
      modelNumber: modelNumber.trim(),
      downtimeCostPerHour,
      ...(installedAt ? { installedAt } : {}),
    };

    try {
      if (machine) await update.mutateAsync({ id: machine.id, input: fields });
      else await create.mutateAsync({ plantId, ...fields });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Dialog title={machine ? "Edit machine" : "Add machine"} onClose={onClose}>
      {error && (
        <div className="alert-error" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={onSubmit} noValidate>
        <div className="field">
          <label htmlFor="machine-name">Name</label>
          <input
            id="machine-name"
            className="input"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="machine-type">Type</label>
          <input
            id="machine-type"
            className="input"
            value={type}
            onChange={(e) => setType(e.target.value)}
          />
        </div>

        <div className="form-row">
          <div className="field">
            <label htmlFor="machine-model">Model number</label>
            <input
              id="machine-model"
              className="input"
              value={modelNumber}
              onChange={(e) => setModelNumber(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="machine-installed">Installed on</label>
            <input
              id="machine-installed"
              className="input"
              type="date"
              value={installedAt}
              onChange={(e) => setInstalledAt(e.target.value)}
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="machine-cost">Downtime cost per hour</label>
          <input
            id="machine-cost"
            className="input"
            type="number"
            min="0"
            step="any"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
          />
        </div>

        <div className="dialog-actions">
          <button
            className="btn"
            type="button"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function PlantDetailPage() {
  const { plantId = "" } = useParams();
  const { user } = useAuth();
  const canEdit = user?.role === "admin" || user?.role === "manager";
  const plant = usePlant(plantId);
  const machines = useMachines(plantId);
  const deleteMachine = useDeleteMachine();
  const [dialog, setDialog] = useState<DialogState>(null);
  const close = useCallback(() => setDialog(null), []);

  if (plant.isError) {
    return (
      <main className="page">
        <div className="alert-error" role="alert">
          Plant not found.
        </div>
        <Link to="/plants">Back to plants</Link>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <p className="breadcrumb">
            <Link to="/plants">Plants</Link> / {plant.data?.name ?? "..."}
          </p>
          <h1>{plant.data?.name ?? "Plant"}</h1>
          {plant.data && (
            <p className="muted">
              {plant.data.location || "No location set"} ·{" "}
              <span className="mono">{plant.data.timezone}</span>
            </p>
          )}
        </div>
        {canEdit && (
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => setDialog({ kind: "create" })}
          >
            Add machine
          </button>
        )}
      </div>

      {machines.isPending && <p className="muted">Loading machines...</p>}

      {machines.isError && (
        <div className="alert-error" role="alert">
          Could not load machines.{" "}
          <button
            className="btn"
            type="button"
            onClick={() => void machines.refetch()}
          >
            Try again
          </button>
        </div>
      )}

      {machines.data && machines.data.length === 0 && (
        <div className="panel empty-state">
          <p>No machines in this plant yet.</p>
          <p>
            {canEdit
              ? "Add a machine, then add its sensors."
              : "Ask an admin or manager to add a machine."}
          </p>
        </div>
      )}

      {machines.data && machines.data.length > 0 && (
        <div className="panel table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Model</th>
                <th>Installed</th>
                <th>Status</th>
                <th>Health score</th>
                <th>Downtime cost per hour</th>
                {canEdit && <th className="col-actions">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {machines.data.map((machine) => (
                <tr key={machine.id}>
                  <td>
                    <Link to={`/machines/${machine.id}`}>{machine.name}</Link>
                  </td>
                  <td>{machine.type}</td>
                  <td>
                    {machine.modelNumber || <span className="muted">Not set</span>}
                  </td>
                  <td className="mono">
                    {machine.installedAt?.slice(0, 10) ?? (
                      <span className="muted">Not set</span>
                    )}
                  </td>
                  <td>
                    <StatusBadge status={machine.status} />
                  </td>
                  <td className="mono">
                    {machine.healthScore === null ? (
                      <span className="muted">No data</span>
                    ) : (
                      machine.healthScore
                    )}
                  </td>
                  <td className="mono">
                    {machine.downtimeCostPerHour.toLocaleString()}
                  </td>
                  {canEdit && (
                    <td>
                      <div className="actions">
                        <button
                          className="btn"
                          type="button"
                          onClick={() => setDialog({ kind: "edit", machine })}
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn-danger"
                          type="button"
                          onClick={() => setDialog({ kind: "delete", machine })}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dialog?.kind === "create" && (
        <MachineFormDialog plantId={plantId} onClose={close} />
      )}
      {dialog?.kind === "edit" && (
        <MachineFormDialog
          plantId={plantId}
          machine={dialog.machine}
          onClose={close}
        />
      )}
      {dialog?.kind === "delete" && (
        <ConfirmDialog
          title="Delete machine"
          message={`Delete "${dialog.machine.name}"? A machine can only be deleted when it has no sensors.`}
          onConfirm={() => deleteMachine.mutateAsync(dialog.machine.id)}
          onClose={close}
        />
      )}
    </main>
  );
}
