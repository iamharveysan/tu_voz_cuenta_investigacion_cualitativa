import { useCallback, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import {
  BarChart3, Check, ClipboardCheck, Copy, Download, Loader2, MonitorPlay, Pencil, Play, QrCode, Square, Tags, Trash2, Users, Wand2,
} from "lucide-react";
import { api, ApiError } from "../../lib/api";
import { useOverview } from "../../hooks/useOverview";
import { AdminTopbar } from "../../components/AdminTopbar";
import { Modal, StatusPill, useToast } from "../../components/ui";
import { isAnalyzed, participateUrl } from "../../lib/analytics";
import { NewSessionModal } from "../AdminHome";
import StepCollect from "./StepCollect";
import StepCodebook from "./StepCodebook";
import StepClassify from "./StepClassify";
import StepResults from "./StepResults";
import type { SessionOverview } from "../../../shared/types";

export type Act = (fn: () => Promise<unknown>, ok?: string) => Promise<boolean>;

const STEPS = [
  { label: "Recolección", icon: Users },
  { label: "Codificación abierta", icon: Wand2 },
  { label: "Validación humana", icon: ClipboardCheck },
  { label: "Clasificación", icon: Tags },
  { label: "Resultados", icon: BarChart3 },
] as const;

export default function Workspace() {
  const { id = "" } = useParams();
  const { data, error, refresh } = useOverview(id);
  const [params, setParams] = useSearchParams();
  const step = Math.min(4, Math.max(0, Number(params.get("paso") ?? 0) || 0));
  const setStep = (n: number) => setParams({ paso: String(n) }, { replace: true });
  const toast = useToast();
  const navigate = useNavigate();
  const [modal, setModal] = useState<null | "qr" | "edit" | "delete">(null);

  const act: Act = useCallback(
    async (fn, ok) => {
      try {
        await fn();
        if (ok) toast(ok);
        await refresh();
        return true;
      } catch (e) {
        toast(e instanceof ApiError ? e.message : "Ocurrió un error.", true);
        return false;
      }
    },
    [refresh, toast],
  );

  if (!data)
    return (
      <>
        <AdminTopbar />
        <main className="container">
          {error ? (
            <div className="callout callout-err">{error}</div>
          ) : (
            <div className="stack">
              <div className="skeleton" style={{ height: 70, maxWidth: 520 }} />
              <div className="skeleton" style={{ height: 76 }} />
              <div className="skeleton" style={{ height: 420 }} />
            </div>
          )}
        </main>
      </>
    );

  const s = data.session;
  const url = participateUrl(s.publicCode);
  const analyzed = data.responses.filter(isAnalyzed).length;
  const done = [
    s.participantCount > 0,
    data.categories.length > 0,
    !!s.codebookApprovedAt,
    analyzed > 0 && data.pendingCount === 0,
    data.findings.length > 0,
  ];
  const subs = [
    `${s.participantCount} participante${s.participantCount === 1 ? "" : "s"}`,
    data.categories.length ? `${data.categories.length} códigos propuestos` : "La IA propone códigos",
    s.codebookApprovedAt ? "Libro aprobado" : "El docente decide",
    `${analyzed} de ${data.responses.length} clasificadas`,
    data.findings.length ? `${data.findings.length} hallazgos` : "Gráficos y evidencia",
  ];

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast("Enlace copiado");
    } catch {
      toast("No se pudo copiar: " + url, true);
    }
  };

  return (
    <>
      <AdminTopbar crumb={s.title} ai={{ mode: data.aiMode, model: data.model }} />
      {s.isDemo && <div className="demo-strip">SESIÓN DEMO · Respuestas sintéticas creadas para ensayar. No son resultados auténticos.</div>}
      <main className="container">
        <div className="ws-head">
          <div>
            <div className="row wrap">
              <StatusPill status={s.status} isDemo={s.isDemo} />
              <span className="code-tag">Código {s.publicCode}</span>
            </div>
            <h1 className="ws-title">{s.title}</h1>
          </div>
          <div className="ws-actions">
            {!s.isDemo &&
              (s.status === "active" ? (
                <button className="btn btn-danger" onClick={() => act(() => api.post(`/api/admin/sessions/${id}/status`, { status: "closed" }), "Sesión cerrada: ya no recibe respuestas")}>
                  <Square size={15} /> Cerrar recepción
                </button>
              ) : (
                <button className="btn btn-primary" onClick={() => act(() => api.post(`/api/admin/sessions/${id}/status`, { status: "active" }), "Sesión activa: ya puede recibir respuestas")}>
                  <Play size={16} /> {s.status === "closed" ? "Reabrir" : "Activar sesión"}
                </button>
              ))}
            {!s.isDemo && (
              <>
                <button className="btn btn-ghost" onClick={copyLink}>
                  <Copy size={16} /> Compartir enlace
                </button>
                <button className="btn btn-ghost" onClick={() => setModal("qr")}>
                  <QrCode size={16} /> Mostrar QR
                </button>
              </>
            )}
            <button className="btn btn-dark" onClick={() => window.open(`/admin/sesiones/${id}/proyectar`, "_blank", "noopener")}>
              <MonitorPlay size={16} /> Proyectar
            </button>
            <a className="btn btn-ghost btn-icon" href={`/api/admin/sessions/${id}/export.csv`} title="Exportar matriz de codificación (CSV para Excel o Google Sheets)">
              <Download size={16} />
            </a>
            <button className="btn btn-ghost btn-icon" onClick={() => setModal("edit")} title="Editar sesión">
              <Pencil size={16} />
            </button>
            <button className="btn btn-ghost btn-icon" onClick={() => setModal("delete")} title="Eliminar sesión y sus datos">
              <Trash2 size={16} />
            </button>
          </div>
        </div>

        <nav className="stepper" aria-label="Etapas del análisis">
          {STEPS.map((st, i) => {
            const Icon = st.icon;
            return (
              <button key={st.label} className={`step ${step === i ? "on" : ""} ${done[i] ? "done" : ""}`} onClick={() => setStep(i)} aria-current={step === i ? "step" : undefined}>
                <span className="step-ico">
                  <Icon size={19} />
                  {done[i] && step !== i && (
                    <span className="step-badge">
                      <Check size={11} strokeWidth={3.5} />
                    </span>
                  )}
                </span>
                <span style={{ minWidth: 0 }}>
                  <span className="step-n">Paso {i + 1}</span>
                  <span className="step-label" style={{ display: "block" }}>
                    {st.label}
                  </span>
                  <span className="step-sub" style={{ display: "block" }}>
                    {subs[i]}
                  </span>
                </span>
              </button>
            );
          })}
        </nav>

        <div key={step} className="fade-in">
          {step === 0 && <StepCollect data={data} url={url} act={act} onNext={() => setStep(1)} />}
          {step === 1 && <StepCodebook data={data} act={act} editable={false} onNext={() => setStep(2)} />}
          {step === 2 && <StepCodebook data={data} act={act} editable onNext={() => setStep(3)} />}
          {step === 3 && <StepClassify data={data} act={act} onNext={() => setStep(4)} />}
          {step === 4 && <StepResults data={data} act={act} />}
        </div>
      </main>

      {modal === "qr" && <QrModal data={data} url={url} onClose={() => setModal(null)} onCopy={copyLink} />}
      {modal === "edit" && (
        <NewSessionModal
          defaults={data.questions.map((q) => q.text)}
          onClose={() => setModal(null)}
          edit={{ id, title: s.title, locked: data.responses.length > 0, onSaved: () => { toast("Sesión actualizada"); refresh(); } }}
        />
      )}
      {modal === "delete" && (
        <DeleteModal
          data={data}
          onClose={() => setModal(null)}
          onConfirm={async () => {
            const ok = await act(() => api.del(`/api/admin/sessions/${id}`), "Sesión eliminada");
            if (ok) navigate("/admin");
          }}
        />
      )}
    </>
  );
}

function QrModal({ data, url, onClose, onCopy }: { data: SessionOverview; url: string; onClose: () => void; onCopy: () => void }) {
  return (
    <Modal title="Invita a participar" sub={data.session.status === "active" ? "La sesión está activa." : "Recuerda activar la sesión para recibir respuestas."} onClose={onClose} width={480}>
      <div style={{ display: "grid", placeItems: "center", gap: 16 }}>
        <div className="qr-box">
          <QRCodeSVG value={url} size={280} level="M" fgColor="#102A43" marginSize={1} />
        </div>
        <div className="big-code">{data.session.publicCode}</div>
        <div className="link-box" style={{ width: "100%" }}>
          <code>{url}</code>
          <button className="btn btn-primary btn-sm" onClick={onCopy}>
            <Copy size={14} /> Copiar
          </button>
        </div>
      </div>
    </Modal>
  );
}

function DeleteModal({ data, onClose, onConfirm }: { data: SessionOverview; onClose: () => void; onConfirm: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  return (
    <Modal
      title="Eliminar sesión"
      sub="Se borrarán definitivamente las respuestas, el libro de códigos, los análisis y los hallazgos."
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn btn-danger"
            disabled={busy || text.trim().toUpperCase() !== "ELIMINAR"}
            onClick={async () => {
              setBusy(true);
              await onConfirm();
              setBusy(false);
            }}
          >
            {busy ? <Loader2 size={16} className="spin" /> : <Trash2 size={16} />} Eliminar definitivamente
          </button>
        </>
      }
    >
      <p style={{ marginBottom: 12 }}>
        «{data.session.title}» tiene <b>{data.session.participantCount}</b> participaciones y <b>{data.session.responseCount}</b> respuestas. Si
        las necesitas, exporta antes el CSV.
      </p>
      <label className="label" htmlFor="confirm-del">
        Escribe ELIMINAR para confirmar
      </label>
      <input id="confirm-del" className="input" value={text} onChange={(e) => setText(e.target.value)} />
    </Modal>
  );
}
