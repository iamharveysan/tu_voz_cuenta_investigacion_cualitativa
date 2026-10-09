// Trabajos de análisis en segundo plano: libro de códigos, clasificación y síntesis.
// Cada trabajo queda registrado en `runs` con su progreso real; el panel lo consulta.
import { db, newId, now } from "./db.js";
import { getAnalyzer, describeAiError, PROMPT_VERSION } from "./ai.js";
import { HttpError, effective, getCategories, getQuestions, getResponses, getSessionRow } from "./store.js";
import { SENTIMENTS, type RunKind, type Sentiment } from "../shared/types.js";

const CONCURRENCY = 6;
const SAMPLES_PER_QUESTION = 30;

function assertNoActiveRun(sessionId: string) {
  const active = db
    .prepare("SELECT kind FROM runs WHERE session_id = ? AND status IN ('queued','running') LIMIT 1")
    .get(sessionId) as { kind: string } | undefined;
  if (active) throw new HttpError(409, "Ya hay un análisis en curso en esta sesión. Espera a que termine.");
}

function createRun(sessionId: string, kind: RunKind, mode: string | null, total: number, model: string): string {
  const id = newId();
  db.prepare(
    `INSERT INTO runs (id, session_id, kind, mode, status, total, processed, failed, model, prompt_version, started_at)
     VALUES (?, ?, ?, ?, 'running', ?, 0, 0, ?, ?, ?)`,
  ).run(id, sessionId, kind, mode, total, model, PROMPT_VERSION, now());
  return id;
}

function finishRun(runId: string, error?: string) {
  const r = db.prepare("SELECT total, processed, failed FROM runs WHERE id = ?").get(runId) as
    | { total: number; processed: number; failed: number }
    | undefined;
  if (!r) return;
  const status = error ? "failed" : r.failed === 0 ? "completed" : r.processed > r.failed ? "partial" : "failed";
  db.prepare("UPDATE runs SET status = ?, completed_at = ?, error = ? WHERE id = ?").run(status, now(), error ?? null, runId);
}

const bump = (runId: string, ok: boolean) =>
  db.prepare(`UPDATE runs SET processed = processed + 1, failed = failed + ? WHERE id = ?`).run(ok ? 0 : 1, runId);

async function pool<T>(items: T[], size: number, worker: (item: T) => Promise<void>) {
  let i = 0;
  const lanes = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) await worker(items[i++]!);
  });
  await Promise.all(lanes);
}

function launch(runId: string, job: () => Promise<void>) {
  job()
    .then(() => finishRun(runId))
    .catch((err) => {
      console.error(`[run ${runId}] fallo:`, describeAiError(err));
      finishRun(runId, describeAiError(err));
    });
}

// ───────────────────────── 1. Codificación abierta ─────────────────────────

export function startCodebook(sessionId: string): string {
  getSessionRow(sessionId);
  assertNoActiveRun(sessionId);
  const analyzer = getAnalyzer();
  const questions = getQuestions(sessionId);
  const responses = getResponses(sessionId);
  if (responses.length === 0) throw new HttpError(400, "Aún no hay respuestas para codificar.");

  const runId = createRun(sessionId, "codebook", null, questions.length, analyzer.model);
  launch(runId, async () => {
    const results = new Map<string, { name: string; definition: string; exampleCodes: string[] }[]>();
    await pool(questions, 3, async (q) => {
      const rs = responses.filter((r) => r.questionId === q.id).slice(0, 200);
      try {
        if (rs.length > 0) {
          results.set(q.id, await analyzer.proposeCodebook({ question: q.text, responses: rs.map((r) => ({ code: r.code, text: r.text })) }));
        }
        bump(runId, true);
      } catch (err) {
        console.error(`[codebook] pregunta ${q.ord}:`, describeAiError(err));
        bump(runId, false);
        db.prepare("UPDATE runs SET error = ? WHERE id = ?").run(describeAiError(err), runId);
      }
    });
    if (results.size === 0) throw new Error("No se pudo generar el libro de códigos.");

    // Reemplaza las categorías solo de las preguntas que se codificaron con éxito.
    const ts = now();
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const [questionId, cats] of results) {
        db.prepare("DELETE FROM categories WHERE session_id = ? AND question_id = ?").run(sessionId, questionId);
        cats.forEach((c, i) =>
          db
            .prepare(
              `INSERT INTO categories (id, session_id, question_id, name, definition, origin, ord, example_codes, created_at)
               VALUES (?, ?, ?, ?, ?, 'ia', ?, ?, ?)`,
            )
            .run(newId(), sessionId, questionId, c.name, c.definition, i, JSON.stringify(c.exampleCodes), ts),
        );
      }
      db.prepare("UPDATE sessions SET codebook_approved_at = NULL, codebook_updated_at = ? WHERE id = ?").run(ts, sessionId);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  });
  return runId;
}

// ───────────────────────── 2. Clasificación ─────────────────────────

export function startClassify(sessionId: string, mode: "new" | "all"): string {
  const session = getSessionRow(sessionId);
  assertNoActiveRun(sessionId);
  if (!session.codebook_approved_at) throw new HttpError(400, "Primero valida y aprueba el libro de códigos.");
  const analyzer = getAnalyzer();
  const questions = new Map(getQuestions(sessionId).map((q) => [q.id, q]));
  const categories = getCategories(sessionId);
  const all = getResponses(sessionId);
  const targets = mode === "all" ? all : all.filter((r) => !r.analysis || r.analysis.status === "error");
  if (targets.length === 0) throw new HttpError(400, "No hay respuestas pendientes de analizar.");

  const runId = createRun(sessionId, "classify", mode, targets.length, analyzer.model);
  const upsert = db.prepare(
    `INSERT INTO analyses (response_id, session_id, run_id, status, sentiment, categories, justification, evidences, ai_output, model, error, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
     ON CONFLICT(response_id) DO UPDATE SET
       run_id = excluded.run_id, status = excluded.status, sentiment = excluded.sentiment,
       categories = excluded.categories, justification = excluded.justification, evidences = excluded.evidences,
       ai_output = excluded.ai_output, model = excluded.model, error = NULL, created_at = excluded.created_at,
       human_sentiment = NULL, human_categories = NULL, validated = 0, reviewed_at = NULL`,
  );
  // Un fallo nunca sobrescribe un análisis exitoso previo.
  const markError = db.prepare(
    `INSERT INTO analyses (response_id, session_id, run_id, status, model, error, created_at)
     VALUES (?, ?, ?, 'error', ?, ?, ?)
     ON CONFLICT(response_id) DO UPDATE SET run_id = excluded.run_id, error = excluded.error
     WHERE analyses.status = 'error'`,
  );

  launch(runId, async () => {
    await pool(targets, CONCURRENCY, async (r) => {
      const q = questions.get(r.questionId);
      const cats = categories.filter((c) => c.questionId === r.questionId);
      try {
        const out = await analyzer.classify({
          question: q?.text ?? "",
          response: r.text,
          categories: cats.map((c) => ({ name: c.name, definition: c.definition })),
        });
        // Sin evidencia literal verificable, el resultado queda marcado para revisión humana.
        const status = out.evidences.length > 0 ? "ok" : "requiere_revision";
        upsert.run(
          r.id, sessionId, runId, status, out.sentiment, JSON.stringify(out.categories),
          out.justification, JSON.stringify(out.evidences), JSON.stringify(out.raw), analyzer.model, now(),
        );
        bump(runId, true);
      } catch (err) {
        const msg = describeAiError(err);
        console.error(`[classify] ${r.code}:`, msg);
        markError.run(r.id, sessionId, runId, analyzer.model, msg, now());
        bump(runId, false);
        db.prepare("UPDATE runs SET error = ? WHERE id = ?").run(msg, runId);
      }
    });
  });
  return runId;
}

// ───────────────────────── 3. Síntesis interpretativa ─────────────────────────

export function startSynthesis(sessionId: string, topic: string): string {
  getSessionRow(sessionId);
  assertNoActiveRun(sessionId);
  const analyzer = getAnalyzer();
  const questions = getQuestions(sessionId);
  const analyzed = getResponses(sessionId).filter((r) => r.analysis && r.analysis.status !== "error");
  if (analyzed.length < 3) throw new HttpError(400, "Se necesitan al menos 3 respuestas clasificadas para sintetizar.");

  const input = {
    topic,
    questions: questions.map((q) => {
      const rs = analyzed.filter((r) => r.questionId === q.id);
      const sentiments = Object.fromEntries(SENTIMENTS.map((x) => [x, 0])) as Record<Sentiment, number>;
      const catCount = new Map<string, number>();
      for (const r of rs) {
        const e = effective(r.analysis!);
        if (e.sentiment) sentiments[e.sentiment]++;
        for (const c of e.categories) catCount.set(c, (catCount.get(c) ?? 0) + 1);
      }
      return {
        ord: q.ord,
        text: q.text,
        analyzed: rs.length,
        sentiments,
        categories: [...catCount].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
        samples: rs.slice(0, SAMPLES_PER_QUESTION).map((r) => {
          const e = effective(r.analysis!);
          return { code: r.code, text: r.text.slice(0, 400), sentiment: e.sentiment ?? "", categories: e.categories };
        }),
      };
    }),
  };

  const runId = createRun(sessionId, "synthesis", null, 1, analyzer.model);
  launch(runId, async () => {
    const findings = await analyzer.synthesize(input);
    if (findings.length === 0) throw new Error("El modelo no produjo hallazgos sustentados en evidencia.");
    const ts = now();
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("DELETE FROM findings WHERE session_id = ?").run(sessionId);
      findings.forEach((f, i) =>
        db
          .prepare(
            `INSERT INTO findings (id, session_id, run_id, ord, title, text, question_ord, support, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(newId(), sessionId, runId, i, f.title, f.text, f.questionOrd, JSON.stringify(f.support), ts),
      );
      db.prepare("UPDATE runs SET processed = 1 WHERE id = ?").run(runId);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  });
  return runId;
}
