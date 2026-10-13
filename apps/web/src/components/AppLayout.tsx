import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export function AppLayout() {
  const { user, logout } = useAuth();

  return (
    <>
      <header className="shell-header">
        <Link to="/plants" className="shell-brand">
          Predictive Maintenance
        </Link>

        <nav className="shell-nav" aria-label="Main">
          <NavLink to="/plants">Plants</NavLink>
        </nav>

        <div className="shell-user">
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
