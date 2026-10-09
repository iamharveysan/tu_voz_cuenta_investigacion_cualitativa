import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import type { SessionOverview } from "../../shared/types";

/** Estado de la sesión con actualización periódica (más rápida mientras corre un análisis). */
export function useOverview(id: string) {
  const [data, setData] = useState<SessionOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const dataRef = useRef<SessionOverview | null>(null);

  const refresh = useCallback(async () => {
    try {
      const d = await api.get<SessionOverview>(`/api/admin/sessions/${id}`);
      dataRef.current = d;
      setData(d);
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) navigate("/admin/login", { replace: true });
      else setError(e instanceof Error ? e.message : "Error de conexión");
    }
  }, [id, navigate]);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const loop = async () => {
      await refresh();
      if (!alive) return;
      const running = dataRef.current?.runs.some((r) => r.status === "running" || r.status === "queued");
      timer = setTimeout(loop, running ? 1000 : 2500);
    };
    loop();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [refresh]);

  return { data, error, refresh };
}

export const activeRun = (d: SessionOverview | null) => d?.runs.find((r) => r.status === "running" || r.status === "queued") ?? null;
export const lastRun = (d: SessionOverview | null, kind: "codebook" | "classify" | "synthesis") => d?.runs.find((r) => r.kind === kind) ?? null;
