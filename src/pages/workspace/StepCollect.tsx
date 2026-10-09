import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { WordCloud } from "../../components/WordCloud";
import { questionWords, useCloudVisible, useHiddenWords, wordFrequencies } from "../../lib/words";
import { ArrowRight, Clock, Cloud, Copy, Hourglass, Inbox, MessageSquareText, Play, Users } from "lucide-react";
import { api } from "../../lib/api";
import { Empty, useToast } from "../../components/ui";
import { QUESTION_COLORS, timeAgo } from "../../lib/analytics";
import type { SessionOverview } from "../../../shared/types";
import type { Act } from "./Workspace";

export default function StepCollect({ data, url, act, onNext }: { data: SessionOverview; url: string; act: Act; onNext: () => void }) {
  const s = data.session;
  const [filter, setFilter] = useState<number | null>(null);
  const toast = useToast();

  // Marca como "nuevas" las respuestas que llegan después de abrir la vista.
  const seen = useRef<Set<string> | null>(null);
  const fresh = new Set<string>();
  if (seen.current === null) seen.current = new Set(data.responses.map((r) => r.id));
  else for (const r of data.responses) if (!seen.current.has(r.id)) fresh.add(r.id);
  useEffect(() => {
    if (fresh.size === 0) return;
    const t = setTimeout(() => fresh.forEach((id) => seen.current!.add(id)), 1800);
    return () => clearTimeout(t);
  });

  const items = [...data.responses].filter((r) => filter === null || r.questionOrd === filter).reverse();
  const lastAt = data.responses.reduce<string | null>((m, r) => (!m || r.createdAt > m ? r.createdAt : m), null);

  return (
    <>
      <div className="step-intro">
        <div>
          <span className="eyebrow">Paso 1 · Recolección de datos</span>
          <h2>Las voces del grupo, en tiempo real</h2>
          <p>
            Cada estudiante responde de forma anónima desde su celular. Aquí todavía <b>no interviene la IA</b>: solo reunimos el corpus de
            datos cualitativos que vamos a analizar.
          </p>
        </div>
        <button className="btn btn-dark" onClick={onNext} disabled={data.responses.length === 0}>
          Siguiente: codificación <ArrowRight size={16} />
        </button>
      </div>

      <div className="grid-2">
        <div className="stack" style={{ minWidth: 0 }}>
        <div className="card card-pad">
          <div className="card-head">
            <div>
              <div className="card-title">Invita a participar</div>
              <div className="card-sub">Escanea el código o abre el enlace</div>
            </div>
          </div>
          {s.isDemo ? (
            <div className="callout">
              <MessageSquareText size={18} />
              La sesión demo ya trae {s.participantCount} participaciones sintéticas y no recibe respuestas nuevas.
            </div>
          ) : (
            <>
              <div className="qr-box" style={{ opacity: s.status === "active" ? 1 : 0.35, transition: "opacity .3s" }}>
                <QRCodeSVG value={url} size={240} level="M" fgColor="#102A43" marginSize={1} />
              </div>
              <div style={{ textAlign: "center", margin: "14px 0" }}>
                <div className="small muted">Código de la sesión</div>
                <div className="big-code">{s.publicCode}</div>
              </div>
              <div className="link-box">
                <code>{url}</code>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => navigator.clipboard.writeText(url).then(() => toast("Enlace copiado"), () => toast(url))}
                >
                  <Copy size={14} />
                </button>
              </div>
              {s.status !== "active" && (
                <button
                  className="btn btn-primary"
                  style={{ width: "100%", marginTop: 14 }}
                  onClick={() => act(() => api.post(`/api/admin/sessions/${s.id}/status`, { status: "active" }), "Sesión activa")}
                >
                  <Play size={16} /> {s.status === "closed" ? "Reabrir recepción" : "Activar para recibir respuestas"}
                </button>
              )}
            </>
          )}
        </div>
        <CloudCard data={data} filter={filter} />
        </div>

        <div className="stack" style={{ minWidth: 0 }}>
          <div className="stat-row">
            <Stat icon={<Users size={14} />} label="Participantes" value={s.participantCount} />
            <Stat icon={<MessageSquareText size={14} />} label="Respuestas" value={s.responseCount} sub="= 3 × participantes" />
            <Stat icon={<Hourglass size={14} />} label="Sin analizar" value={data.pendingCount} />
          </div>

          <div className="card">
            <div className="card-pad" style={{ paddingBottom: 12 }}>
              <div className="card-head" style={{ marginBottom: 12 }}>
                <div>
                  <div className="card-title">Respuestas recibidas</div>
                  <div className="card-sub row" style={{ gap: 6 }}>
                    <Clock size={13} /> {lastAt ? `Última ${timeAgo(lastAt, data.serverTime)}` : "Esperando la primera respuesta"} · actualización automática
                  </div>
                </div>
              </div>
              <div className="segmented">
                <button className={filter === null ? "on" : ""} onClick={() => setFilter(null)}>
                  Todas
                </button>
                {data.questions.map((q) => (
                  <button key={q.id} className={filter === q.ord ? "on" : ""} onClick={() => setFilter(q.ord)} title={q.text}>
                    Pregunta {q.ord}
                  </button>
                ))}
              </div>
              {filter !== null && <p className="small muted" style={{ marginTop: 10 }}>{data.questions[filter - 1]?.text}</p>}
            </div>
            <div style={{ padding: "0 22px 22px" }}>
              {items.length === 0 ? (
                <Empty icon={<Inbox size={24} />} title="Aún no hay respuestas">
                  {s.status === "active"
                    ? "Las respuestas aparecerán aquí en cuanto los estudiantes envíen el formulario."
                    : "Activa la sesión y comparte el QR para empezar a recibir respuestas."}
                </Empty>
              ) : (
                <div className="feed">
                  {items.map((r) => (
                    <div key={r.id} className={`feed-item ${fresh.has(r.id) ? "new" : ""}`}>
                      <div className="feed-meta">
                        <span className="code-tag">{r.code}</span>
                        <span style={{ color: QUESTION_COLORS[r.questionOrd - 1], fontWeight: 700 }}>Pregunta {r.questionOrd}</span>
                        <span>· {timeAgo(r.createdAt, data.serverTime)}</span>
                      </div>
                      <div className="feed-text">{r.text}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function CloudCard({ data, filter }: { data: SessionOverview; filter: number | null }) {
  const { hidden, hide, show } = useHiddenWords(data.session.id);
  const { visible, setVisible } = useCloudVisible(data.session.id);
  const scoped = data.responses.filter((r) => filter === null || r.questionOrd === filter);
  const qs = data.questions.filter((q) => filter === null || q.ord === filter).map((q) => q.text);
  const words = wordFrequencies(scoped.map((r) => r.text), questionWords(qs), hidden, 30);
  return (
    <div className="card card-pad">
      <div className="card-head" style={{ marginBottom: 12 }}>
        <div>
          <div className="card-title">Nube de palabras</div>
          <div className="card-sub">{filter === null ? "Todas las preguntas" : `Pregunta ${filter}`} · clic en una palabra para ocultarla</div>
        </div>
        <label className="switch" title="Mostrar u ocultar la nube en la pantalla de proyección">
          <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} />
          <Cloud size={15} />
        </label>
      </div>
      {words.length === 0 ? (
        <p className="small muted">Las palabras aparecerán con las primeras respuestas.</p>
      ) : (
        <WordCloud words={words} min={12} max={30} onWordClick={(w) => hide(w.key)} clickHint="clic para ocultar" />
      )}
      {hidden.size > 0 && (
        <div className="hidden-words">
          <span className="small muted" style={{ width: "100%" }}>
            Ocultas (clic para restaurar):
          </span>
          {[...hidden].map((k) => (
            <button key={k} onClick={() => show(k)}>
              {k}
            </button>
          ))}
        </div>
      )}
      <p className="small muted" style={{ marginTop: 12 }}>
        Frecuencia no es significado: por eso, en el paso 2, codificamos.
      </p>
    </div>
  );
}

function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: number; sub?: string }) {
  return (
    <div className="card stat">
      <div className="stat-label">
        {icon}
        {label}
      </div>
      <div key={value} className="stat-value bump">
        {value}
      </div>
      {sub && <div className="small muted">{sub}</div>}
    </div>
  );
}
