import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AlertCircle, ArrowRight, Loader2, LockKeyhole } from "lucide-react";
import { api, ApiError } from "../lib/api";
import { Brand, VoiceWave } from "../components/ui";

export default function AdminLogin() {
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from || "/admin";
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.post("/api/admin/login", { password });
      navigate(from.startsWith("/admin") ? from : "/admin", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo iniciar sesión.");
      setLoading(false);
    }
  }

  return (
    <div className="login">
      <section className="login-art">
        <Brand light />
        <div>
          <h1>
            De voces individuales a <em>hallazgos con evidencia</em>, en vivo.
          </h1>
          <p style={{ opacity: 0.7, marginTop: 14, maxWidth: 460, fontSize: 16 }}>
            Un laboratorio para mostrar, paso a paso, cómo se analiza un tema con métodos cualitativos y apoyo de inteligencia
            artificial.
          </p>
        </div>
        <div className="login-steps">
          {["Recolección anónima desde el celular", "Codificación abierta asistida por IA", "Validación del investigador", "Clasificación y sentimientos", "Hallazgos sustentados en citas"].map(
            (t, i) => (
              <div key={t}>
                <b>{i + 1}</b>
                {t}
              </div>
            ),
          )}
        </div>
        <div style={{ position: "absolute", right: -30, bottom: -20, opacity: 0.07 }}>
          <VoiceWave width={520} />
        </div>
      </section>
      <section className="login-form">
        <form onSubmit={submit} className="fade-in">
          <div className="empty-icon" style={{ marginBottom: 18 }}>
            <LockKeyhole size={24} />
          </div>
          <h2 style={{ fontSize: 26, fontWeight: 800 }}>Panel docente</h2>
          <p className="muted" style={{ margin: "6px 0 26px" }}>
            Acceso restringido. Los estudiantes no necesitan iniciar sesión.
          </p>
          <label className="label" htmlFor="pw">
            Contraseña
          </label>
          <input
            id="pw"
            className="input"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && (
            <div className="callout callout-err" style={{ marginTop: 14 }} role="alert">
              <AlertCircle size={18} />
              {error}
            </div>
          )}
          <button className="btn btn-dark btn-lg" style={{ width: "100%", marginTop: 20 }} disabled={loading || !password}>
            {loading ? <Loader2 size={18} className="spin" /> : <>Entrar <ArrowRight size={18} /></>}
          </button>
        </form>
      </section>
    </div>
  );
}
