import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle, ArrowRight, Bot, CheckCircle2, EyeOff, Hand, Loader2, Lock, MessageSquareText, RefreshCw, ShieldCheck } from "lucide-react";
import { api, ApiError, storage } from "../lib/api";
import { Brand, VoiceWave } from "../components/ui";
import { TEXT_MAX, TEXT_MIN, type PublicSession } from "../../shared/types";

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: PublicSession };

const newKey = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export default function Participate() {
  const [params] = useSearchParams();
  const code = (params.get("s") || params.get("sesion") || "").trim().toUpperCase();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [reload, setReload] = useState(0);

  useEffect(() => {
    setLoad({ status: "loading" });
    api
      .get<PublicSession>(`/api/public/session${code ? `?code=${encodeURIComponent(code)}` : ""}`)
      .then((data) => setLoad({ status: "ready", data }))
      .catch((e: ApiError) => setLoad({ status: "error", message: e.message }));
  }, [code, reload]);

  if (load.status === "loading") return <Shell><LoadingCard /></Shell>;
  if (load.status === "error")
    return (
      <Shell>
        <StateCard icon={<AlertCircle size={26} />} title="No pudimos cargar la sesión" tone="err">
          <p className="muted">{load.message}</p>
          <button className="btn btn-primary" style={{ marginTop: 18 }} onClick={() => setReload((n) => n + 1)}>
            <RefreshCw size={16} /> Reintentar
          </button>
        </StateCard>
      </Shell>
    );
  const { data } = load;
  if (data.state !== "active" || !data.session)
    return (
      <Shell>
        <StateCard
          icon={data.state === "closed" ? <Lock size={26} /> : <MessageSquareText size={26} />}
          title={data.state === "closed" ? "Esta sesión ya cerró" : "No hay una investigación abierta"}
        >
          <p className="muted">
            {data.state === "closed"
              ? "Gracias por tu interés. El docente ya cerró la recepción de respuestas."
              : "Cuando el docente active la sesión, escanea de nuevo el código QR o recarga esta página."}
          </p>
          <button className="btn btn-ghost" style={{ marginTop: 18 }} onClick={() => setReload((n) => n + 1)}>
            <RefreshCw size={16} /> Volver a comprobar
          </button>
        </StateCard>
      </Shell>
    );
  return <Form session={data.session} />;
}

function Form({ session }: { session: NonNullable<PublicSession["session"]> }) {
  const navigate = useNavigate();
  const draftKey = `tvc-draft-${session.code}`;
  const sentKey = `tvc-sent-${session.code}`;
  const idemKey = `tvc-idem-${session.code}`;

  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(storage.get("session", draftKey) || "{}");
    } catch {
      return {};
    }
  });
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [alreadySent, setAlreadySent] = useState(() => storage.get("local", sentKey) === "1");

  useEffect(() => storage.set("session", draftKey, JSON.stringify(answers)), [answers, draftKey]);

  const lengths = session.questions.map((q) => (answers[q.id] || "").trim().length);
  const complete = lengths.map((l) => l >= TEXT_MIN && l <= TEXT_MAX);
  const doneCount = complete.filter(Boolean).length;
  const ready = doneCount === 3 && consent;

  const hint = useMemo(() => {
    if (doneCount < 3) return `${doneCount} de 3 respuestas listas`;
    if (!consent) return "Falta aceptar el consentimiento";
    return "Todo listo para enviar";
  }, [doneCount, consent]);

  async function submit() {
    setTouched(true);
    if (!ready || sending) return;
    setSending(true);
    setError(null);
    // La misma clave se reutiliza en reintentos: el servidor no duplica la participación.
    let key = storage.get("session", idemKey);
    if (!key) {
      key = newKey();
      storage.set("session", idemKey, key);
    }
    try {
      await api.post("/api/public/submit", {
        code: session.code,
        idempotencyKey: key,
        consent: true,
        answers: session.questions.map((q) => ({ questionId: q.id, text: (answers[q.id] || "").trim() })),
      });
      storage.set("local", sentKey, "1");
      storage.remove("session", draftKey);
      storage.remove("session", idemKey);
      navigate("/gracias", { replace: true, state: { title: session.title } });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo enviar. Inténtalo de nuevo.");
      setSending(false);
    }
  }

  if (alreadySent)
    return (
      <Shell>
        <StateCard icon={<CheckCircle2 size={26} />} title="Ya enviaste tus respuestas" tone="ok">
          <p className="muted">Desde este dispositivo ya se registró una participación en «{session.title}». ¡Gracias por tu voz!</p>
          <button
            className="btn btn-ghost"
            style={{ marginTop: 18 }}
            onClick={() => {
              storage.remove("local", sentKey);
              setAlreadySent(false);
            }}
          >
            Otra persona va a responder en este dispositivo
          </button>
        </StateCard>
      </Shell>
    );

  return (
    <div className="p-page">
      <div className="p-top">
        <Brand />
      </div>
      <header className="p-hero fade-in">
        <div className="p-hero-card">
          <div className="p-hero-wave">
            <VoiceWave width={230} />
          </div>
          <span className="eyebrow" style={{ color: "#9fc0ff" }}>
            Investigación en clase
          </span>
          <h1>Tu voz cuenta</h1>
          <p className="session-name">{session.title}</p>
          <div className="p-meta">
            <span className="pill">
              <MessageSquareText size={14} /> 3 preguntas · 3 respuestas abiertas
            </span>
            <span className="pill">
              <EyeOff size={14} /> Anónimo
            </span>
          </div>
          <div className="p-progress" aria-label={`${doneCount} de 3 respuestas listas`}>
            {complete.map((c, i) => (
              <span key={i} className={c ? "done" : ""} />
            ))}
          </div>
        </div>
      </header>

      <main className="p-body">
        {session.questions.map((q, i) => {
          const len = lengths[i]!;
          const short = touched && len < TEXT_MIN;
          return (
            <section key={q.id} className={`q-card fade-in ${complete[i] ? "complete" : ""}`} style={{ animationDelay: `${0.08 * (i + 1)}s` }}>
              <div className="q-head">
                <div className="q-num">{complete[i] ? <CheckCircle2 size={18} /> : q.ord}</div>
                <label className="q-text" htmlFor={`q-${q.id}`}>
                  {q.text}
                </label>
              </div>
              <textarea
                id={`q-${q.id}`}
                className="textarea"
                rows={4}
                maxLength={TEXT_MAX}
                placeholder="Escribe con tus palabras. No incluyas nombres ni datos personales."
                value={answers[q.id] || ""}
                onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                aria-invalid={short}
                style={short ? { borderColor: "var(--neg)" } : undefined}
              />
              <div className="q-foot">
                <span className={len >= TEXT_MIN ? "ok" : undefined} style={short ? { color: "var(--err-ink)" } : undefined}>
                  {len >= TEXT_MIN ? "✓ Respuesta lista" : `Mínimo ${TEXT_MIN} caracteres`}
                </span>
                <span>
                  {len} / {TEXT_MAX}
                </span>
              </div>
            </section>
          );
        })}

        <section className="consent fade-in" style={{ animationDelay: "0.35s" }}>
          <div className="row" style={{ gap: 8 }}>
            <ShieldCheck size={18} color="#2463EB" />
            <strong>Antes de enviar</strong>
          </div>
          <ul>
            <li>
              <Hand size={16} /> Tu participación es voluntaria y puedes no responder.
            </li>
            <li>
              <EyeOff size={16} /> No pedimos tu nombre ni tu correo. Evita escribir datos personales.
            </li>
            <li>
              <Bot size={16} /> Las respuestas se analizarán de forma automatizada con un proveedor externo de IA (OpenAI) y el docente
              validará los resultados.
            </li>
          </ul>
          <label className="check">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>Entiendo y acepto participar en este ejercicio de clase.</span>
          </label>
        </section>

        {error && (
          <div className="callout callout-err fade-in" style={{ marginTop: 16 }} role="alert">
            <AlertCircle size={18} />
            <div>
              <strong>No se pudo enviar.</strong> {error}
              <div className="small" style={{ marginTop: 4 }}>
                Tus respuestas siguen aquí. Pulsa «Enviar» de nuevo: no se duplicarán.
              </div>
            </div>
          </div>
        )}
      </main>

      <div className="p-submit-bar">
        <div className="p-submit-inner">
          <span className="hint">{hint}</span>
          <button className="btn btn-primary btn-lg" disabled={sending || (touched && !ready)} onClick={submit}>
            {sending ? (
              <>
                <Loader2 size={18} className="spin" /> Enviando…
              </>
            ) : (
              <>
                Enviar respuestas <ArrowRight size={18} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-page" style={{ paddingBottom: 40 }}>
      <div className="p-top">
        <Brand />
      </div>
      {children}
    </div>
  );
}

function StateCard({ icon, title, children, tone }: { icon: React.ReactNode; title: string; children: React.ReactNode; tone?: "ok" | "err" }) {
  const bg = tone === "ok" ? "var(--ok-bg)" : tone === "err" ? "var(--err-bg)" : "var(--blue-50)";
  const fg = tone === "ok" ? "var(--pos)" : tone === "err" ? "var(--err-ink)" : "var(--blue)";
  return (
    <div className="p-state fade-in">
      <div className="card">
        <div style={{ width: 60, height: 60, borderRadius: 18, margin: "0 auto", display: "grid", placeItems: "center", background: bg, color: fg }}>
          {icon}
        </div>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

function LoadingCard() {
  return (
    <div className="p-hero">
      <div className="skeleton" style={{ height: 190, borderRadius: 24 }} />
      <div className="skeleton" style={{ height: 180, borderRadius: 20, marginTop: 18 }} />
      <div className="skeleton" style={{ height: 180, borderRadius: 20, marginTop: 14 }} />
    </div>
  );
}
