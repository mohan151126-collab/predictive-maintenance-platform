import {
  Bell,
  Factory,
  SignOut,
  UsersThree,
  Wrench,
  type Icon,
} from "@phosphor-icons/react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { useAlerts } from "../api/hooks";
import { useAuth } from "../auth/AuthContext";
import { useLive } from "../live/LiveContext";
import { BrandMark } from "./BrandMark";

const LIVE_LABEL = { live: "Live", connecting: "Connecting", offline: "Offline" } as const;

function NavItem({ to, icon: IconComponent, children }: { to: string; icon: Icon; children: React.ReactNode }) {
  return (
    <NavLink to={to}>
      <IconComponent size={18} weight="regular" aria-hidden="true" />
      {children}
    </NavLink>
  );
}

export function AppLayout() {
  const { user, logout } = useAuth();
  const { status } = useLive();
  const activeAlerts = useAlerts({ status: "active" });
  const count = activeAlerts.data?.length ?? 0;
  const canSeeTeam = user?.role === "admin" || user?.role === "manager";

  return (
    <div className="shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      <aside className="sidebar">
        <Link to="/plants" className="brand">
          <BrandMark />
          <span>Predictive Maintenance</span>
        </Link>

        <nav className="side-nav" aria-label="Main">
          <NavItem to="/plants" icon={Factory}>
            Plants
          </NavItem>
          <NavItem to="/alerts" icon={Bell}>
            Alerts
            {count > 0 && (
              <span className="nav-count" aria-label={`${count} active`}>
                {count}
              </span>
            )}
          </NavItem>
          <NavItem to="/work-orders" icon={Wrench}>
            Work orders
          </NavItem>
          {canSeeTeam && (
            <NavItem to="/team" icon={UsersThree}>
              Team
            </NavItem>
          )}
        </nav>

        <div className="sidebar-footer">
          <span
            className={`live-indicator live-${status}`}
            title="Connection used for live updates"
          >
            {LIVE_LABEL[status]}
          </span>
          <span className="sidebar-user">
            <span className="sidebar-email">{user?.email}</span>
            <span className="muted small">{user?.role}</span>
          </span>
          <button className="btn" type="button" onClick={() => void logout()}>
            <SignOut size={16} weight="regular" aria-hidden="true" />
            Sign out
          </button>
        </div>
      </aside>

      <div id="main-content" className="main-col" tabIndex={-1}>
        <Outlet />
      </div>
    </div>
  );
}
