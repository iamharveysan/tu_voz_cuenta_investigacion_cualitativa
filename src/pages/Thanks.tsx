import { useLocation } from "react-router-dom";
import { Lightbulb, ShieldCheck, Tags } from "lucide-react";
import { Brand } from "../components/ui";

export default function Thanks() {
  const title = (useLocation().state as { title?: string } | null)?.title;
  return (
    <div className="thanks">
      <div className="thanks-card fade-in">
        <div className="thanks-check">
          <span className="ring" />
          <span className="ring" />
          <svg width="108" height="108" viewBox="0 0 108 108" aria-hidden="true">
            <circle cx="54" cy="54" r="50" fill="#0E9F6E" />
            <path className="tick" d="M33 55l14 14 28-30" fill="none" stroke="#fff" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h1>¡Tu voz ya es parte del análisis!</h1>
        <p className="muted" style={{ marginTop: 10, fontSize: 16 }}>
          Recibimos tus tres respuestas{title ? <> para «{title}»</> : null}. Mira la pantalla del aula: en unos minutos veremos qué dice el grupo.
        </p>
        <div className="thanks-steps">
          <div>
            <Tags size={20} />
            Codificación
          </div>
          <div>
            <ShieldCheck size={20} />
            Validación docente
          </div>
          <div>
            <Lightbulb size={20} />
            Hallazgos
          </div>
        </div>
        <p className="small muted" style={{ marginTop: 18 }}>
          Ya puedes cerrar esta ventana.
        </p>
        <div style={{ marginTop: 34, opacity: 0.7, display: "flex", justifyContent: "center" }}>
          <Brand sub="" />
        </div>
      </div>
    </div>
  );
}
