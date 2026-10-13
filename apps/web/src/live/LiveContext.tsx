import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { io, type Socket } from "socket.io-client";
import { getAccessToken, refreshAccessToken } from "../api/client";
import type { Machine, MachineHealth } from "../api/types";
import { useAuth } from "../auth/AuthContext";

export type LiveStatus = "connecting" | "live" | "offline";

interface LiveContextValue {
  socket: Socket | null;
  status: LiveStatus;
}

const LiveContext = createContext<LiveContextValue>({ socket: null, status: "offline" });

function withHealth(machine: Machine, health: MachineHealth): Machine {
  return {
    ...machine,
    status: health.status,
    healthScore: health.healthScore,
    healthReasons: health.healthReasons,
    healthUpdatedAt: health.healthUpdatedAt,
  };
}

export function LiveProvider({ children }: { children: ReactNode }) {
  const { status: authStatus } = useAuth();
  const queryClient = useQueryClient();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [status, setStatus] = useState<LiveStatus>("offline");
  const signedIn = authStatus === "signedIn";

  useEffect(() => {
    if (!signedIn) return;

    const next = io({
      auth: (callback) => callback({ token: getAccessToken() }),
      transports: ["websocket"],
    });
    setStatus("connecting");

    next.on("connect", () => setStatus("live"));
    next.on("disconnect", () => setStatus("offline"));
    next.io.on("reconnect_attempt", () => setStatus("connecting"));
    next.on("connect_error", async (error) => {
      if (error.message === "unauthorized" && (await refreshAccessToken())) {
        next.connect();
      } else {
        setStatus("offline");
      }
    });

    next.on("machine:health", (health: MachineHealth) => {
      queryClient.setQueryData<Machine>(["machines", "detail", health.machineId], (old) =>
        old ? withHealth(old, health) : old,
      );
      queryClient.setQueriesData<Machine[]>({ queryKey: ["machines", "list"] }, (old) =>
        old?.map((machine) => (machine.id === health.machineId ? withHealth(machine, health) : machine)),
      );
    });

    next.on("alert", () => {
      void queryClient.invalidateQueries({ queryKey: ["alerts"] });
    });

    setSocket(next);
    return () => {
      next.disconnect();
      setSocket(null);
      setStatus("offline");
    };
  }, [signedIn, queryClient]);

  const value = useMemo(() => ({ socket, status }), [socket, status]);

  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

export function useLive() {
  return useContext(LiveContext);
}
