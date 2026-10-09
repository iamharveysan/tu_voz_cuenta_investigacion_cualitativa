import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FlaskConical, Loader2, MessageSquareText, Plus, Users } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { AdminTopbar } from "../components/AdminTopbar";
import { Empty, Modal, StatusPill, useToast } from "../components/ui";
import { fmtDateTime } from "../lib/analytics";
import type { SessionSummary } from "../../shared/types";

interface ListResponse {
  sessions: SessionSummary[];
  defaultQuestions: string[];
  ai: { mode: string; model: string };
}

export default function AdminHome() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [creating, setCreating] = useState(false);
  const [busyDemo, setBusyDemo] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    api.get<ListResponse>("/api/admin/sessions").then(setData).catch((e: ApiError) => toast(e.message, true));
  }, [toast]);

  async function createDemo() {
    setBusyDemo(true);
    try {
      const { id } = await api.post<{ id: string }>("/api/admin/sessions/demo");
      navigate(`/admin/sesiones/${id}`);
    } catch (e) {
      toast((e as ApiError).message, true);
      setBusyDemo(false);
    }
  }

  return (
    <>
      <AdminTopbar ai={data?.ai} />
      <main className="container">
        <div className="home-hero">
          <div>
            <span className="eyebrow">Panel docente</span>
            <h1 style={{ marginTop: 6 }}>Sesiones de investigación</h1>
            <p className="muted" style={{ marginTop: 6 }}>
              Crea una sesión, compártela con un QR y guía al grupo por el análisis cualitativo en vivo.
            </p>
          </div>
          <div className="row wrap">
            <button className="btn btn-ghost" onClick={createDemo} disabled={busyDemo} title="Plan B: sesión separada con respuestas inventadas, señalada como tal">
              {busyDemo ? <Loader2 size={16} className="spin" /> : <FlaskConical size={16} />} Sesión demo (datos sintéticos)
            </button>
            <button className="btn btn-primary" onClick={() => setCreating(true)} disabled={!data}>
              <Plus size={18} /> Nueva sesión
            </button>
          </div>
        </div>

        {!data ? (
          <div className="session-grid">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton" style={{ height: 190, borderRadius: 16 }} />
            ))}
          </div>
        ) : data.sessions.length === 0 ? (
          <div className="card">
            <Empty icon={<MessageSquareText size={24} />} title="Aún no hay sesiones">
              Crea tu primera sesión con las tres preguntas sobre IA en el aprendizaje, o genera una sesión demo para ensayar.
              <div style={{ marginTop: 16 }}>
                <button className="btn btn-primary" onClick={() => setCreating(true)}>
                  <Plus size={18} /> Nueva sesión
                </button>
              </div>
            </Empty>
          </div>
        ) : (
          <div className="session-grid">
            {data.sessions.map((s, i) => (
              <Link key={s.id} to={`/admin/sesiones/${s.id}`} className="card session-card fade-in" style={{ animationDelay: `${i * 0.04}s` }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <StatusPill status={s.status} isDemo={s.isDemo} />
                  <span className="code-tag">{s.publicCode}</span>
                </div>
                <h3>{s.title}</h3>
                <span className="small muted">Creada {fmtDateTime(s.createdAt)}</span>
                <div className="session-stats">
                  <div>
                    <b>{s.participantCount}</b>
                    <span>
                      <Users size={12} /> participantes
                    </span>
                  </div>
                  <div>
                    <b>{s.responseCount}</b>
                    <span>respuestas</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
      {creating && data && <NewSessionModal defaults={data.defaultQuestions} onClose={() => setCreating(false)} />}
    </>
  );
}

export function NewSessionModal({
  defaults,
  onClose,
  edit,
}: {
  defaults: string[];
  onClose: () => void;
  edit?: { id: string; title: string; locked: boolean; onSaved: () => void };
}) {
  const [title, setTitle] = useState(edit?.title ?? "Investigación cualitativa · Grupo A");
  const [questions, setQuestions] = useState<string[]>(defaults);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function save() {
    setSaving(true);
    setError(null);
    try {
      if (edit) {
        await api.patch(`/api/admin/sessions/${edit.id}`, { title, questions });
        edit.onSaved();
        onClose();
      } else {
        const { id } = await api.post<{ id: string }>("/api/admin/sessions", { title, questions });
        navigate(`/admin/sesiones/${id}`);
      }
    } catch (e) {
      setError((e as ApiError).message);
      setSaving(false);
    }
  }

  return (
    <Modal
      title={edit ? "Editar sesión" : "Nueva sesión"}
      sub={edit?.locked ? "La sesión ya tiene respuestas: solo puedes cambiar el título." : "Las preguntas pueden editarse hasta que llegue la primera respuesta."}
      onClose={onClose}
      width={640}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={save} disabled={saving || title.trim().length < 3 || questions.some((q) => q.trim().length < 5)}>
            {saving && <Loader2 size={16} className="spin" />} {edit ? "Guardar cambios" : "Crear sesión"}
          </button>
        </>
      }
    >
      <div className="stack">
        <div>
          <label className="label" htmlFor="title">
            Nombre visible para los estudiantes
          </label>
          <input id="title" className="input" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        </div>
        {questions.map((q, i) => (
          <div key={i}>
            <label className="label" htmlFor={`nq-${i}`}>
              Pregunta {i + 1}
            </label>
            <textarea
              id={`nq-${i}`}
              className="textarea"
              style={{ minHeight: 64 }}
              value={q}
              maxLength={300}
              disabled={edit?.locked}
              onChange={(e) => setQuestions((qs) => qs.map((x, j) => (j === i ? e.target.value : x)))}
            />
          </div>
        ))}
        {error && <div className="callout callout-err">{error}</div>}
      </div>
    </Modal>
  );
}
