import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  api,
  refreshAccessToken,
  setAccessToken,
  setUnauthorizedHandler,
} from "../api/client";
import type { User } from "../api/types";

type AuthStatus = "loading" | "signedOut" | "signedIn";

interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  register: (
    organizationName: string,
    email: string,
    password: string,
  ) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      try {
        if (await refreshAccessToken()) {
          const me = await api<User>("/api/me");
          if (!cancelled) setUser(me);
        }
      } catch {
        // No valid session; the user will see the sign-in page.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void restoreSession();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      queryClient.clear();
    });
    return () => setUnauthorizedHandler(null);
  }, [queryClient]);

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await api<{ accessToken: string; user: User }>(
        "/api/auth/login",
        { method: "POST", body: { email, password }, auth: false },
      );
      queryClient.clear();
      setAccessToken(data.accessToken);
      setUser(data.user);
    },
    [queryClient],
  );

  const register = useCallback(
    async (organizationName: string, email: string, password: string) => {
      await api("/api/auth/register", {
        method: "POST",
        body: { organizationName, email, password },
        auth: false,
      });
      await login(email, password);
    },
    [login],
  );

  const logout = useCallback(async () => {
    try {
      await api("/api/auth/logout", { method: "POST", auth: false });
    } finally {
      setAccessToken(null);
      setUser(null);
      queryClient.clear();
    }
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status: loading ? "loading" : user ? "signedIn" : "signedOut",
      user,
      login,
      register,
      logout,
    }),
    [loading, user, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
