import express, { type NextFunction, type Request, type Response } from "express";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { db, newId, newPublicCode, now, parseJson, tx } from "./db.js";
import { checkPassword, clearAdminCookie, isAdmin, rateLimit, requireAdmin, setAdminCookie } from "./auth.js";
import { HttpError, effective, getOverview, getQuestions, getResponses, getSessionRow, listSessions } from "./store.js";
import { startClassify, startCodebook, startSynthesis } from "./analysis.js";
import { createDemoSession, DEFAULT_QUESTIONS } from "./demo.js";
import { aiInfo } from "./ai.js";
import { normalize } from "./text.js";
import { CONSENT_VERSION, OTHER_CATEGORY, SENTIMENTS, TEXT_MAX, TEXT_MIN, type PublicSession } from "../shared/types.js";

const app = express();
const isProd = process.env.NODE_ENV === "production";
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));

app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("X-Frame-Options", "DENY");
  if (isProd) {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'",
    );
  }
  next();
});

// Envuelve handlers async para que los errores lleguen al manejador central.
type Handler = (req: Request, res: Response) => unknown;
const h = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve()
    .then(() => fn(req, res))
    .catch(next);
};
const param = (req: Request, name: string) => String(req.params[name] ?? "");

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

// ════════════════════════ PÚBLICO ════════════════════════

app.get(
  "/api/public/session",
  h((req, res) => {
    const code = typeof req.query.code === "string" ? req.query.code.trim().toUpperCase() : "";
    const row = (
      code
        ? db.prepare("SELECT * FROM sessions WHERE public_code = ? AND is_demo = 0").get(code)
        : db.prepare("SELECT * FROM sessions WHERE status = 'active' AND is_demo = 0 ORDER BY activated_at DESC LIMIT 1").get()
    ) as Record<string, unknown> | undefined;
    if (!row) return res.json({ state: "none" } satisfies PublicSession);
    const status = String(row.status) as PublicSession["state"];
    const body: PublicSession = { state: status };
    if (status === "active") {
      body.session = {
        title: String(row.title),
        code: String(row.public_code),
        isDemo: false,
        questions: getQuestions(String(row.id)),
      };
    }
    res.json(body);
  }),
);

const SubmitZ = z.object({
  code: z.string().min(3).max(12),
  idempotencyKey: z.string().min(8).max(100),
  consent: z.literal(true),
  answers: z
    .array(z.object({ questionId: z.string().max(64), text: z.string().max(TEXT_MAX * 2) }))
    .length(3),
});

// Límite amplio: en el campus muchos celulares comparten la misma IP pública.
app.post(
  "/api/public/submit",
  rateLimit(400, 10 * 60 * 1000),
  h((req, res) => {
    const parsed = SubmitZ.safeParse(req.body);
    if (!parsed.success) throw new HttpError(400, "Datos incompletos: responde las tres preguntas y acepta el consentimiento.");
    const { code, idempotencyKey, answers } = parsed.data;

    const session = db
      .prepare("SELECT id, status FROM sessions WHERE public_code = ? AND is_demo = 0")
      .get(code.toUpperCase()) as { id: string; status: string } | undefined;
    if (!session) throw new HttpError(404, "La sesión no existe.");
    if (session.status !== "active") throw new HttpError(409, "Esta sesión ya no recibe respuestas.");

    const questions = getQuestions(session.id);
    const ids = new Set(questions.map((q) => q.id));
    const clean = answers.map((a) => ({
      questionId: a.questionId,
      text: a.text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim(),
    }));
    if (new Set(clean.map((a) => a.questionId)).size !== 3 || !clean.every((a) => ids.has(a.questionId))) {
      throw new HttpError(400, "Las respuestas no corresponden a las preguntas de la sesión.");
    }
    for (const a of clean) {
      if (a.text.length < TEXT_MIN) throw new HttpError(400, `Cada respuesta debe tener al menos ${TEXT_MIN} caracteres.`);
      if (a.text.length > TEXT_MAX) throw new HttpError(400, `Cada respuesta admite máximo ${TEXT_MAX} caracteres.`);
    }

    const keyHash = createHash("sha256").update(idempotencyKey).digest("hex");
    const result = tx(() => {
      const existing = db
        .prepare("SELECT id FROM submissions WHERE session_id = ? AND idem_key = ?")
        .get(session.id, keyHash);
      if (existing) return { duplicate: true };
      const seq =
        Number((db.prepare("SELECT COALESCE(MAX(seq), 0) AS m FROM submissions WHERE session_id = ?").get(session.id) as { m: number }).m) + 1;
      const subId = newId();
      const ts = now();
      db.prepare(
        "INSERT INTO submissions (id, session_id, seq, idem_key, consent_version, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).run(subId, session.id, seq, keyHash, CONSENT_VERSION, ts);
      const ins = db.prepare(
        "INSERT INTO responses (id, session_id, submission_id, question_id, text, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      );
      for (const a of clean) ins.run(newId(), session.id, subId, a.questionId, a.text, ts);
      return { duplicate: false };
    });
    res.status(result.duplicate ? 200 : 201).json({ ok: true, ...result });
  }),
);

// ════════════════════════ DOCENTE ════════════════════════

app.post(
  "/api/admin/login",
  rateLimit(12, 15 * 60 * 1000),
  h((req, res) => {
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!checkPassword(password)) throw new HttpError(401, "Contraseña incorrecta.");
    setAdminCookie(res);
    res.json({ ok: true });
  }),
);

app.post("/api/admin/logout", (_req, res) => {
  clearAdminCookie(res);
  res.json({ ok: true });
});

app.get("/api/admin/me", (req, res) => {
  res.json({ admin: isAdmin(req), ai: aiInfo() });
});

const admin = express.Router();
admin.use(requireAdmin);

admin.get(
  "/sessions",
  h((_req, res) => res.json({ sessions: listSessions(), defaultQuestions: DEFAULT_QUESTIONS, ai: aiInfo() })),
);

const SessionZ = z.object({
  title: z.string().trim().min(3).max(120),
  questions: z.array(z.string().trim().min(5).max(300)).length(3),
});

admin.post(
  "/sessions",
  h((req, res) => {
    const { title, questions } = SessionZ.parse(req.body);
    const id = newId();
    tx(() => {
      db.prepare("INSERT INTO sessions (id, title, public_code, status, created_at) VALUES (?, ?, ?, 'draft', ?)").run(
        id, title, newPublicCode(), now(),
      );
      questions.forEach((text, i) =>
        db.prepare("INSERT INTO questions (id, session_id, ord, text) VALUES (?, ?, ?, ?)").run(newId(), id, i + 1, text),
      );
    });
    res.status(201).json({ id });
  }),
);

admin.post(
  "/sessions/demo",
  h((_req, res) => res.status(201).json({ id: createDemoSession() })),
);

admin.get(
  "/sessions/:id",
  h((req, res) => res.json(getOverview(param(req, "id")))),
);

admin.patch(
  "/sessions/:id",
  h((req, res) => {
    const id = param(req, "id");
    getSessionRow(id);
    const { title, questions } = SessionZ.parse(req.body);
    const count = Number((db.prepare("SELECT COUNT(*) AS c FROM responses WHERE session_id = ?").get(id) as { c: number }).c);
    const current = getQuestions(id);
    const changedQuestions = questions.some((q, i) => q !== current[i]?.text);
    if (changedQuestions && count > 0) throw new HttpError(409, "No se pueden cambiar las preguntas de una sesión que ya tiene respuestas.");
    tx(() => {
      db.prepare("UPDATE sessions SET title = ? WHERE id = ?").run(title, id);
      if (changedQuestions) current.forEach((q, i) => db.prepare("UPDATE questions SET text = ? WHERE id = ?").run(questions[i]!, q.id));
    });
    res.json({ ok: true });
  }),
);

admin.post(
  "/sessions/:id/status",
  h((req, res) => {
    const id = param(req, "id");
    const row = getSessionRow(id);
    const status = z.enum(["active", "closed"]).parse(req.body?.status);
    if (Number(row.is_demo) === 1) throw new HttpError(400, "La sesión demo no recibe respuestas.");
    if (status === "active") db.prepare("UPDATE sessions SET status = 'active', activated_at = ?, closed_at = NULL WHERE id = ?").run(now(), id);
    else db.prepare("UPDATE sessions SET status = 'closed', closed_at = ? WHERE id = ?").run(now(), id);
    res.json({ ok: true });
  }),
);

admin.delete(
  "/sessions/:id",
  h((req, res) => {
    const id = param(req, "id");
    getSessionRow(id);
    const running = db.prepare("SELECT 1 FROM runs WHERE session_id = ? AND status IN ('queued','running')").get(id);
    if (running) throw new HttpError(409, "Espera a que termine el análisis en curso antes de eliminar.");
    db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
    res.json({ ok: true });
  }),
);

// ── Libro de códigos ──

admin.post(
  "/sessions/:id/codebook",
  h((req, res) => res.status(202).json({ runId: startCodebook(param(req, "id")) })),
);

admin.post(
  "/sessions/:id/codebook/approve",
  h((req, res) => {
    const id = param(req, "id");
    getSessionRow(id);
    const questions = getQuestions(id);
    const withCats = db.prepare("SELECT DISTINCT question_id FROM categories WHERE session_id = ?").all(id).length;
    if (withCats < questions.length) throw new HttpError(400, "Cada pregunta necesita al menos una categoría antes de aprobar.");
    db.prepare("UPDATE sessions SET codebook_approved_at = ? WHERE id = ?").run(now(), id);
    res.json({ ok: true });
  }),
);

const CategoryZ = z.object({
  name: z.string().trim().min(2).max(40).transform((s) => s.toLowerCase()),
  definition: z.string().trim().max(220).default(""),
});

function assertUniqueName(sessionId: string, questionId: string, name: string, exceptId?: string) {
  if (normalize(name) === OTHER_CATEGORY) throw new HttpError(400, "«otro» es una categoría reservada.");
  const rows = db.prepare("SELECT id, name FROM categories WHERE session_id = ? AND question_id = ?").all(sessionId, questionId) as {
    id: string;
    name: string;
  }[];
  if (rows.some((r) => r.id !== exceptId && normalize(r.name) === normalize(name))) {
    throw new HttpError(409, "Ya existe una categoría con ese nombre en esta pregunta.");
  }
}

const markCodebookChanged = (sessionId: string) =>
  db.prepare("UPDATE sessions SET codebook_approved_at = NULL, codebook_updated_at = ? WHERE id = ?").run(now(), sessionId);

/** Aplica una transformación a las categorías (IA y humanas) de los análisis de una pregunta. */
function rewriteAnalysisCategories(sessionId: string, questionId: string, fn: (cats: string[]) => string[]) {
  const rows = db
    .prepare(
      `SELECT a.response_id, a.categories, a.human_categories FROM analyses a
       JOIN responses r ON r.id = a.response_id WHERE a.session_id = ? AND r.question_id = ?`,
    )
    .all(sessionId, questionId) as { response_id: string; categories: string; human_categories: string | null }[];
  const fix = (cats: string[]) => {
    const out = [...new Set(fn(cats))];
    return out.length ? out : [OTHER_CATEGORY];
  };
  for (const r of rows) {
    db.prepare("UPDATE analyses SET categories = ?, human_categories = ? WHERE response_id = ?").run(
      JSON.stringify(fix(parseJson<string[]>(r.categories, []))),
      r.human_categories == null ? null : JSON.stringify(fix(parseJson<string[]>(r.human_categories, []))),
      r.response_id,
    );
  }
}

admin.post(
  "/sessions/:id/categories",
  h((req, res) => {
    const id = param(req, "id");
    getSessionRow(id);
    const questionId = z.string().parse(req.body?.questionId);
    if (!getQuestions(id).some((q) => q.id === questionId)) throw new HttpError(400, "Pregunta inválida.");
    const { name, definition } = CategoryZ.parse(req.body);
    assertUniqueName(id, questionId, name);
    const ord = Number((db.prepare("SELECT COALESCE(MAX(ord), -1) + 1 AS o FROM categories WHERE session_id = ? AND question_id = ?").get(id, questionId) as { o: number }).o);
    tx(() => {
      db.prepare(
        `INSERT INTO categories (id, session_id, question_id, name, definition, origin, ord, example_codes, created_at)
         VALUES (?, ?, ?, ?, ?, 'docente', ?, '[]', ?)`,
      ).run(newId(), id, questionId, name, definition, ord, now());
      markCodebookChanged(id);
    });
    res.status(201).json({ ok: true });
  }),
);

admin.put(
  "/sessions/:id/categories/:catId",
  h((req, res) => {
    const id = param(req, "id");
    const cat = db.prepare("SELECT * FROM categories WHERE id = ? AND session_id = ?").get(param(req, "catId"), id) as
      | { id: string; question_id: string; name: string; definition: string }
      | undefined;
    if (!cat) throw new HttpError(404, "Categoría no encontrada.");
    const { name, definition } = CategoryZ.parse(req.body);
    assertUniqueName(id, cat.question_id, name, cat.id);
    tx(() => {
      db.prepare("UPDATE categories SET name = ?, definition = ?, origin = 'docente' WHERE id = ?").run(name, definition, cat.id);
      // Renombrar no requiere reclasificar: se propaga a los análisis existentes.
      if (name !== cat.name) rewriteAnalysisCategories(id, cat.question_id, (cats) => cats.map((c) => (c === cat.name ? name : c)));
      if (definition !== cat.definition) markCodebookChanged(id);
      else db.prepare("UPDATE sessions SET codebook_updated_at = ? WHERE id = ?").run(now(), id);
    });
    res.json({ ok: true });
  }),
);

admin.delete(
  "/sessions/:id/categories/:catId",
  h((req, res) => {
    const id = param(req, "id");
    const cat = db.prepare("SELECT * FROM categories WHERE id = ? AND session_id = ?").get(param(req, "catId"), id) as
      | { id: string; question_id: string; name: string; example_codes: string }
      | undefined;
    if (!cat) throw new HttpError(404, "Categoría no encontrada.");
    // `mergeInto`: fusionar con otra categoría en lugar de eliminar sin más.
    const mergeInto = typeof req.body?.mergeInto === "string" ? req.body.mergeInto : null;
    const target = mergeInto
      ? (db.prepare("SELECT * FROM categories WHERE id = ? AND session_id = ? AND question_id = ?").get(mergeInto, id, cat.question_id) as
          | { id: string; name: string; example_codes: string }
          | undefined)
      : undefined;
    if (mergeInto && !target) throw new HttpError(400, "Categoría de destino inválida.");
    tx(() => {
      db.prepare("DELETE FROM categories WHERE id = ?").run(cat.id);
      if (target) {
        const merged = [...new Set([...parseJson<string[]>(target.example_codes, []), ...parseJson<string[]>(cat.example_codes, [])])].slice(0, 6);
        db.prepare("UPDATE categories SET example_codes = ?, origin = 'docente' WHERE id = ?").run(JSON.stringify(merged), target.id);
      }
      rewriteAnalysisCategories(id, cat.question_id, (cats) =>
        target ? cats.map((c) => (c === cat.name ? target.name : c)) : cats.filter((c) => c !== cat.name),
      );
      markCodebookChanged(id);
    });
    res.json({ ok: true });
  }),
);

// ── Clasificación y síntesis ──

admin.post(
  "/sessions/:id/classify",
  h((req, res) => {
    const mode = z.enum(["new", "all"]).parse(req.body?.mode ?? "new");
    res.status(202).json({ runId: startClassify(param(req, "id"), mode) });
  }),
);

admin.post(
  "/sessions/:id/synthesis",
  h((req, res) => {
    const id = param(req, "id");
    const row = getSessionRow(id);
    res.status(202).json({ runId: startSynthesis(id, String(row.title)) });
  }),
);

// ── Revisión humana ──

const ReviewZ = z.object({
  sentiment: z.enum(SENTIMENTS).nullable().optional(),
  categories: z.array(z.string().max(40)).min(1).max(3).nullable().optional(),
  validated: z.boolean().optional(),
});

admin.patch(
  "/sessions/:id/responses/:rid/review",
  h((req, res) => {
    const id = param(req, "id");
    const rid = param(req, "rid");
    const a = db
      .prepare(
        "SELECT a.response_id, r.question_id FROM analyses a JOIN responses r ON r.id = a.response_id WHERE a.response_id = ? AND a.session_id = ?",
      )
      .get(rid, id) as { response_id: string; question_id: string } | undefined;
    if (!a) throw new HttpError(404, "La respuesta aún no tiene análisis.");
    const body = ReviewZ.parse(req.body);
    if (body.categories) {
      const allowed = new Set([
        OTHER_CATEGORY,
        ...(db.prepare("SELECT name FROM categories WHERE session_id = ? AND question_id = ?").all(id, a.question_id) as { name: string }[]).map(
          (c) => c.name,
        ),
      ]);
      if (!body.categories.every((c) => allowed.has(c))) throw new HttpError(400, "Categoría fuera del libro de códigos.");
    }
    const sets: string[] = ["reviewed_at = ?"];
    const vals: (string | number | null)[] = [now()];
    if (body.sentiment !== undefined) (sets.push("human_sentiment = ?"), vals.push(body.sentiment));
    if (body.categories !== undefined) (sets.push("human_categories = ?"), vals.push(body.categories ? JSON.stringify(body.categories) : null));
    if (body.validated !== undefined) (sets.push("validated = ?"), vals.push(body.validated ? 1 : 0));
    db.prepare(`UPDATE analyses SET ${sets.join(", ")} WHERE response_id = ?`).run(...vals, rid);
    res.json({ ok: true });
  }),
);

// ── Exportación CSV (matriz de codificación) ──

admin.get(
  "/sessions/:id/export.csv",
  h((req, res) => {
    const id = param(req, "id");
    const row = getSessionRow(id);
    const questions = new Map(getQuestions(id).map((q) => [q.id, q]));
    const esc = (v: unknown) => {
      let s = String(v ?? "");
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // evita inyección de fórmulas en hojas de cálculo
      return `"${s.replace(/"/g, '""')}"`;
    };
    const header = [
      "codigo", "participante", "pregunta_n", "pregunta", "respuesta", "estado_analisis",
      "sentimiento_ia", "categorias_ia", "sentimiento_final", "categorias_finales", "validado_docente",
      "justificacion", "evidencias", "modelo", "ejecucion",
    ];
    const lines = [header.join(",")];
    for (const r of getResponses(id)) {
      const a = r.analysis;
      const e = a ? effective(a) : null;
      lines.push(
        [
          r.code, r.participant, r.questionOrd, questions.get(r.questionId)?.text, r.text, a?.status ?? "pendiente",
          a?.sentiment, a?.categories.join(" | "), e?.sentiment, e?.categories.join(" | "), a?.validated ? "sí" : "no",
          a?.justification, a?.evidences.join(" | "), a?.model, a?.runId,
        ]
          .map(esc)
          .join(","),
      );
    }
    const slug = normalize(String(row.title)).replace(/\s+/g, "-").slice(0, 40) || "sesion";
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="matriz-${slug}.csv"`);
    res.send("﻿" + lines.join("\r\n"));
  }),
);

app.use("/api/admin", admin);
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Ruta no encontrada." });
});

// ════════════════════════ FRONTEND ════════════════════════

const clientDir = resolve("dist/client");
if (existsSync(clientDir)) {
  app.use(express.static(clientDir, { index: false, maxAge: "1h" }));
  app.get("*", (_req, res) => res.sendFile(resolve(clientDir, "index.html")));
}

// ════════════════════════ ERRORES ════════════════════════

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err instanceof z.ZodError) return res.status(400).json({ error: "Datos inválidos: " + err.issues.map((i) => i.message).join("; ") });
  if (err instanceof SyntaxError) return res.status(400).json({ error: "JSON inválido." });
  // No se registran cuerpos de solicitud (pueden contener testimonios).
  console.error("[error]", err instanceof Error ? err.message : err);
  const msg = err instanceof Error && /OPENAI_API_KEY|ADMIN_PASSWORD|SESSION_SECRET/.test(err.message) ? err.message : "Error interno del servidor.";
  res.status(500).json({ error: msg });
});

// API_PORT solo se usa en desarrollo local; en Render se usa PORT.
const port = Number(process.env.API_PORT || process.env.PORT || 4317);
app.listen(port, () => {
  const ai = aiInfo();
  console.log(`Tu voz cuenta · escuchando en http://localhost:${port} · IA: ${ai.mode} (${ai.model})`);
});
