import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, Cpu, Loader2, Lock, RefreshCw, Sparkles, Tags } from "lucide-react";
import { api } from "../../lib/api";
import { Empty, Modal, SentimentChip } from "../../components/ui";
import { activeRun, lastRun } from "../../hooks/useOverview";
import { effective, fmtDateTime, isAnalyzed, pct, QUESTION_COLORS } from "../../lib/analytics";
import type { ResponseItem, SessionOverview } from "../../../shared/types";
import type { Act } from "./Workspace";

export default function StepClassify({ data, act, onNext }: { data: SessionOverview; act: Act; onNext: () => void }) {
  const s = data.session;
  const running = activeRun(data);
  const classifyRun = running?.kind === "classify" ? running : null;
  const last = lastRun(data, "classify");
  const analyzed = data.responses.filter(isAnalyzed).length;
  const review = data.responses.filter((r) => r.analysis?.status === "requiere_revision").length;
  const failed = data.responses.filter((r) => r.analysis?.status === "error").length;
  const [confirmAll, setConfirmAll] = useState(false);
  const [filter, setFilter] = useState<number | null>(null);
  const stale = !!(last && s.codebookUpdatedAt && analyzed > 0 && s.codebookUpdatedAt > last.startedAt);

  // Resalta las filas que reciben análisis mientras se observa la vista.
  const prev = useRef<Map<string, string | null>>(new Map());
  const flash = new Set<string>();
  for (const r of data.responses) {
    const p = prev.current.get(r.id);
    const cur = r.analysis?.createdAt ?? null;
    if (prev.current.size > 0 && cur && p !== cur) flash.add(r.id);
  }
  useEffect(() => {
    prev.current = new Map(data.responses.map((r) => [r.id, r.analysis?.createdAt ?? null]));
  });

  const start = (mode: "new" | "all") =>
    act(() => api.post(`/api/admin/sessions/${s.id}/classify`, { mode }), mode === "all" ? "Reclasificando todas las respuestas…" : "Clasificando respuestas pendientes…");

  const rows = data.responses.filter((r) => filter === null || r.questionOrd === filter);

  if (!s.codebookApprovedAt)
    return (
      <>
        <Intro />
        <div className="card">
          <Empty icon={<Lock size={24} />} title="Primero aprueba el libro de códigos">
            La clasificación usa exclusivamente las categorías que validaste en el paso 3. Así todas las respuestas se codifican con el mismo
            criterio.
          </Empty>
        </div>
      </>
    );

  return (
    <>
      <Intro>
        {analyzed > 0 && (
          <button className="btn btn-dark" onClick={onNext} disabled={!!classifyRun}>
            Siguiente: resultados <ArrowRight size={16} />
          </button>
        )}
      </Intro>

      <div className="card card-pad" style={{ marginBottom: 20 }}>
        <div className="row wrap" style={{ justifyContent: "space-between", gap: 20 }}>
          <div className="row wrap" style={{ gap: 28 }}>
            <Metric label="Clasificadas" value={`${analyzed}`} sub={`de ${data.responses.length}`} />
            <Metric label="Pendientes" value={`${data.pendingCount}`} tone={data.pendingCount ? "warn" : undefined} />
            <Metric label="Para revisar" value={`${review}`} sub="sin cita verificable" />
            {failed > 0 && <Metric label="Con error" value={`${failed}`} tone="err" />}
          </div>
          <div className="row wrap">
            <button className="btn btn-ghost" disabled={!!running || analyzed === 0} onClick={() => setConfirmAll(true)}>
              <RefreshCw size={16} /> Reclasificar todas
            </button>
            <button className="btn btn-ai btn-lg" disabled={!!running || data.pendingCount === 0} onClick={() => start("new")}>
              {classifyRun ? <Loader2 size={18} className="spin" /> : <Sparkles size={18} />}
              {classifyRun ? "Clasificando…" : data.pendingCount ? `Analizar con IA (${data.pendingCount} pendientes)` : "Todo clasificado"}
            </button>
          </div>
        </div>

        {classifyRun && (
          <div style={{ marginTop: 18 }}>
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
              <span className="small" style={{ fontWeight: 600 }}>
                Procesadas {classifyRun.processed} de {classifyRun.total}
                {classifyRun.failed > 0 && <span style={{ color: "var(--err-ink)" }}> · {classifyRun.failed} con error</span>}
              </span>
              <span className="small muted">{pct(classifyRun.processed, classifyRun.total)}%</span>
            </div>
            <div className="progress">
              <div style={{ width: `${pct(classifyRun.processed, classifyRun.total)}%` }} />
            </div>
          </div>
        )}

        {!classifyRun && last && (
          <div className="row wrap small muted" style={{ marginTop: 16, gap: 18 }}>
            <span className="row" style={{ gap: 6 }}>
              {last.status === "completed" ? <CheckCircle2 size={14} color="var(--pos)" /> : <AlertTriangle size={14} color="#D97706" />}
              Última ejecución: {last.status === "completed" ? "completada" : last.status === "partial" ? "parcial" : "fallida"}
            </span>
            <span className="row" style={{ gap: 6 }}>
              <Cpu size={14} /> {last.model}
            </span>
            <span className="row" style={{ gap: 6 }}>
              <Clock size={14} /> {fmtDateTime(last.startedAt)}
            </span>
            <span>
              {last.processed - last.failed} de {last.total} respuestas ({last.mode === "all" ? "todas" : "solo nuevas"})
            </span>
          </div>
        )}
        {!classifyRun && last && last.failed > 0 && (
          <div className="callout callout-err" style={{ marginTop: 14 }}>
            <AlertTriangle size={18} />
            <div>
              {last.failed} respuestas no se pudieron clasificar{last.error ? `: ${last.error}` : "."} Los resultados exitosos se conservaron;
              pulsa «Analizar con IA» para reintentar solo las pendientes.
            </div>
          </div>
        )}
        {stale && !classifyRun && (
          <div className="callout callout-warn" style={{ marginTop: 14 }}>
            <AlertTriangle size={18} />
            <div>El libro de códigos cambió después de la última clasificación. Para aplicar los cambios, usa «Reclasificar todas».</div>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-pad row wrap" style={{ justifyContent: "space-between", paddingBottom: 14 }}>
          <div className="card-title">Matriz de codificación</div>
          <div className="segmented">
            <button className={filter === null ? "on" : ""} onClick={() => setFilter(null)}>
              Todas
            </button>
            {data.questions.map((q) => (
              <button key={q.id} className={filter === q.ord ? "on" : ""} onClick={() => setFilter(q.ord)}>
                P{q.ord}
              </button>
            ))}
          </div>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th style={{ width: 90 }}>Código</th>
                <th>Respuesta</th>
                <th style={{ width: 130 }}>Sentimiento</th>
                <th style={{ width: 260 }}>Categorías</th>
                <th style={{ width: 120 }}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Row key={r.id} r={r} flash={flash.has(r.id)} running={!!classifyRun} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {confirmAll && (
        <Modal
          title="¿Reclasificar todas las respuestas?"
          sub={`Se volverán a enviar ${data.responses.length} respuestas a la IA con el libro de códigos actual. Se reemplazarán los resultados anteriores y las correcciones manuales.`}
          onClose={() => setConfirmAll(false)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setConfirmAll(false)}>
                Cancelar
              </button>
              <button
                className="btn btn-ai"
                onClick={() => {
                  setConfirmAll(false);
                  start("all");
                }}
              >
                <RefreshCw size={16} /> Reclasificar todas
              </button>
            </>
          }
        >
          <p className="muted small">Úsalo cuando cambies el libro de códigos o quieras repetir el análisis.</p>
        </Modal>
      )}
    </>
  );
}

function Intro({ children }: { children?: React.ReactNode }) {
  return (
    <div className="step-intro">
      <div>
        <span className="eyebrow">Paso 4 · Clasificación</span>
        <h2>Cada respuesta, leída en el contexto de su pregunta</h2>
        <p>
          La IA asigna a cada respuesta un <b>sentimiento</b> (positivo, negativo, neutral o mixto), de 1 a 3 <b>categorías</b> del libro
          aprobado, una justificación y <b>citas literales</b> que el servidor verifica contra el texto original.
        </p>
      </div>
      {children}
    </div>
  );
}

function Metric({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "warn" | "err" }) {
  const color = tone === "err" ? "var(--err-ink)" : tone === "warn" ? "#B45309" : undefined;
  return (
    <div>
      <div className="small muted" style={{ fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.03em", color }}>
        {value} {sub && <span className="small muted" style={{ fontWeight: 600, letterSpacing: 0 }}>{sub}</span>}
      </div>
    </div>
  );
}

function Row({ r, flash, running }: { r: ResponseItem; flash: boolean; running: boolean }) {
  const a = r.analysis;
  const e = a && a.status !== "error" ? effective(a) : null;
  return (
    <tr className={flash ? "flash" : undefined}>
      <td>
        <span className="code-tag" style={{ borderColor: QUESTION_COLORS[r.questionOrd - 1] + "55" }}>
          {r.code}
        </span>
      </td>
      <td>
        <div className="clamp-2" title={r.text}>
          {r.text}
        </div>
      </td>
      <td>{e ? <SentimentChip s={e.sentiment} human={!!a?.humanSentiment} /> : <span className="muted small">—</span>}</td>
      <td>
        {e ? (
          <div className="row wrap" style={{ gap: 5 }}>
            {e.categories.map((c) => (
              <span key={c} className="chip">
                <Tags size={11} /> {c}
              </span>
            ))}
          </div>
        ) : (
          <span className="muted small">—</span>
        )}
      </td>
      <td>
        {!a ? (
          running ? (
            <span className="small muted row" style={{ gap: 5 }}>
              <Loader2 size={13} className="spin" /> en cola
            </span>
          ) : (
            <span className="chip">Pendiente</span>
          )
        ) : a.status === "error" ? (
          <span className="chip" style={{ background: "var(--err-bg)", color: "var(--err-ink)" }} title={a.error ?? ""}>
            Error
          </span>
        ) : a.validated ? (
          <span className="chip" style={{ background: "var(--ok-bg)", color: "var(--ok-ink)" }}>
            Validada
          </span>
        ) : a.status === "requiere_revision" ? (
          <span className="chip" style={{ background: "var(--warn-bg)", color: "var(--warn-ink)" }}>
            Revisar
          </span>
        ) : (
          <span className="chip" style={{ background: "var(--blue-50)", color: "var(--blue)" }}>
            IA
          </span>
        )}
      </td>
    </tr>
  );
}
