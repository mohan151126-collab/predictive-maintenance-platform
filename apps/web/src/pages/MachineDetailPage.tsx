import { useCallback, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import {
  useAlerts,
  useCreateSensor,
  useDeleteSensor,
  useMachine,
  usePlant,
  useSensors,
  useUpdateSensor,
  type ThresholdsInput,
} from "../api/hooks";
import { SENSOR_TYPES, type Sensor, type SensorType } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { AlertsTable } from "../components/AlertsTable";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Dialog } from "../components/Dialog";
import { HealthCard } from "../components/HealthCard";
import { LiveChart } from "../components/LiveChart";
import { errorMessage } from "../lib/errors";
import { WINDOW_MINUTES, useLiveReadings } from "../live/useLiveReadings";

const TYPE_LABEL: Record<SensorType, string> = {
  vibration_rms: "Vibration (RMS)",
  temperature: "Temperature",
  current: "Current",
  pressure: "Pressure",
  rpm: "Speed (RPM)",
};

const DEFAULT_UNIT: Record<SensorType, string> = {
  vibration_rms: "mm/s",
  temperature: "°C",
  current: "A",
  pressure: "bar",
  rpm: "rpm",
};

type DialogState =
  | { kind: "create" }
  | { kind: "edit"; sensor: Sensor }
  | { kind: "delete"; sensor: Sensor }
  | null;

type Parsed = { ok: true; value?: number } | { ok: false };

function parseOptional(text: string): Parsed {
  if (text.trim() === "") return { ok: true };
  const value = Number(text);
  return Number.isFinite(value) ? { ok: true, value } : { ok: false };
}

function describeLimits(sensor: Sensor) {
  const { min, max, rateOfChange } = sensor.thresholds;
  const parts: string[] = [];
  if (min !== null) parts.push(`min ${min}`);
  if (max !== null) parts.push(`max ${max}`);
  if (rateOfChange !== null) parts.push(`change ${rateOfChange}/min`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function SensorFormDialog({
  machineId,
  sensor,
  onClose,
}: {
  machineId: string;
  sensor?: Sensor;
  onClose: () => void;
}) {
  const create = useCreateSensor();
  const update = useUpdateSensor();
  const [name, setName] = useState(sensor?.name ?? "");
  const [type, setType] = useState<SensorType>(sensor?.type ?? "temperature");
  const [unit, setUnit] = useState(sensor?.unit ?? DEFAULT_UNIT.temperature);
  const [unitTouched, setUnitTouched] = useState(sensor !== undefined);
  const [hz, setHz] = useState(String(sensor?.samplingHz ?? 1));
  const [minText, setMinText] = useState(String(sensor?.thresholds.min ?? ""));
  const [maxText, setMaxText] = useState(String(sensor?.thresholds.max ?? ""));
  const [rateText, setRateText] = useState(
    String(sensor?.thresholds.rateOfChange ?? ""),
  );
  const [error, setError] = useState<string | null>(null);
  const saving = create.isPending || update.isPending;

  function onTypeChange(next: SensorType) {
    setType(next);
    if (!unitTouched) setUnit(DEFAULT_UNIT[next]);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const samplingHz = Number(hz);
    const min = parseOptional(minText);
    const max = parseOptional(maxText);
    const rate = parseOptional(rateText);

    if (!name.trim()) {
      setError("Enter a sensor name.");
      return;
    }
    if (!unit.trim()) {
      setError("Enter the unit of measurement.");
      return;
    }
    if (
      hz.trim() === "" ||
      !Number.isFinite(samplingHz) ||
      samplingHz < 0.001 ||
      samplingHz > 10000
    ) {
      setError("Sampling rate must be a number between 0.001 and 10000 Hz.");
      return;
    }
    if (!min.ok || !max.ok || !rate.ok) {
      setError("Alert limits must be numbers, or left empty.");
      return;
    }
    if (rate.value !== undefined && rate.value < 0) {
      setError("The rate of change limit must be 0 or more.");
      return;
    }
    if (
      min.value !== undefined &&
      max.value !== undefined &&
      min.value >= max.value
    ) {
      setError("The minimum limit must be lower than the maximum limit.");
      return;
    }

    const thresholds: ThresholdsInput = {};
    if (min.value !== undefined) thresholds.min = min.value;
    if (max.value !== undefined) thresholds.max = max.value;
    if (rate.value !== undefined) thresholds.rateOfChange = rate.value;

    const fields = {
      name: name.trim(),
      type,
      unit: unit.trim(),
      samplingHz,
      thresholds,
    };

    try {
      if (sensor) await update.mutateAsync({ id: sensor.id, input: fields });
      else await create.mutateAsync({ machineId, ...fields });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Dialog title={sensor ? "Edit sensor" : "Add sensor"} onClose={onClose}>
      {error && (
        <div className="alert-error" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={onSubmit} noValidate>
        <div className="field">
          <label htmlFor="sensor-name">Name</label>
          <input
            id="sensor-name"
            className="input"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="form-row">
          <div className="field">
            <label htmlFor="sensor-type">Type</label>
            <select
              id="sensor-type"
              className="select"
              value={type}
              onChange={(e) => onTypeChange(e.target.value as SensorType)}
            >
              {SENSOR_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="sensor-unit">Unit</label>
            <input
              id="sensor-unit"
              className="input"
              value={unit}
              onChange={(e) => {
                setUnit(e.target.value);
                setUnitTouched(true);
              }}
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="sensor-hz">Sampling rate (readings per second)</label>
          <input
            id="sensor-hz"
            className="input"
            type="number"
            min="0.001"
            step="any"
            value={hz}
            onChange={(e) => setHz(e.target.value)}
          />
        </div>

        <h3>Alert limits (optional)</h3>
        <p className="muted">Leave a field empty for no limit.</p>

        <div className="form-row">
          <div className="field">
            <label htmlFor="sensor-min">Minimum</label>
            <input
              id="sensor-min"
              className="input"
              type="number"
              step="any"
              value={minText}
              onChange={(e) => setMinText(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="sensor-max">Maximum</label>
            <input
              id="sensor-max"
              className="input"
              type="number"
              step="any"
              value={maxText}
              onChange={(e) => setMaxText(e.target.value)}
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="sensor-rate">Rate of change limit (per minute)</label>
          <input
            id="sensor-rate"
            className="input"
            type="number"
            min="0"
            step="any"
            value={rateText}
            onChange={(e) => setRateText(e.target.value)}
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

export function MachineDetailPage() {
  const { machineId = "" } = useParams();
  const { user } = useAuth();
  const canEdit = user?.role === "admin" || user?.role === "manager";
  const machine = useMachine(machineId);
  const plant = usePlant(machine.data?.plantId ?? "");
  const sensors = useSensors(machineId);
  const live = useLiveReadings(machineId);
  const alerts = useAlerts({ machineId });
  const deleteSensor = useDeleteSensor();
  const [dialog, setDialog] = useState<DialogState>(null);
  const close = useCallback(() => setDialog(null), []);

  if (machine.isError) {
    return (
      <main className="page">
        <div className="alert-error" role="alert">
          Machine not found.
        </div>
        <Link to="/plants">Back to plants</Link>
      </main>
    );
  }

  const m = machine.data;

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <p className="breadcrumb">
            <Link to="/plants">Plants</Link> /{" "}
            {m ? (
              <Link to={`/plants/${m.plantId}`}>{plant.data?.name ?? "Plant"}</Link>
            ) : (
              "..."
            )}{" "}
            / {m?.name ?? "..."}
          </p>
          <h1>{m?.name ?? "Machine"}</h1>
        </div>
      </div>

      {m && (
        <div className="panel" style={{ marginBottom: "1.5rem" }}>
          <div className="form-row">
            <p>
              <span className="muted">Type</span>
              <br />
              {m.type}
            </p>
            <p>
              <span className="muted">Model number</span>
              <br />
              {m.modelNumber || "Not set"}
            </p>
            <p>
              <span className="muted">Installed on</span>
              <br />
              <span className="mono">{m.installedAt?.slice(0, 10) ?? "Not set"}</span>
            </p>
            <p>
              <span className="muted">Downtime cost per hour</span>
              <br />
              <span className="mono">{m.downtimeCostPerHour.toLocaleString()}</span>
            </p>
          </div>
        </div>
      )}

      {m && <HealthCard machine={m} />}

      <h2 style={{ marginTop: "1.5rem" }}>Live readings</h2>
      <p className="muted">
        The last {WINDOW_MINUTES} minutes, updating as readings arrive.
      </p>
      {sensors.data && sensors.data.length > 0 ? (
        <div className="chart-layout">
          {sensors.data.map((sensor) => (
            <LiveChart
              key={sensor.id}
              title={sensor.name}
              unit={sensor.unit}
              points={live.series[sensor.id] ?? []}
              min={sensor.thresholds.min}
              max={sensor.thresholds.max}
            />
          ))}
        </div>
      ) : (
        <div className="panel empty-state">
          <p>Add a sensor to see live readings here.</p>
        </div>
      )}

      <h2 style={{ marginTop: "1.5rem" }}>Alerts</h2>
      {alerts.data && alerts.data.length > 0 ? (
        <AlertsTable alerts={alerts.data} showMachine={false} />
      ) : (
        <div className="panel empty-state">
          <p>No active alerts for this machine.</p>
        </div>
      )}

      <div className="page-header" style={{ marginTop: "1.5rem" }}>
        <div>
          <h2>Sensors</h2>
          <p className="muted">
            Each sensor reports one measurement from this machine.
          </p>
        </div>
        {canEdit && (
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => setDialog({ kind: "create" })}
          >
            Add sensor
          </button>
        )}
      </div>

      {sensors.isPending && <p className="muted">Loading sensors...</p>}

      {sensors.isError && (
        <div className="alert-error" role="alert">
          Could not load sensors.{" "}
          <button
            className="btn"
            type="button"
            onClick={() => void sensors.refetch()}
          >
            Try again
          </button>
        </div>
      )}

      {sensors.data && sensors.data.length === 0 && (
        <div className="panel empty-state">
          <p>No sensors on this machine yet.</p>
          <p>
            {canEdit
              ? "Add a sensor to define what is measured and when to alert."
              : "Ask an admin or manager to add a sensor."}
          </p>
        </div>
      )}

      {sensors.data && sensors.data.length > 0 && (
        <div className="panel table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Unit</th>
                <th>Readings per second</th>
                <th>Alert limits</th>
                {canEdit && <th className="col-actions">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {sensors.data.map((sensor) => (
                <tr key={sensor.id}>
                  <td>{sensor.name}</td>
                  <td>{TYPE_LABEL[sensor.type]}</td>
                  <td className="mono">{sensor.unit}</td>
                  <td className="mono">{sensor.samplingHz}</td>
                  <td className="mono">
                    {describeLimits(sensor) ?? (
                      <span className="muted">No limits set</span>
                    )}
                  </td>
                  {canEdit && (
                    <td>
                      <div className="actions">
                        <button
                          className="btn"
                          type="button"
                          onClick={() => setDialog({ kind: "edit", sensor })}
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn-danger"
                          type="button"
                          onClick={() => setDialog({ kind: "delete", sensor })}
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
        <SensorFormDialog machineId={machineId} onClose={close} />
      )}
      {dialog?.kind === "edit" && (
        <SensorFormDialog
          machineId={machineId}
          sensor={dialog.sensor}
          onClose={close}
        />
      )}
      {dialog?.kind === "delete" && (
        <ConfirmDialog
          title="Delete sensor"
          message={`Delete "${dialog.sensor.name}"? This cannot be undone.`}
          onConfirm={() => deleteSensor.mutateAsync(dialog.sensor.id)}
          onClose={close}
        />
      )}
    </main>
  );
}
