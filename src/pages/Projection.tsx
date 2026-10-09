import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { BarChart3, Cloud, Eye, EyeOff, Lightbulb, Loader2, Maximize, QrCode, Smile } from "lucide-react";
import { WordCloud } from "../components/WordCloud";
import { questionWords, useCloudVisible, useHiddenWords, wordFrequencies } from "../lib/words";
import { useOverview } from "../hooks/useOverview";
import { Brand } from "../components/ui";
import { CategoryBars, SentimentByQuestion, SentimentDonut } from "../components/Charts";
import { categoryCounts, isAnalyzed, participateUrl, QUESTION_COLORS, sentimentCounts } from "../lib/analytics";

type Mode = "join" | "words" | "sent" | "cats" | "find";
const MODES: { id: Mode; label: string; icon: typeof QrCode }[] = [
  { id: "join", label: "Participa", icon: QrCode },
  { id: "words", label: "Palabras", icon: Cloud },
  { id: "sent", label: "Sentimientos", icon: Smile },
  { id: "cats", label: "Categorías", icon: BarChart3 },
  { id: "find", label: "Hallazgos", icon: Lightbulb },
];

export default function Projection() {
  const { id = "" } = useParams();
  const { data } = useOverview(id);
  const [mode, setMode] = useState<Mode>("join");
  const [q, setQ] = useState<number | null>(null);
  const [idle, setIdle] = useState(false);
  const { hidden } = useHiddenWords(id);
  const cloud = useCloudVisible(id);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const wake = () => {
      setIdle(false);
      clearTimeout(t);
      t = setTimeout(() => setIdle(true), 3000);
    };
    const onKey = (e: KeyboardEvent) => {
      wake();
      const i = ["1", "2", "3", "4", "5"].indexOf(e.key);
      if (i >= 0) setMode(MODES[i]!.id);
      if (e.key.toLowerCase() === "q") setQ((x) => (x === null ? 1 : x >= 3 ? null : x + 1));
      if (e.key.toLowerCase() === "f") document.documentElement.requestFullscreen?.().catch(() => {});
    };
    window.addEventListener("mousemove", wake);
    window.addEventListener("keydown", onKey);
    wake();
    return () => {
      clearTimeout(t);
      window.removeEventListener("mousemove", wake);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  if (!data)
    return (
      <div className="proj" style={{ display: "grid", placeItems: "center" }}>
        <Loader2 className="spin" size={36} />
      </div>
    );

  const s = data.session;
  const url = participateUrl(s.publicCode);
  const analyzed = data.responses.filter(isAnalyzed);
  const scoped = analyzed.filter((r) => q === null || r.questionOrd === q);
  const question = q ? data.questions.find((x) => x.ord === q) : null;
  const findings = data.findings.filter((f) => q === null || f.questionOrd === null || f.questionOrd === q);

  return (
    <div className={`proj ${idle ? "idle" : ""}`}>
      <div className="proj-top">
        <Brand light />
        <div className="row" style={{ gap: 14 }}>
          {s.isDemo && <span className="pill pill-demo">Datos sintéticos</span>}
          <span className="proj-title">{s.title}</span>
          {s.status === "active" && <span className="pill pill-live pill-dot">En vivo · {s.participantCount}</span>}
        </div>
      </div>

      <main className="proj-main">
        {mode === "join" && (
          <div className="proj-join fade-in">
            <div className="proj-qr">
              <QRCodeSVG value={url} size={Math.min(440, Math.round(window.innerHeight * 0.52))} level="M" fgColor="#102A43" marginSize={1} />
            </div>
            <div>
              <div className="eyebrow" style={{ color: "#9fc0ff", fontSize: 15 }}>
                {s.status === "active" ? "Escanea con tu celular" : s.isDemo ? "Sesión de demostración" : "La sesión no está recibiendo respuestas"}
              </div>
              <h1 className="proj-h" style={{ fontSize: "clamp(36px, 4.6vw, 72px)", marginTop: 10 }}>
                Tu voz cuenta.
              </h1>
              <p className="proj-sub" style={{ marginBottom: 0 }}>
                3 preguntas abiertas · anónimo · 3 minutos
              </p>
              <div className="proj-url">
                {url.replace(/^https?:\/\//, "")}
              </div>
              <div className="proj-counter">
                <div>
                  <b key={s.participantCount} className="bump">{s.participantCount}</b>
                  <span>participantes</span>
                </div>
                <div>
                  <b>{s.responseCount}</b>
                  <span>respuestas</span>
                </div>
              </div>
              <div className="proj-dots" aria-hidden="true">
                {Array.from({ length: Math.min(s.participantCount, 120) }, (_, i) => (
                  <i key={i} />
                ))}
              </div>
            </div>
          </div>
        )}

        {mode === "words" && (
          <div className="fade-in" key={`w${q}`} style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <h1 className="proj-h">¿Qué palabras usa el grupo?</h1>
            <p className="proj-sub">
              {question ? `Pregunta ${q}: ${question.text}` : "Las tres preguntas"} · tamaño = en cuántas respuestas aparece · frecuencia no es
              significado
            </p>
            <div className="proj-panel" style={{ flex: 1, display: "grid", placeItems: "center", minHeight: 360 }}>
              {!cloud.visible ? (
                <p className="proj-sub" style={{ margin: 0 }}>
                  Nube en pausa
                </p>
              ) : (() => {
                  const scopedAll = data.responses.filter((r) => q === null || r.questionOrd === q);
                  const qs = data.questions.filter((x) => q === null || x.ord === q).map((x) => x.text);
                  const words = wordFrequencies(scopedAll.map((r) => r.text), questionWords(qs), hidden, 32);
                  // El tamaño máximo se adapta a la pantalla para que la nube nunca se desborde.
                  const max = Math.round(Math.min(88, window.innerHeight * 0.07, window.innerWidth * 0.05));
                  return words.length ? (
                    <WordCloud words={words} dark min={Math.max(14, Math.round(max * 0.32))} max={max} />
                  ) : (
                    <p className="proj-sub" style={{ margin: 0 }}>
                      Las palabras aparecerán con las primeras respuestas.
                    </p>
                  );
                })()}
            </div>
          </div>
        )}

        {(mode === "sent" || mode === "cats" || mode === "find") && analyzed.length === 0 && (
          <div style={{ flex: 1, display: "grid", placeItems: "center", textAlign: "center" }}>
            <div>
              <h1 className="proj-h">Aún no hay resultados</h1>
              <p className="proj-sub">Los gráficos aparecerán cuando el docente clasifique las respuestas.</p>
            </div>
          </div>
        )}

        {mode === "sent" && analyzed.length > 0 && (
          <div className="fade-in" key={`s${q}`}>
            <h1 className="proj-h">¿Cómo se siente el grupo?</h1>
            <p className="proj-sub">{question ? `Pregunta ${q}: ${question.text}` : "Sentimiento por pregunta · % de respuestas analizadas"}</p>
            <div className="proj-panel">
              {q === null ? (
                <SentimentByQuestion
                  dark
                  height={Math.max(300, window.innerHeight * 0.42)}
                  rows={data.questions.map((x) => ({ ord: x.ord, label: `Pregunta ${x.ord}`, counts: sentimentCounts(analyzed.filter((r) => r.questionOrd === x.ord)) }))}
                />
              ) : (
                <SentimentDonut dark size={Math.min(420, window.innerHeight * 0.48)} counts={sentimentCounts(scoped)} />
              )}
            </div>
          </div>
        )}

        {mode === "cats" && analyzed.length > 0 && (
          <div className="fade-in" key={`c${q}`}>
            <h1 className="proj-h">¿De qué habla el grupo?</h1>
            <p className="proj-sub">
              {question ? `Pregunta ${q}: ${question.text}` : "Categorías más frecuentes en las tres preguntas"} · color = sentimiento · multietiqueta
            </p>
            <div className="proj-panel">
              <CategoryBars items={categoryCounts(scoped)} showQuestion={q === null} limit={10} />
            </div>
          </div>
        )}

        {mode === "find" && analyzed.length > 0 && (
          <div className="fade-in" key={`f${q}`}>
            <h1 className="proj-h">Hallazgos provisionales</h1>
            <p className="proj-sub">La IA sugiere; el grupo interpreta y valida. Cada hallazgo se apoya en voces reales.</p>
            {findings.length === 0 ? (
              <p className="proj-sub">Todavía no se han generado hallazgos.</p>
            ) : (
              <div className="proj-findings">
                {findings.map((f, i) => {
                  const quote = data.responses.find((r) => r.code === f.support[0]);
                  return (
                    <article key={f.id} className="proj-finding fade-in" style={{ animationDelay: `${i * 0.1}s` }}>
                      <div className="row" style={{ gap: 12 }}>
                        <span className="finding-n">{i + 1}</span>
                        {f.questionOrd && (
                          <span style={{ fontWeight: 700, color: QUESTION_COLORS[f.questionOrd - 1] === "#2463EB" ? "#7FB0FF" : QUESTION_COLORS[f.questionOrd - 1] }}>
                            Pregunta {f.questionOrd}
                          </span>
                        )}
                      </div>
                      <h3>{f.title}</h3>
                      <p>{f.text}</p>
                      {quote && <div className="q">“{quote.text.length > 180 ? quote.text.slice(0, 178) + "…" : quote.text}” — {quote.code}</div>}
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>

      <nav className="proj-dock" aria-label="Vistas de proyección">
        {MODES.map((m, i) => {
          const Icon = m.icon;
          return (
            <button key={m.id} className={mode === m.id ? "on" : ""} onClick={() => setMode(m.id)}>
              <Icon size={16} /> {m.label} <kbd>{i + 1}</kbd>
            </button>
          );
        })}
        {mode !== "join" && (
          <>
            <span className="sep" />
            {[null, 1, 2, 3].map((x) => (
              <button key={String(x)} className={q === x ? "on" : ""} onClick={() => setQ(x)}>
                {x === null ? "Todas" : `P${x}`}
              </button>
            ))}
          </>
        )}
        {mode === "words" && (
          <>
            <span className="sep" />
            <button onClick={() => cloud.setVisible(!cloud.visible)} title="Ocultar o mostrar la nube">
              {cloud.visible ? <EyeOff size={16} /> : <Eye size={16} />} {cloud.visible ? "Ocultar" : "Mostrar"}
            </button>
          </>
        )}
        <span className="sep" />
        <button onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})} title="Pantalla completa (F)">
          <Maximize size={16} />
        </button>
      </nav>
    </div>
  );
}
