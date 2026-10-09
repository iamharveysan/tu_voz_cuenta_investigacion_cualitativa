import type { Analysis, ResponseItem, Sentiment } from "../../shared/types";
import { SENTIMENTS } from "../../shared/types";

export const SENTIMENT_META: Record<Sentiment, { label: string; color: string; soft: string }> = {
  positivo: { label: "Positivo", color: "#0E9F6E", soft: "#E3F6EE" },
  negativo: { label: "Negativo", color: "#E5484D", soft: "#FDECEC" },
  neutral: { label: "Neutral", color: "#8A9AB0", soft: "#EEF1F5" },
  mixto: { label: "Mixto", color: "#F5A524", soft: "#FEF4E1" },
};

export const QUESTION_COLORS = ["#2463EB", "#7C3AED", "#0EA5E9"];

const CATEGORY_PALETTE = ["#2463EB", "#7C3AED", "#0891B2", "#0E9F6E", "#D97706", "#DB2777", "#4F46E5", "#65A30D", "#EA580C", "#0F766E"];
export const categoryColor = (i: number) => CATEGORY_PALETTE[i % CATEGORY_PALETTE.length]!;

export function effective(a: Analysis) {
  return { sentiment: a.humanSentiment ?? a.sentiment, categories: a.humanCategories ?? a.categories };
}

export const isAnalyzed = (r: ResponseItem) => !!r.analysis && r.analysis.status !== "error";

export function sentimentCounts(rs: ResponseItem[]) {
  const counts = Object.fromEntries(SENTIMENTS.map((s) => [s, 0])) as Record<Sentiment, number>;
  for (const r of rs) {
    const s = r.analysis && effective(r.analysis).sentiment;
    if (s) counts[s]++;
  }
  return counts;
}

export interface CategoryCount {
  key: string;
  name: string;
  questionOrd: number;
  count: number;
  sentiments: Record<Sentiment, number>;
}

export function categoryCounts(rs: ResponseItem[]): CategoryCount[] {
  const map = new Map<string, CategoryCount>();
  for (const r of rs) {
    if (!r.analysis) continue;
    const e = effective(r.analysis);
    for (const name of e.categories) {
      const key = `${r.questionOrd}::${name}`;
      let c = map.get(key);
      if (!c) {
        c = { key, name, questionOrd: r.questionOrd, count: 0, sentiments: { positivo: 0, negativo: 0, neutral: 0, mixto: 0 } };
        map.set(key, c);
      }
      c.count++;
      if (e.sentiment) c.sentiments[e.sentiment]++;
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0);

export function timeAgo(iso: string, nowIso?: string): string {
  const diff = Math.max(0, (nowIso ? Date.parse(nowIso) : Date.now()) - Date.parse(iso)) / 1000;
  if (diff < 10) return "ahora";
  if (diff < 60) return `hace ${Math.floor(diff)} s`;
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  return new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "short" });
}

export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Divide un texto en tramos marcando las evidencias (citas literales). */
export function highlight(text: string, evidences: string[]): { t: string; mark: boolean }[] {
  const ranges: [number, number][] = [];
  for (const ev of evidences) {
    const i = text.indexOf(ev);
    if (i >= 0) ranges.push([i, i + ev.length]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const out: { t: string; mark: boolean }[] = [];
  let pos = 0;
  for (const [s, e] of ranges) {
    if (s < pos) continue;
    if (s > pos) out.push({ t: text.slice(pos, s), mark: false });
    out.push({ t: text.slice(s, e), mark: true });
    pos = e;
  }
  if (pos < text.length) out.push({ t: text.slice(pos), mark: false });
  return out;
}

export function participateUrl(code: string) {
  return `${window.location.origin}/?s=${encodeURIComponent(code)}`;
}
