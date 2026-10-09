export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      credentials: "same-origin",
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Sin conexión con el servidor. Revisa tu internet e inténtalo de nuevo.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error || `Error ${res.status}`);
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>("GET", url),
  post: <T>(url: string, body?: unknown) => request<T>("POST", url, body ?? {}),
  put: <T>(url: string, body?: unknown) => request<T>("PUT", url, body ?? {}),
  patch: <T>(url: string, body?: unknown) => request<T>("PATCH", url, body ?? {}),
  del: <T>(url: string, body?: unknown) => request<T>("DELETE", url, body ?? {}),
};

/** Acceso seguro a almacenamiento del navegador (puede no estar disponible). */
export const storage = {
  get(kind: "local" | "session", key: string): string | null {
    try {
      return (kind === "local" ? localStorage : sessionStorage).getItem(key);
    } catch {
      return null;
    }
  },
  set(kind: "local" | "session", key: string, value: string) {
    try {
      (kind === "local" ? localStorage : sessionStorage).setItem(key, value);
    } catch {
      /* sin almacenamiento: la app sigue funcionando */
    }
  },
  remove(kind: "local" | "session", key: string) {
    try {
      (kind === "local" ? localStorage : sessionStorage).removeItem(key);
    } catch {
      /* noop */
    }
  },
};
