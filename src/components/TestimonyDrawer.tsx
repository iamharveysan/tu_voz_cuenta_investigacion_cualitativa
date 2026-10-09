import { useState } from "react";
import { AlertTriangle, BadgeCheck, Info, Loader2, Pencil, RotateCcw, Tags } from "lucide-react";
import { api } from "../lib/api";
import { Drawer, SentimentChip } from "./ui";
import { effective, highlight, isAnalyzed, SENTIMENT_META } from "../lib/analytics";
import { OTHER_CATEGORY, SENTIMENTS, type ResponseItem, type Sentiment, type SessionOverview } from "../../shared/types";

export interface TestimonyFilter {
  qOrd: number | null;
  sentiment?: Sentiment;
  category?: string;
}

type Act = (fn: () => Promise<unknown>, ok?: string) => Promise<boolean>;

export function TestimonyDrawer({ data, filter, act, onClose }: { data: SessionOverview; filter: TestimonyFilter; act: Act; onClose: () => void }) {
  const list = data.responses.filter((r) => {
    if (!isAnalyzed(r)) return false;
    if (filter.qOrd !== null && r.questionOrd !== filter.qOrd) return false;
    const e = effective(r.analysis!);
    if (filter.sentiment && e.sentiment !== filter.sentiment) return false;
    if (filter.category && !e.categories.includes(filter.category)) return false;
    return true;
  });
  const title = filter.category ? `«${filter.category}»` : filter.sentiment ? `Sentimiento ${SENTIMENT_META[filter.sentiment].label.toLowerCase()}` : "Testimonios";
  const q = filter.qOrd ? data.questions.find((x) => x.ord === filter.qOrd) : null;
  return (
    <Drawer title={title} sub={`${list.length} testimonio${list.length === 1 ? "" : "s"} · ${q ? `Pregunta ${q.ord}` : "todas las preguntas"}${filter.category && filter.sentiment ? ` · ${SENTIMENT_META[filter.sentiment].label}` : ""}`} onClose={onClose}>
      {q && <p className="small muted" style={{ marginTop: -4 }}>{q.text}</p>}
      <div className="callout">
        <Info size={18} />
        <div className="small">
          Las <mark style={{ background: "rgba(245,165,36,.38)", padding: "0 3px" }}>citas resaltadas</mark> son las evidencias literales que la IA usó y el
          servidor verificó. Puedes corregir cualquier clasificación: la versión original de la IA se conserva.
        </div>
      </div>
      {list.map((r) => (
        <Testimony key={r.id} r={r} data={data} act={act} />
      ))}
    </Drawer>
  );
}

function Testimony({ r, data, act }: { r: ResponseItem; data: SessionOverview; act: Act }) {
  const a = r.analysis!;
  const e = effective(a);
  const [editing, setEditing] = useState(false);
  const [sent, setSent] = useState<Sentiment | null>(e.sentiment);
  const [cats, setCats] = useState<string[]>(e.categories);
  const [busy, setBusy] = useState(false);
  const options = [...data.categories.filter((c) => c.questionId === r.questionId).map((c) => c.name), OTHER_CATEGORY];
  const corrected = a.humanSentiment !== null || a.humanCategories !== null;
  const url = `/api/admin/sessions/${data.session.id}/responses/${r.id}/review`;

  async function save(validated: boolean) {
    setBusy(true);
    const ok = await act(
      () =>
        api.patch(url, {
          sentiment: sent === a.sentiment ? null : sent,
          categories: JSON.stringify([...cats].sort()) === JSON.stringify([...a.categories].sort()) ? null : cats,
          validated,
        }),
      validated ? "Clasificación validada" : "Corrección guardada",
    );
    setBusy(false);
    if (ok) setEditing(false);
  }

  return (
    <article className="card testimony">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="code-tag">{r.code}</span>
        <div className="row" style={{ gap: 6 }}>
          {a.validated && (
            <span className="chip" style={{ background: "var(--ok-bg)", color: "var(--ok-ink)" }}>
              <BadgeCheck size={13} /> Validada
            </span>
          )}
          {a.status === "requiere_revision" && !a.validated && (
            <span className="chip" style={{ background: "var(--warn-bg)", color: "var(--warn-ink)" }} title="La IA no aportó una cita literal verificable">
              <AlertTriangle size={13} /> Revisar
            </span>
          )}
        </div>
      </div>
      <p className="quote">
        “
        {highlight(r.text, a.evidences).map((p, i) => (p.mark ? <mark key={i}>{p.t}</mark> : <span key={i}>{p.t}</span>))}”
      </p>
      {!editing ? (
        <>
          <div className="testimony-foot">
            <SentimentChip s={e.sentiment} human={a.humanSentiment !== null} />
            {e.categories.map((c) => (
              <span key={c} className="chip">
                <Tags size={11} /> {c}
              </span>
            ))}
            <span className="grow" />
            <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>
              <Pencil size={14} /> Revisar
            </button>
          </div>
          {a.justification && (
            <div className="justif">
              <Info size={13} />
              <span>
                <b>IA:</b> {a.justification}
                {corrected && <> · Original IA: {a.sentiment}, {a.categories.join(", ")}</>}
              </span>
            </div>
          )}
        </>
      ) : (
        <div className="review-box">
          <div>
            <div className="label">Sentimiento</div>
            <div className="row wrap" style={{ gap: 6 }}>
              {SENTIMENTS.map((s) => (
                <button
                  key={s}
                  className={`toggle-chip ${sent === s ? "on" : ""}`}
                  style={{ ["--c" as string]: SENTIMENT_META[s].color, ["--c-soft" as string]: SENTIMENT_META[s].soft }}
                  onClick={() => setSent(s)}
                >
                  {SENTIMENT_META[s].label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="label">Categorías (máx. 3)</div>
            <div className="row wrap" style={{ gap: 6 }}>
              {options.map((c) => {
                const on = cats.includes(c);
                return (
                  <button
                    key={c}
                    className={`toggle-chip ${on ? "on" : ""}`}
                    onClick={() => setCats(on ? cats.filter((x) => x !== c) : cats.length < 3 ? [...cats, c] : cats)}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="row wrap" style={{ justifyContent: "flex-end" }}>
            {corrected && (
              <button
                className="btn btn-quiet btn-sm"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await act(() => api.patch(url, { sentiment: null, categories: null, validated: false }), "Se restauró la clasificación de la IA");
                  setSent(a.sentiment);
                  setCats(a.categories);
                  setBusy(false);
                  setEditing(false);
                }}
              >
                <RotateCcw size={14} /> Restaurar IA
              </button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)} disabled={busy}>
              Cancelar
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => save(false)} disabled={busy || cats.length === 0}>
              Guardar corrección
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => save(true)} disabled={busy || cats.length === 0}>
              {busy ? <Loader2 size={14} className="spin" /> : <BadgeCheck size={14} />} Validar
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
