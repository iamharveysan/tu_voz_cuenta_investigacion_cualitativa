// Tipos compartidos entre servidor y cliente.

export const SENTIMENTS = ["positivo", "negativo", "neutral", "mixto"] as const;
export type Sentiment = (typeof SENTIMENTS)[number];

export type SessionStatus = "draft" | "active" | "closed";
export type RunKind = "codebook" | "classify" | "synthesis";
export type RunStatus = "queued" | "running" | "completed" | "partial" | "failed";
export type AnalysisStatus = "ok" | "requiere_revision" | "error";

export const OTHER_CATEGORY = "otro";

export const TEXT_MIN = 15;
export const TEXT_MAX = 1500;
export const CONSENT_VERSION = "2026-10-v1";

export interface Question {
  id: string;
  ord: number;
  text: string;
}

export interface SessionSummary {
  id: string;
  title: string;
  publicCode: string;
  status: SessionStatus;
  isDemo: boolean;
  createdAt: string;
  activatedAt: string | null;
  closedAt: string | null;
  participantCount: number;
  responseCount: number;
}

export interface Category {
  id: string;
  questionId: string;
  name: string;
  definition: string;
  origin: "ia" | "docente";
  ord: number;
  exampleCodes: string[];
}

export interface Analysis {
  status: AnalysisStatus;
  sentiment: Sentiment | null;
  categories: string[];
  justification: string;
  evidences: string[];
  model: string;
  runId: string;
  createdAt: string;
  error: string | null;
  humanSentiment: Sentiment | null;
  humanCategories: string[] | null;
  validated: boolean;
  reviewedAt: string | null;
}

export interface ResponseItem {
  id: string;
  code: string; // p.ej. "P07·2" = participante 7, pregunta 2
  participant: number;
  questionId: string;
  questionOrd: number;
  text: string;
  createdAt: string;
  analysis: Analysis | null;
}

export interface Run {
  id: string;
  kind: RunKind;
  mode: string | null;
  status: RunStatus;
  total: number;
  processed: number;
  failed: number;
  model: string;
  startedAt: string;
  completedAt: string | null;
  error: string | null;
}

export interface Finding {
  id: string;
  ord: number;
  title: string;
  text: string;
  questionOrd: number | null;
  support: string[]; // códigos de respuesta
  runId: string;
  createdAt: string;
}

export interface SessionOverview {
  session: SessionSummary & {
    codebookApprovedAt: string | null;
    codebookUpdatedAt: string | null;
  };
  questions: Question[];
  responses: ResponseItem[];
  categories: Category[];
  runs: Run[];
  findings: Finding[];
  pendingCount: number;
  aiMode: "openai" | "mock";
  model: string;
  serverTime: string;
}

export interface PublicSession {
  state: "active" | "closed" | "draft" | "none";
  session?: { title: string; code: string; isDemo: boolean; questions: Question[] };
}
