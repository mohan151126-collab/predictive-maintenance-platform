import { useCallback, useState, type FormEvent } from "react";
import { useCreateUser, useUpdateUserRole, useUsers } from "../api/hooks";
import type { Role } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { Dialog } from "../components/Dialog";
import { errorMessage } from "../lib/errors";

const ROLES: Role[] = ["admin", "manager", "technician", "viewer"];

const ROLE_HELP: Record<Role, string> = {
  admin: "Everything, including managing the team",
  manager: "Manages plants, machines, sensors and work orders",
  technician: "Acknowledges alerts and does assigned work orders",
  viewer: "Can only look",
};

function AddUserDialog({ onClose }: { onClose: () => void }) {
  const create = useCreateUser();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("technician");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    if (password.length < 8) {
      setError("The password needs at least 8 characters.");
      return;
    }
    try {
      await create.mutateAsync({ email: email.trim(), role, password });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Dialog title="Add a team member" onClose={onClose}>
      {error && (
        <div className="alert-error" role="alert">
          {error}
        </div>
      )}
      <form onSubmit={onSubmit} noValidate>
        <div className="field">
          <label htmlFor="member-email">Email</label>
          <input
            id="member-email"
            className="input"
            type="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="member-role">Role</label>
          <select
            id="member-role"
            className="select"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r[0]!.toUpperCase() + r.slice(1)}
              </option>
            ))}
          </select>
          <span className="muted small">{ROLE_HELP[role]}</span>
        </div>
        <div className="field">
          <label htmlFor="member-password">Starting password</label>
          <input
            id="member-password"
            className="input"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="dialog-actions">
          <button className="btn" type="button" onClick={onClose} disabled={create.isPending}>
            Cancel
          </button>
          <button className="btn btn-primary" type="submit" disabled={create.isPending}>
            {create.isPending ? "Adding..." : "Add member"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function TeamPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const users = useUsers();
  const updateRole = useUpdateUserRole();
  const [adding, setAdding] = useState(false);
  const close = useCallback(() => setAdding(false), []);

  return (
    <main className="page">
      <div className="page-header">
        <div>
          <h1>Team</h1>
          <p className="muted">People in your organization and what each role can do.</p>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" type="button" onClick={() => setAdding(true)}>
            Add team member
          </button>
        )}
      </div>

      {users.isPending && <p className="muted">Loading team...</p>}
      {users.isError && (
        <div className="alert-error" role="alert">
          Could not load the team.
        </div>
      )}
      {updateRole.isError && <div className="alert-error">{errorMessage(updateRole.error)}</div>}

      {users.data && (
        <div className="panel table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>What they can do</th>
              </tr>
            </thead>
            <tbody>
              {users.data.map((member) => (
                <tr key={member.id}>
                  <td>
                    {member.email}
                    {member.id === user?.id && <span className="muted"> (you)</span>}
                  </td>
                  <td>
                    {isAdmin && member.id !== user?.id ? (
                      <select
                        className="select"
                        aria-label={`Role of ${member.email}`}
                        value={member.role}
                        disabled={updateRole.isPending}
                        onChange={(e) =>
                          updateRole.mutate({ id: member.id, role: e.target.value as Role })
                        }
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r[0]!.toUpperCase() + r.slice(1)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      member.role[0]!.toUpperCase() + member.role.slice(1)
                    )}
                  </td>
                  <td className="muted">{ROLE_HELP[member.role]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {adding && <AddUserDialog onClose={close} />}
    </main>
  );
}
