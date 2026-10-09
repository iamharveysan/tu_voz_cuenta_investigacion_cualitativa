// Consultas de lectura y construcción de vistas para el panel docente.
import { db, parseJson } from "./db.js";
import { aiInfo } from "./ai.js";
import type {
  Analysis,
  Category,
  Finding,
  Question,
  ResponseItem,
  Run,
  SessionOverview,
  SessionSummary,
  Sentiment,
} from "../shared/types.js";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? null : String(v));

export const responseCode = (seq: number, ord: number) => `P${String(seq).padStart(2, "0")}-${ord}`;

function toSummary(r: Row): SessionSummary {
  return {
    id: String(r.id),
    title: String(r.title),
    publicCode: String(r.public_code),
    status: r.status as SessionSummary["status"],
    isDemo: Number(r.is_demo) === 1,
    createdAt: String(r.created_at),
    activatedAt: s(r.activated_at),
    closedAt: s(r.closed_at),
    participantCount: Number(r.participant_count ?? 0),
    responseCount: Number(r.response_count ?? 0),
  };
}

const SUMMARY_SQL = `
  SELECT s.*,
    (SELECT COUNT(*) FROM submissions WHERE session_id = s.id) AS participant_count,
    (SELECT COUNT(*) FROM responses WHERE session_id = s.id) AS response_count
  FROM sessions s`;

export function listSessions(): SessionSummary[] {
  return (db.prepare(`${SUMMARY_SQL} ORDER BY s.created_at DESC`).all() as Row[]).map(toSummary);
}

export function getSessionRow(id: string): Row {
  const row = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as Row | undefined;
  if (!row) throw new HttpError(404, "Sesión no encontrada.");
  return row;
}

export function getQuestions(sessionId: string): Question[] {
  return (db.prepare("SELECT id, ord, text FROM questions WHERE session_id = ? ORDER BY ord").all(sessionId) as Row[]).map(
    (q) => ({ id: String(q.id), ord: Number(q.ord), text: String(q.text) }),
  );
}

export function getCategories(sessionId: string): Category[] {
  return (db.prepare("SELECT * FROM categories WHERE session_id = ? ORDER BY ord, created_at").all(sessionId) as Row[]).map(
    (c) => ({
      id: String(c.id),
      questionId: String(c.question_id),
      name: String(c.name),
      definition: String(c.definition),
      origin: c.origin === "docente" ? "docente" : "ia",
      ord: Number(c.ord),
      exampleCodes: parseJson<string[]>(c.example_codes, []),
    }),
  );
}

function toAnalysis(r: Row): Analysis | null {
  if (r.a_status == null) return null;
  return {
    status: r.a_status as Analysis["status"],
    sentiment: (r.a_sentiment as Sentiment) ?? null,
    categories: parseJson<string[]>(r.a_categories, []),
    justification: String(r.a_justification ?? ""),
    evidences: parseJson<string[]>(r.a_evidences, []),
    model: String(r.a_model ?? ""),
    runId: String(r.a_run_id ?? ""),
    createdAt: String(r.a_created_at ?? ""),
    error: s(r.a_error),
    humanSentiment: (r.a_human_sentiment as Sentiment) ?? null,
    humanCategories: r.a_human_categories == null ? null : parseJson<string[]>(r.a_human_categories, []),
    validated: Number(r.a_validated) === 1,
    reviewedAt: s(r.a_reviewed_at),
  };
}

export function getResponses(sessionId: string): ResponseItem[] {
  const rows = db
    .prepare(
      `SELECT r.id, r.text, r.created_at, r.question_id, q.ord AS q_ord, sub.seq,
         a.status AS a_status, a.sentiment AS a_sentiment, a.categories AS a_categories,
         a.justification AS a_justification, a.evidences AS a_evidences, a.model AS a_model,
         a.run_id AS a_run_id, a.created_at AS a_created_at, a.error AS a_error,
         a.human_sentiment AS a_human_sentiment, a.human_categories AS a_human_categories,
         a.validated AS a_validated, a.reviewed_at AS a_reviewed_at
       FROM responses r
       JOIN questions q ON q.id = r.question_id
       JOIN submissions sub ON sub.id = r.submission_id
       LEFT JOIN analyses a ON a.response_id = r.id
       WHERE r.session_id = ?
       ORDER BY sub.seq, q.ord`,
    )
    .all(sessionId) as Row[];
  return rows.map((r) => ({
    id: String(r.id),
    code: responseCode(Number(r.seq), Number(r.q_ord)),
    participant: Number(r.seq),
    questionId: String(r.question_id),
    questionOrd: Number(r.q_ord),
    text: String(r.text),
    createdAt: String(r.created_at),
    analysis: toAnalysis(r),
  }));
}

export function getRuns(sessionId: string): Run[] {
  return (db.prepare("SELECT * FROM runs WHERE session_id = ? ORDER BY started_at DESC LIMIT 20").all(sessionId) as Row[]).map(
    (r) => ({
      id: String(r.id),
      kind: r.kind as Run["kind"],
      mode: s(r.mode),
      status: r.status as Run["status"],
      total: Number(r.total),
      processed: Number(r.processed),
      failed: Number(r.failed),
      model: String(r.model),
      startedAt: String(r.started_at),
      completedAt: s(r.completed_at),
      error: s(r.error),
    }),
  );
}

export function getFindings(sessionId: string): Finding[] {
  return (db.prepare("SELECT * FROM findings WHERE session_id = ? ORDER BY ord").all(sessionId) as Row[]).map((f) => ({
    id: String(f.id),
    ord: Number(f.ord),
    title: String(f.title),
    text: String(f.text),
    questionOrd: f.question_ord == null ? null : Number(f.question_ord),
    support: parseJson<string[]>(f.support, []),
    runId: String(f.run_id),
    createdAt: String(f.created_at),
  }));
}

export function getOverview(sessionId: string): SessionOverview {
  const row = db.prepare(`${SUMMARY_SQL} WHERE s.id = ?`).get(sessionId) as Row | undefined;
  if (!row) throw new HttpError(404, "Sesión no encontrada.");
  const responses = getResponses(sessionId);
  const info = aiInfo();
  return {
    session: {
      ...toSummary(row),
      codebookApprovedAt: s(row.codebook_approved_at),
      codebookUpdatedAt: s(row.codebook_updated_at),
    },
    questions: getQuestions(sessionId),
    responses,
    categories: getCategories(sessionId),
    runs: getRuns(sessionId),
    findings: getFindings(sessionId),
    pendingCount: responses.filter((r) => !r.analysis || r.analysis.status === "error").length,
    aiMode: info.mode,
    model: info.model,
    serverTime: new Date().toISOString(),
  };
}

/** Sentimiento y categorías efectivos: la revisión humana prevalece sobre la IA. */
export function effective(a: Analysis): { sentiment: Sentiment | null; categories: string[] } {
  return {
    sentiment: a.humanSentiment ?? a.sentiment,
    categories: a.humanCategories ?? a.categories,
  };
}
