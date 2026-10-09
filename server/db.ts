import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID, randomInt } from "node:crypto";

const dbPath = resolve(process.env.DATABASE_PATH || "./data/tuvoz.db");
mkdirSync(dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  public_code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft',
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  activated_at TEXT,
  closed_at TEXT,
  codebook_approved_at TEXT,
  codebook_updated_at TEXT
);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  ord INTEGER NOT NULL,
  text TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  idem_key TEXT NOT NULL,
  consent_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (session_id, idem_key),
  UNIQUE (session_id, seq)
);

CREATE TABLE IF NOT EXISTS responses (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  submission_id TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_responses_session ON responses(session_id);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  definition TEXT NOT NULL DEFAULT '',
  origin TEXT NOT NULL DEFAULT 'ia',
  ord INTEGER NOT NULL DEFAULT 0,
  example_codes TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_categories_session ON categories(session_id);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  mode TEXT,
  status TEXT NOT NULL,
  total INTEGER NOT NULL DEFAULT 0,
  processed INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_runs_session ON runs(session_id);

CREATE TABLE IF NOT EXISTS analyses (
  response_id TEXT PRIMARY KEY REFERENCES responses(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL,
  status TEXT NOT NULL,
  sentiment TEXT,
  categories TEXT NOT NULL DEFAULT '[]',
  justification TEXT NOT NULL DEFAULT '',
  evidences TEXT NOT NULL DEFAULT '[]',
  ai_output TEXT,
  model TEXT NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL,
  human_sentiment TEXT,
  human_categories TEXT,
  validated INTEGER NOT NULL DEFAULT 0,
  reviewed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_analyses_session ON analyses(session_id);

CREATE TABLE IF NOT EXISTS findings (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL,
  ord INTEGER NOT NULL,
  title TEXT NOT NULL,
  text TEXT NOT NULL,
  question_ord INTEGER,
  support TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);
`);

export const now = () => new Date().toISOString();
export const newId = () => randomUUID();

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function newPublicCode(): string {
  for (;;) {
    let code = "";
    for (let i = 0; i < 5; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    const exists = db.prepare("SELECT 1 FROM sessions WHERE public_code = ?").get(code);
    if (!exists) return code;
  }
}

/** Ejecuta fn dentro de una transacción (rollback ante error). */
export function tx<T>(fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

// Un servidor reiniciado no puede continuar trabajos en curso: se marcan como fallidos
// para que el docente pueda reintentar (las respuestas y análisis ya guardados se conservan).
db.prepare(
  `UPDATE runs SET status = 'failed', error = 'El servidor se reinició durante el proceso; puedes reintentar.', completed_at = ?
   WHERE status IN ('queued', 'running')`,
).run(now());
