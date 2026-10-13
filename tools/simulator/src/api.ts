import { config } from "./config.js";

export type SensorType =
  | "vibration_rms"
  | "temperature"
  | "current"
  | "pressure"
  | "rpm";

export interface Plant {
  id: string;
  name: string;
}

export interface Machine {
  id: string;
  plantId: string;
  name: string;
}

export interface Sensor {
  id: string;
  machineId: string;
  name: string;
  type: SensorType;
  unit: string;
  samplingHz: number;
  thresholds: {
    min: number | null;
    max: number | null;
    rateOfChange: number | null;
  };
}

async function request<T>(
  pathname: string,
  token?: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(new URL(pathname, config.API_URL), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    throw new Error(
      `${init?.method ?? "GET"} ${pathname} failed with ${res.status}: ${await res.text()}`,
    );
  }
  return (await res.json()) as T;
}

export async function loadFleet() {
  const login = await request<{ accessToken: string; user: { orgId: string } }>(
    "/api/auth/login",
    undefined,
    {
      method: "POST",
      body: JSON.stringify({
        email: config.SIM_EMAIL,
        password: config.SIM_PASSWORD,
      }),
    },
  );
  const token = login.accessToken;

  const [plants, machines, sensors] = await Promise.all([
    request<Plant[]>("/api/plants", token),
    request<Machine[]>("/api/machines", token),
    request<Sensor[]>("/api/sensors", token),
  ]);

  return { orgId: login.user.orgId, plants, machines, sensors };
}
