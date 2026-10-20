import { useCallback, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  useCreatePlant,
  useDeletePlant,
  usePlants,
  useUpdatePlant,
} from "../api/hooks";
import type { Plant } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Dialog } from "../components/Dialog";
import { FleetSummary } from "../components/FleetSummary";
import { errorMessage } from "../lib/errors";

const TIME_ZONES = [
  "UTC",
  ...Intl.supportedValuesOf("timeZone").filter((zone) => zone !== "UTC"),
];

type DialogState =
  | { kind: "create" }
  | { kind: "edit"; plant: Plant }
  | { kind: "delete"; plant: Plant }
  | null;

function PlantFormDialog({
  plant,
  onClose,
}: {
  plant?: Plant;
  onClose: () => void;
}) {
  const create = useCreatePlant();
  const update = useUpdatePlant();
  const [name, setName] = useState(plant?.name ?? "");
  const [location, setLocation] = useState(plant?.location ?? "");
  const [timezone, setTimezone] = useState(plant?.timezone ?? "UTC");
  const [error, setError] = useState<string | null>(null);
  const saving = create.isPending || update.isPending;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const input = {
      name: name.trim(),
      location: location.trim(),
      timezone: timezone.trim(),
    };
    if (!input.name) {
      setError("Enter a plant name.");
      return;
    }
    if (!TIME_ZONES.includes(input.timezone)) {
      setError("Choose a time zone from the list, for example Asia/Kolkata.");
      return;
    }

    try {
      if (plant) await update.mutateAsync({ id: plant.id, input });
      else await create.mutateAsync(input);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Dialog title={plant ? "Edit plant" : "Add plant"} onClose={onClose}>
      {error && (
        <div className="alert-error" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={onSubmit} noValidate>
        <div className="field">
          <label htmlFor="plant-name">Name</label>
          <input
            id="plant-name"
            className="input"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="plant-location">Location</label>
          <input
            id="plant-location"
            className="input"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="plant-timezone">Time zone</label>
          <input
            id="plant-timezone"
            className="input"
            list="time-zones"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
          />
          <datalist id="time-zones">
            {TIME_ZONES.map((zone) => (
              <option key={zone} value={zone} />
            ))}
          </datalist>
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

export function PlantsPage() {
  const { user } = useAuth();
  const canEdit = user?.role === "admin" || user?.role === "manager";
  const plants = usePlants();
  const deletePlant = useDeletePlant();
  const [dialog, setDialog] = useState<DialogState>(null);
  const close = useCallback(() => setDialog(null), []);

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <h1>Plants</h1>
          <p className="muted">Each plant groups the machines at one site.</p>
        </div>
        {canEdit && (
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => setDialog({ kind: "create" })}
          >
            Add plant
          </button>
        )}
      </div>

      <FleetSummary />

      {plants.isPending && <p className="muted">Loading plants...</p>}

      {plants.isError && (
        <div className="alert-error" role="alert">
          Could not load plants.{" "}
          <button
            className="btn"
            type="button"
            onClick={() => void plants.refetch()}
          >
            Try again
          </button>
        </div>
      )}

      {plants.data && plants.data.length === 0 && (
        <div className="panel empty-state">
          <p>No plants yet.</p>
          <p>
            {canEdit
              ? "Add your first plant, then add its machines."
              : "Ask an admin or manager to add a plant."}
          </p>
        </div>
      )}

      {plants.data && plants.data.length > 0 && (
        <div className="panel table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Location</th>
                <th>Time zone</th>
                {canEdit && <th className="col-actions">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {plants.data.map((plant) => (
                <tr key={plant.id}>
                  <td>
                    <Link to={`/plants/${plant.id}`}>{plant.name}</Link>
                  </td>
                  <td>
                    {plant.location || <span className="muted">Not set</span>}
                  </td>
                  <td className="mono">{plant.timezone}</td>
                  {canEdit && (
                    <td>
                      <div className="actions">
                        <button
                          className="btn"
                          type="button"
                          onClick={() => setDialog({ kind: "edit", plant })}
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn-danger"
                          type="button"
                          onClick={() => setDialog({ kind: "delete", plant })}
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

      {dialog?.kind === "create" && <PlantFormDialog onClose={close} />}
      {dialog?.kind === "edit" && (
        <PlantFormDialog plant={dialog.plant} onClose={close} />
      )}
      {dialog?.kind === "delete" && (
        <ConfirmDialog
          title="Delete plant"
          message={`Delete "${dialog.plant.name}"? A plant can only be deleted when it has no machines.`}
          onConfirm={() => deletePlant.mutateAsync(dialog.plant.id)}
          onClose={close}
        />
      )}
    </main>
  );
}
