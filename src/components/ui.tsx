import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import type { Sentiment, SessionStatus } from "../../shared/types";
import { SENTIMENT_META } from "../lib/analytics";

export function Logo({ size = 36, light = false }: { size?: number; light?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="16" fill={light ? "rgba(255,255,255,0.12)" : "#102A43"} />
      <path d="M14 22a8 8 0 0 1 8-8h20a8 8 0 0 1 8 8v12a8 8 0 0 1-8 8H30l-9 8v-8a8 8 0 0 1-7-8z" fill="#2463EB" />
      <g fill="#fff">
        <rect x="22" y="25" width="3.5" height="6" rx="1.75" />
        <rect x="28.5" y="21" width="3.5" height="14" rx="1.75" />
        <rect x="35" y="23.5" width="3.5" height="9" rx="1.75" />
        <rect x="41.5" y="26" width="3.5" height="4" rx="1.75" />
      </g>
    </svg>
  );
}

export function Brand({ light = false, sub = "Laboratorio de investigación cualitativa" }: { light?: boolean; sub?: string }) {
  return (
    <span className="brand">
      <Logo light={light} />
      <span>
        <span className="brand-name" style={{ display: "block" }}>
          Tu voz cuenta
        </span>
        {sub && <span className="brand-sub">{sub}</span>}
      </span>
    </span>
  );
}

/** Ondas de voz decorativas. */
export function VoiceWave({ width = 220, color = "#fff" }: { width?: number; color?: string }) {
  const bars = [18, 34, 54, 40, 70, 46, 82, 58, 36, 64, 44, 26, 50, 30, 16];
  return (
    <svg width={width} height={width * 0.45} viewBox="0 0 300 135" aria-hidden="true">
      {bars.map((h, i) => (
        <rect key={i} x={i * 20 + 4} y={(135 - h) / 2} width="10" height={h} rx="5" fill={color} />
      ))}
    </svg>
  );
}

export function StatusPill({ status, isDemo }: { status: SessionStatus; isDemo?: boolean }) {
  if (isDemo) return <span className="pill pill-demo pill-dot">Demo · sintética</span>;
  if (status === "active") return <span className="pill pill-live pill-dot">Activa · recibiendo</span>;
  if (status === "closed") return <span className="pill pill-closed pill-dot">Cerrada</span>;
  return <span className="pill pill-draft pill-dot">Borrador</span>;
}

export function SentimentChip({ s, human }: { s: Sentiment | null; human?: boolean }) {
  if (!s) return <span className="chip">—</span>;
  const m = SENTIMENT_META[s];
  return (
    <span className="chip chip-sent" style={{ background: m.soft, color: m.color }} title={human ? "Corregido por el docente" : undefined}>
      <span style={{ width: 7, height: 7, borderRadius: 9, background: m.color }} />
      {m.label}
      {human && " ✎"}
    </span>
  );
}

export function Modal({
  title,
  sub,
  onClose,
  children,
  footer,
  width,
}: {
  title: ReactNode;
  sub?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" style={width ? { maxWidth: width } : undefined}>
        <div className="modal-head">
          <div>
            <h3>{title}</h3>
            {sub && <p className="card-sub">{sub}</p>}
          </div>
          <button className="btn btn-quiet btn-icon" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Drawer({ title, sub, onClose, children }: { title: ReactNode; sub?: ReactNode; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="overlay drawer-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-modal="true">
        <div className="drawer-head">
          <div>
            <h3 style={{ fontSize: 19, fontWeight: 800 }}>{title}</h3>
            {sub && <p className="card-sub">{sub}</p>}
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <div className="drawer-body">{children}</div>
      </aside>
    </div>
  );
}

export function Empty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h4>{title}</h4>
      {children && <div style={{ maxWidth: 420, fontSize: 14 }}>{children}</div>}
    </div>
  );
}

// ─────────── Notificaciones ───────────
type ToastMsg = { text: string; err?: boolean; id: number };
const ToastCtx = createContext<(text: string, err?: boolean) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  const show = useCallback((text: string, err?: boolean) => setMsg({ text, err, id: Date.now() }), []);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), msg.err ? 5000 : 2800);
    return () => clearTimeout(t);
  }, [msg]);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && (
        <div key={msg.id} className={`toast ${msg.err ? "err" : ""}`} role="status">
          {msg.err ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
          {msg.text}
        </div>
      )}
    </ToastCtx.Provider>
  );
}
