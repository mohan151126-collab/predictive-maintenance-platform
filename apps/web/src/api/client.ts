export interface FieldIssue {
  path: (string | number)[];
  message: string;
}

export class ApiError extends Error {
  status: number;
  issues: FieldIssue[];

  constructor(status: number, message: string, issues: FieldIssue[] = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.issues = issues;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  auth?: boolean;
}

let accessToken: string | null = null;
let refreshInFlight: Promise<boolean> | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

async function doRefresh(): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { accessToken: string };
    accessToken = data.accessToken;
    return true;
  } catch {
    return false;
  }
}

export function refreshAccessToken(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = doRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

function send(path: string, { method = "GET", body, auth = true }: RequestOptions) {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;

  return fetch(path, {
    method,
    headers,
    credentials: "include",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function api<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const useAuth = options.auth !== false;
  let res = await send(path, options);

  if (res.status === 401 && useAuth && (await refreshAccessToken())) {
    res = await send(path, options);
  }

  if (!res.ok) {
    const data: { error?: string; issues?: FieldIssue[] } = await res
      .json()
      .catch(() => ({}));

    if (res.status === 401 && useAuth) {
      accessToken = null;
      onUnauthorized?.();
    }
    throw new ApiError(res.status, data.error ?? res.statusText, data.issues);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
