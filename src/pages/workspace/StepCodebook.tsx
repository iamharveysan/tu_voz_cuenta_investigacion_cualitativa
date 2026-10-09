import { useEffect, useState } from "react";
import {
  AlertTriangle, ArrowRight, BadgeCheck, BookOpen, Combine, Lightbulb, Loader2, Plus, RotateCcw, Save, ShieldCheck, Sparkles, Trash2, Wand2,
} from "lucide-react";
import { api } from "../../lib/api";
import { Empty, Modal } from "../../components/ui";
import { activeRun, lastRun } from "../../hooks/useOverview";
import { categoryColor, fmtDateTime } from "../../lib/analytics";
import type { Category, Question, SessionOverview } from "../../../shared/types";
import type { Act } from "./Workspace";

interface Props {
  data: SessionOverview;
  act: Act;
  editable: boolean;
  onNext: () => void;
}

export default function StepCodebook({ data, act, editable, onNext }: Props) {
  const s = data.session;
  const running = activeRun(data);
  const codebookRunning = running?.kind === "codebook";
  const last = lastRun(data, "codebook");
  const hasCats = data.categories.length > 0;
  const classified = data.responses.some((r) => r.analysis && r.analysis.status !== "error");
  const [confirmRegen, setConfirmRegen] = useState(false);

  const propose = () => act(() => api.post(`/api/admin/sessions/${s.id}/codebook`), "La IA está leyendo las respuestas…");

  return (
    <>
      <div className="step-intro">
        <div>
          {editable ? (
            <>
              <span className="eyebrow">Paso 3 · Validación del investigador</span>
              <h2>Tú decides qué códigos se quedan</h2>
              <p>
                Renombra, ajusta definiciones, fusiona categorías redundantes o añade las que falten. Solo cuando apruebes el libro de
                códigos, la IA lo usará para clasificar cada respuesta.
              </p>
            </>
          ) : (
            <>
              <span className="eyebrow">Paso 2 · Codificación abierta</span>
              <h2>La IA lee todo y propone categorías emergentes</h2>
              <p>
                Para cada pregunta, el modelo lee <b>todas</b> las respuestas juntas y sugiere de 4 a 8 códigos temáticos con una definición y
                ejemplos reales. Es una <b>propuesta</b>: en el siguiente paso la validas.
              </p>
            </>
          )}
        </div>
        <div className="row wrap">
          {!editable && (
            <button
              className="btn btn-ai btn-lg"
              disabled={!!running || data.responses.length === 0}
              onClick={() => (hasCats ? setConfirmRegen(true) : propose())}
            >
              {codebookRunning ? <Loader2 size={18} className="spin" /> : hasCats ? <RotateCcw size={18} /> : <Wand2 size={18} />}
              {codebookRunning ? "Leyendo respuestas…" : hasCats ? "Volver a proponer" : "Proponer libro de códigos con IA"}
            </button>
          )}
          {editable && hasCats && !s.codebookApprovedAt && (
            <button className="btn btn-primary btn-lg" disabled={!!running} onClick={() => act(() => api.post(`/api/admin/sessions/${s.id}/codebook/approve`), "Libro de códigos aprobado")}>
              <BadgeCheck size={18} /> Aprobar libro de códigos
            </button>
          )}
          {hasCats && (editable ? !!s.codebookApprovedAt : true) && (
            <button className="btn btn-dark" onClick={onNext} disabled={codebookRunning}>
              {editable ? "Siguiente: clasificación" : "Siguiente: validar"} <ArrowRight size={16} />
            </button>
          )}
        </div>
      </div>

      {editable ? (
        <div className="stack" style={{ marginBottom: 20 }}>
          <div className="validate-banner">
            <ShieldCheck size={20} />
            La IA sugiere códigos; el investigador interpreta y valida.
          </div>
          {s.codebookApprovedAt ? (
            <div className="callout callout-ok">
              <BadgeCheck size={18} />
              <div>
                Libro de códigos aprobado el {fmtDateTime(s.codebookApprovedAt)}. Si lo modificas, deberás aprobarlo de nuevo
                {classified && " y conviene reclasificar las respuestas"}.
              </div>
            </div>
          ) : (
            hasCats && (
              <div className="callout callout-warn">
                <AlertTriangle size={18} />
                <div>Pendiente de aprobación. Revisa cada categoría: ¿está bien nombrada? ¿se solapa con otra? ¿falta algún tema?</div>
              </div>
            )
          )}
        </div>
      ) : (
        last?.status === "failed" &&
        !codebookRunning && (
          <div className="callout callout-err" style={{ marginBottom: 18 }}>
            <AlertTriangle size={18} />
            <div>
              <b>No se pudo generar el libro de códigos.</b> {last.error}
            </div>
          </div>
        )
      )}

      {!hasCats && !codebookRunning ? (
        <div className="card">
          <Empty icon={editable ? <BookOpen size={24} /> : <Sparkles size={24} />} title={editable ? "Todavía no hay códigos para validar" : "¿Qué es la codificación abierta?"}>
            {editable ? (
              "Vuelve al paso 2 y pide a la IA una propuesta inicial."
            ) : (
              <>
                Es el primer acercamiento del investigador a los datos: leer, identificar ideas recurrentes y darles un nombre. Aquí la IA
                hace un primer borrador sobre {data.responses.length} respuestas para que el grupo lo discuta.
              </>
            )}
          </Empty>
        </div>
      ) : (
        <div className="grid-3">
          {data.questions.map((q) => (
            <QuestionColumn
              key={q.id}
              q={q}
              data={data}
              act={act}
              editable={editable}
              loading={codebookRunning}
              cats={data.categories.filter((c) => c.questionId === q.id)}
            />
          ))}
        </div>
      )}

      {confirmRegen && (
        <Modal
          title="¿Volver a proponer el libro de códigos?"
          sub="La propuesta actual (incluidas tus ediciones) se reemplazará y tendrás que aprobarla de nuevo."
          onClose={() => setConfirmRegen(false)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setConfirmRegen(false)}>
                Cancelar
              </button>
              <button
                className="btn btn-ai"
                onClick={() => {
                  setConfirmRegen(false);
                  propose();
                }}
              >
                <Wand2 size={16} /> Sí, proponer de nuevo
              </button>
            </>
          }
        >
          {classified && <p>Las respuestas ya clasificadas conservarán sus códigos anteriores hasta que vuelvas a clasificarlas.</p>}
        </Modal>
      )}
    </>
  );
}

function QuestionColumn({
  q, data, act, editable, loading, cats,
}: {
  q: Question;
  data: SessionOverview;
  act: Act;
  editable: boolean;
  loading: boolean;
  cats: Category[];
}) {
  const [adding, setAdding] = useState(false);
  const n = data.responses.filter((r) => r.questionId === q.id).length;
  return (
    <section className="card" style={{ overflow: "hidden" }}>
      <div className="qcol-head">
        <div className="q-num">{q.ord}</div>
        <div>
          <p>{q.text}</p>
          <span className="small muted">
            {n} respuestas · {cats.length} códigos
          </span>
        </div>
      </div>
      {loading ? (
        <div className="ai-thinking">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
          <p className="small muted row" style={{ justifyContent: "center" }}>
            <Sparkles size={14} /> Leyendo {n} respuestas…
          </p>
        </div>
      ) : (
        <div className="qcol-body">
          {cats.map((c, i) =>
            editable ? (
              <EditableCategory key={c.id} c={c} color={categoryColor(i)} siblings={cats} data={data} act={act} />
            ) : (
              <ReadCategory key={c.id} c={c} color={categoryColor(i)} data={data} />
            ),
          )}
          {editable &&
            (adding ? (
              <NewCategory sessionId={data.session.id} questionId={q.id} act={act} onDone={() => setAdding(false)} />
            ) : (
              <button className="btn btn-ghost" style={{ borderStyle: "dashed" }} onClick={() => setAdding(true)}>
                <Plus size={16} /> Añadir categoría
              </button>
            ))}
        </div>
      )}
    </section>
  );
}

function ReadCategory({ c, color, data }: { c: Category; color: string; data: SessionOverview }) {
  const [open, setOpen] = useState<string | null>(null);
  const quote = open ? data.responses.find((r) => r.code === open) : null;
  const count = data.responses.filter((r) => r.analysis && (r.analysis.humanCategories ?? r.analysis.categories).includes(c.name) && r.questionId === c.questionId).length;
  return (
    <div className="cat-card fade-in" style={{ ["--c" as string]: color }}>
      <div className="cat-name">
        <span>{c.name}</span>
        {count > 0 && <span className="chip">{count} resp.</span>}
      </div>
      <div className="cat-def">{c.definition}</div>
      {c.exampleCodes.length > 0 && (
        <div className="cat-ex">
          <span className="small muted" style={{ marginRight: 2 }}>
            <Lightbulb size={12} /> Ejemplos:
          </span>
          {c.exampleCodes.map((code) => (
            <button key={code} className={`code-tag ${open === code ? "active" : ""}`} onClick={() => setOpen(open === code ? null : code)}>
              {code}
            </button>
          ))}
        </div>
      )}
      {quote && <div className="cat-quote fade-in">“{quote.text}”</div>}
    </div>
  );
}

function EditableCategory({ c, color, siblings, data, act }: { c: Category; color: string; siblings: Category[]; data: SessionOverview; act: Act }) {
  const [name, setName] = useState(c.name);
  const [def, setDef] = useState(c.definition);
  const [removing, setRemoving] = useState(false);
  const [mergeInto, setMergeInto] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setName(c.name);
    setDef(c.definition);
  }, [c.name, c.definition]);
  const dirty = name.trim() !== c.name || def.trim() !== c.definition;
  const base = `/api/admin/sessions/${data.session.id}/categories/${c.id}`;

  async function save() {
    setSaving(true);
    await act(() => api.put(base, { name: name.trim(), definition: def.trim() }), "Categoría actualizada");
    setSaving(false);
  }

  return (
    <div className="cat-card cat-edit" style={{ ["--c" as string]: color }}>
      <div className="row" style={{ gap: 6, marginBottom: 6 }}>
        <span className={`origin-tag ${c.origin}`}>{c.origin === "ia" ? "Propuesta IA" : "Editada"}</span>
        <span className="grow" />
        <button className="btn btn-quiet btn-icon" style={{ width: 30, height: 30 }} title="Eliminar o fusionar" onClick={() => setRemoving(true)}>
          <Trash2 size={15} />
        </button>
      </div>
      <input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} aria-label="Nombre de la categoría" onKeyDown={(e) => e.key === "Enter" && dirty && save()} />
      <textarea className="textarea" value={def} maxLength={220} onChange={(e) => setDef(e.target.value)} aria-label="Definición" placeholder="Definición operativa: ¿cuándo aplica este código?" />
      {dirty && (
        <div className="row" style={{ marginTop: 8, justifyContent: "flex-end" }}>
          <button className="btn btn-quiet btn-sm" onClick={() => { setName(c.name); setDef(c.definition); }}>
            Descartar
          </button>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={saving || name.trim().length < 2}>
            {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />} Guardar
          </button>
        </div>
      )}
      {removing && (
        <Modal
          title={`Quitar «${c.name}»`}
          sub="Puedes eliminarla o fusionarla con otra categoría de la misma pregunta (las respuestas ya clasificadas se reasignan)."
          onClose={() => setRemoving(false)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setRemoving(false)}>
                Cancelar
              </button>
              <button
                className={mergeInto ? "btn btn-primary" : "btn btn-danger"}
                onClick={async () => {
                  setRemoving(false);
                  await act(() => api.del(base, mergeInto ? { mergeInto } : {}), mergeInto ? "Categorías fusionadas" : "Categoría eliminada");
                }}
              >
                {mergeInto ? <><Combine size={16} /> Fusionar</> : <><Trash2 size={16} /> Eliminar</>}
              </button>
            </>
          }
        >
          <label className="label" htmlFor={`merge-${c.id}`}>
            Fusionar con…
          </label>
          <select id={`merge-${c.id}`} className="select" value={mergeInto} onChange={(e) => setMergeInto(e.target.value)}>
            <option value="">— No fusionar, solo eliminar —</option>
            {siblings.filter((x) => x.id !== c.id).map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </Modal>
      )}
    </div>
  );
}

function NewCategory({ sessionId, questionId, act, onDone }: { sessionId: string; questionId: string; act: Act; onDone: () => void }) {
  const [name, setName] = useState("");
  const [def, setDef] = useState("");
  return (
    <div className="cat-card cat-edit fade-in" style={{ ["--c" as string]: "#0E9F6E" }}>
      <input className="input" autoFocus placeholder="Nombre (1–3 palabras)" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
      <textarea className="textarea" placeholder="Definición: ¿cuándo aplica este código?" value={def} maxLength={220} onChange={(e) => setDef(e.target.value)} />
      <div className="row" style={{ marginTop: 8, justifyContent: "flex-end" }}>
        <button className="btn btn-quiet btn-sm" onClick={onDone}>
          Cancelar
        </button>
        <button
          className="btn btn-primary btn-sm"
          disabled={name.trim().length < 2}
          onClick={async () => {
            if (await act(() => api.post(`/api/admin/sessions/${sessionId}/categories`, { questionId, name: name.trim(), definition: def.trim() }), "Categoría añadida")) onDone();
          }}
        >
          <Plus size={14} /> Añadir
        </button>
      </div>
    </div>
  );
}
