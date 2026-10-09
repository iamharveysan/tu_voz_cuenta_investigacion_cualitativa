import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronRight, LogOut, Sparkles } from "lucide-react";
import { api } from "../lib/api";
import { Logo } from "./ui";

export function AdminTopbar({ crumb, ai }: { crumb?: ReactNode; ai?: { mode: string; model: string } }) {
  const navigate = useNavigate();
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/admin" className="brand" style={{ color: "#fff" }}>
            <Logo light size={34} />
            <span className="brand-name">Tu voz cuenta</span>
          </Link>
          <nav className="topbar-crumb grow">
            <ChevronRight size={16} />
            <Link to="/admin">Sesiones</Link>
            {crumb && (
              <>
                <ChevronRight size={16} />
                <strong>{crumb}</strong>
              </>
            )}
          </nav>
          {ai && (
            <span className="pill" style={{ background: "rgba(255,255,255,0.1)", color: "#fff" }} title="Modelo de IA configurado en el servidor">
              <Sparkles size={14} /> {ai.mode === "mock" ? "IA simulada" : ai.model}
            </span>
          )}
          <button
            className="btn btn-quiet btn-sm"
            onClick={async () => {
              await api.post("/api/admin/logout").catch(() => {});
              navigate("/admin/login");
            }}
          >
            <LogOut size={16} /> Salir
          </button>
        </div>
      </header>
      {ai?.mode === "mock" && (
        <div className="mock-strip">
          Modo simulado (AI_MODE=mock): las clasificaciones son reglas locales de prueba, no análisis de OpenAI. Úsalo solo para
          ensayar.
        </div>
      )}
    </>
  );
}
