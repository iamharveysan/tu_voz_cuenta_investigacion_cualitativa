import { useState } from "react";
import { AlertTriangle, BarChart3, Info, Lightbulb, Loader2, Quote, RotateCcw, ShieldCheck, Sparkles } from "lucide-react";
import { api } from "../../lib/api";
import { Empty } from "../../components/ui";
import { CategoryBars, SentimentByQuestion, SentimentDonut } from "../../components/Charts";
import { TestimonyDrawer, type TestimonyFilter } from "../../components/TestimonyDrawer";
import { activeRun, lastRun } from "../../hooks/useOverview";
import { categoryCounts, fmtDateTime, isAnalyzed, QUESTION_COLORS, sentimentCounts } from "../../lib/analytics";
import type { Finding, SessionOverview } from "../../../shared/types";
import type { Act } from "./Workspace";

export default function StepResults({ data, act }: { data: SessionOverview; act: Act }) {
  const [q, setQ] = useState<number | null>(null);
  const [drawer, setDrawer] = useState<TestimonyFilter | null>(null);
  const [showAll, setShowAll] = useState(false);
  const analyzedAll = data.responses.filter(isAnalyzed);
  const scoped = analyzedAll.filter((r) => q === null || r.questionOrd === q);
  const totalScoped = data.responses.filter((r) => q === null || r.questionOrd === q).length;
  const cats = categoryCounts(scoped);
  const question = q ? data.questions.find((x) => x.ord === q) : null;

  if (analyzedAll.length === 0)
    return (
      <>
        <Intro />
        <div className="card">
          <Empty icon={<BarChart3 size={24} />} title="Aún no hay respuestas clasificadas">
            Completa el paso 4 para ver gráficos, testimonios y hallazgos. Todo lo que aparece aquí se calcula a partir de las respuestas
            reales guardadas.
          </Empty>
        </div>
      </>
    );

  return (
    <>
      <Intro />
      <div className="stack" style={{ marginBottom: 20 }}>
        <div className="validate-banner">
          <ShieldCheck size={20} />
          La IA sugiere códigos; el investigador interpreta y valida.
        </div>
        <div className="row wrap" style={{ justifyContent: "space-between" }}>
          <div className="segmented" role="tablist">
            <button className={q === null ? "on" : ""} onClick={() => setQ(null)}>
              Todas las preguntas
            </button>
            {data.questions.map((x) => (
              <button key={x.id} className={q === x.ord ? "on" : ""} onClick={() => setQ(x.ord)}>
                Pregunta {x.ord}
              </button>
            ))}
          </div>
          <span className="small muted">
            Base: <b>{scoped.length}</b> respuestas analizadas de {totalScoped}
            {totalScoped > scoped.length && <span style={{ color: "#B45309" }}> · {totalScoped - scoped.length} pendientes</span>}
          </span>
        </div>
        {question && <p className="muted" style={{ fontSize: 15 }}>«{question.text}»</p>}
      </div>

      <div className="grid-results">
        <section className="card chart-card">
          <div className="card-head">
            <div>
              <div className="card-title">Sentimiento</div>
              <div className="card-sub">{q === null ? "Distribución por pregunta (% de respuestas analizadas)" : "Haz clic en un segmento para leer los testimonios"}</div>
            </div>
          </div>
          {q === null ? (
            <>
              <SentimentByQuestion
                rows={data.questions.map((x) => ({ ord: x.ord, label: `Pregunta ${x.ord}`, counts: sentimentCounts(analyzedAll.filter((r) => r.questionOrd === x.ord)) }))}
                onPick={(ord, s) => setDrawer({ qOrd: ord, sentiment: s })}
              />
              <div className="callout callout-warn" style={{ marginTop: 14 }}>
                <AlertTriangle size={18} />
                <div className="small">
                  La pregunta 2 indaga <b>beneficios</b> y la 3 <b>preocupaciones</b>: es esperable que sus sentimientos difieran. No compares un
                  sentimiento «global» sin mirar cada pregunta.
                </div>
              </div>
            </>
          ) : (
            <SentimentDonut counts={sentimentCounts(scoped)} onPick={(s) => setDrawer({ qOrd: q, sentiment: s })} />
          )}
        </section>

        <section className="card chart-card">
          <div className="card-head">
            <div>
              <div className="card-title">Categorías temáticas</div>
              <div className="card-sub">Frecuencia por categoría, coloreada por sentimiento · clic para ver testimonios</div>
            </div>
          </div>
          {cats.length === 0 ? (
            <p className="muted">Sin categorías.</p>
          ) : (
            <>
              <CategoryBars
                items={cats}
                showQuestion={q === null}
                limit={showAll ? undefined : 12}
                onPick={(c) => setDrawer({ qOrd: c.questionOrd, category: c.name })}
              />
              {cats.length > 12 && (
                <button className="btn btn-quiet btn-sm" style={{ marginTop: 6 }} onClick={() => setShowAll(!showAll)}>
                  {showAll ? "Mostrar solo las 12 principales" : `Mostrar todas (${cats.length})`}
                </button>
              )}
            </>
          )}
          <p className="small muted row" style={{ marginTop: 12, gap: 6, alignItems: "flex-start" }}>
            <Info size={14} style={{ flex: "none", marginTop: 2 }} />
            Multietiqueta: una respuesta puede tener hasta 3 categorías, así que la suma de frecuencias puede superar el número de respuestas.
          </p>
        </section>
      </div>

      <Findings data={data} act={act} filterQ={q} />

      {drawer && <TestimonyDrawer data={data} filter={drawer} act={act} onClose={() => setDrawer(null)} />}
    </>
  );
}

function Intro() {
  return (
    <div className="step-intro">
      <div>
        <span className="eyebrow">Paso 5 · Resultados e interpretación</span>
        <h2>¿Qué nos dicen los datos?</h2>
        <p>
          Gráficos calculados a partir de las clasificaciones guardadas (con las correcciones del docente cuando existen). Cada barra lleva a
          los testimonios originales: <b>ningún número sin su evidencia</b>.
        </p>
      </div>
    </div>
  );
}

function Findings({ data, act, filterQ }: { data: SessionOverview; act: Act; filterQ: number | null }) {
  const running = activeRun(data);
  const synth = running?.kind === "synthesis";
  const last = lastRun(data, "synthesis");
  const findings = data.findings.filter((f) => filterQ === null || f.questionOrd === null || f.questionOrd === filterQ);
  const generate = () => act(() => api.post(`/api/admin/sessions/${data.session.id}/synthesis`), "Redactando hallazgos…");
  return (
    <section style={{ marginTop: 28 }}>
      <div className="step-intro" style={{ marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 20 }}>
            <Lightbulb size={20} style={{ verticalAlign: -3, color: "#D97706" }} /> Hallazgos interpretativos provisionales
          </h2>
          <p className="small">
            Síntesis tentativa redactada por la IA a partir de los resultados codificados. Cada hallazgo cita los códigos de respuesta que lo
            sustentan; el servidor comprueba que existan en esta sesión.
          </p>
        </div>
        <button className="btn btn-ai" onClick={generate} disabled={!!running}>
          {synth ? <Loader2 size={16} className="spin" /> : data.findings.length ? <RotateCcw size={16} /> : <Sparkles size={16} />}
          {synth ? "Redactando…" : data.findings.length ? "Regenerar hallazgos" : "Generar hallazgos con IA"}
        </button>
      </div>
      {last?.status === "failed" && !synth && (
        <div className="callout callout-err" style={{ marginBottom: 14 }}>
          <AlertTriangle size={18} />
          <div>No se pudieron generar los hallazgos: {last.error}. Los gráficos siguen siendo válidos.</div>
        </div>
      )}
      {synth ? (
        <div className="grid-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton" style={{ height: 180, borderRadius: 16, animationDelay: `${i * 0.2}s` }} />
          ))}
        </div>
      ) : findings.length === 0 ? (
        <div className="card">
          <Empty icon={<Lightbulb size={24} />} title={data.findings.length ? "Sin hallazgos para esta pregunta" : "Aún no hay hallazgos"}>
            {data.findings.length ? "Cambia el filtro a «Todas las preguntas»." : "Cuando el grupo haya discutido los gráficos, pide a la IA una primera síntesis y contrástala con la interpretación del grupo."}
          </Empty>
        </div>
      ) : (
        <>
          <div className="grid-3">
            {findings.map((f, i) => (
              <FindingCard key={f.id} f={f} n={i + 1} data={data} />
            ))}
          </div>
          {last?.completedAt && (
            <p className="small muted" style={{ marginTop: 10 }}>
              Generados el {fmtDateTime(last.completedAt)} con {last.model}.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function FindingCard({ f, n, data }: { f: Finding; n: number; data: SessionOverview }) {
  const [open, setOpen] = useState(false);
  const support = f.support.map((code) => data.responses.find((r) => r.code === code)).filter(Boolean);
  return (
    <article className="card finding fade-in" style={{ animationDelay: `${n * 0.07}s` }}>
      <div className="row" style={{ alignItems: "flex-start", gap: 12 }}>
        <span className="finding-n">{n}</span>
        <div style={{ minWidth: 0 }}>
          {f.questionOrd && (
            <span className="small" style={{ fontWeight: 700, color: QUESTION_COLORS[f.questionOrd - 1] }}>
              Pregunta {f.questionOrd}
            </span>
          )}
          <h4>{f.title}</h4>
        </div>
      </div>
      <p>{f.text}</p>
      <div className="row wrap" style={{ gap: 6 }}>
        <button className="btn btn-quiet btn-sm" onClick={() => setOpen(!open)} style={{ paddingLeft: 6 }}>
          <Quote size={14} /> {open ? "Ocultar" : "Ver"} evidencia ({support.length})
        </button>
        {!open && f.support.map((c) => <span key={c} className="code-tag">{c}</span>)}
      </div>
      {open && (
        <div className="evidence-list fade-in">
          {support.map((r) => (
            <div key={r!.id} className="evidence-item">
              <span className="code-tag">{r!.code}</span>
              <p className="quote" style={{ fontSize: 15.5, marginTop: 4 }}>
                “{r!.text}”
              </p>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
