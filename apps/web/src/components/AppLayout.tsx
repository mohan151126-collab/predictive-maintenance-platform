import { Link, NavLink, Outlet } from "react-router-dom";
import { useAlerts } from "../api/hooks";
import { useAuth } from "../auth/AuthContext";
import { useLive } from "../live/LiveContext";

const LIVE_LABEL = { live: "Live", connecting: "Connecting", offline: "Offline" } as const;

export function AppLayout() {
  const { user, logout } = useAuth();
  const { status } = useLive();
  const activeAlerts = useAlerts({ status: "active" });
  const count = activeAlerts.data?.length ?? 0;

  return (
    <>
      <header className="shell-header">
        <Link to="/plants" className="shell-brand">
          Predictive Maintenance
        </Link>

        <nav className="shell-nav" aria-label="Main">
          <NavLink to="/plants">Plants</NavLink>
          <NavLink to="/alerts">
            Alerts
            {count > 0 && (
              <span className="nav-count" aria-label={`${count} active`}>
                {count}
              </span>
            )}
          </NavLink>
          <NavLink to="/work-orders">Work orders</NavLink>
          {(user?.role === "admin" || user?.role === "manager") && (
            <NavLink to="/team">Team</NavLink>
          )}
        </nav>

        <div className="shell-user">
          <span
            className={`live-indicator live-${status}`}
            title="Connection used for live updates"
          >
            {LIVE_LABEL[status]}
          </span>
          <span>
            {user?.email} ({user?.role})
          </span>
          <button className="btn" type="button" onClick={() => void logout()}>
            Sign out
          </button>
        </div>
      </header>

      <Outlet />
    </>
  );
}
