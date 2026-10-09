import { Component, lazy, StrictMode, Suspense, useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import "./styles.css";
import { api } from "./lib/api";
import { ToastProvider } from "./components/ui";
import Participate from "./pages/Participate";
import Thanks from "./pages/Thanks";

// El panel docente (gráficos, QR) se carga aparte: los celulares de los estudiantes no lo descargan.
const AdminLogin = lazy(() => import("./pages/AdminLogin"));
const AdminHome = lazy(() => import("./pages/AdminHome"));
const Workspace = lazy(() => import("./pages/workspace/Workspace"));
const Projection = lazy(() => import("./pages/Projection"));

const Spinner = () => (
  <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center" }}>
    <Loader2 className="spin" color="#2463EB" />
  </div>
);

/** La seguridad real está en el servidor (cookie firmada); esto solo redirige la interfaz. */
function AdminGuard({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"loading" | "ok" | "no">("loading");
  const location = useLocation();
  useEffect(() => {
    api
      .get<{ admin: boolean }>("/api/admin/me")
      .then((r) => setState(r.admin ? "ok" : "no"))
      .catch(() => setState("no"));
  }, []);
  if (state === "loading") return <Spinner />;
  if (state === "no") return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  return <Suspense fallback={<Spinner />}>{children}</Suspense>;
}

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24, textAlign: "center" }}>
        <div>
          <h2 style={{ fontSize: 22, marginBottom: 8 }}>Algo no se mostró bien</h2>
          <p className="muted" style={{ marginBottom: 18 }}>Tus datos están a salvo en el servidor. Recarga la página para continuar.</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Recargar
          </button>
        </div>
      </div>
    );
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Participate />} />
          <Route path="/gracias" element={<Thanks />} />
          <Route path="/admin/login" element={<Suspense fallback={<Spinner />}><AdminLogin /></Suspense>} />
          <Route path="/admin" element={<AdminGuard><AdminHome /></AdminGuard>} />
          <Route path="/admin/sesiones/:id" element={<AdminGuard><Workspace /></AdminGuard>} />
          <Route path="/admin/sesiones/:id/proyectar" element={<AdminGuard><Projection /></AdminGuard>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
    </ErrorBoundary>
  </StrictMode>,
);
