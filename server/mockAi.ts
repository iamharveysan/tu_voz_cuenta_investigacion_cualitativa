// Analizador SIMULADO para desarrollo sin clave de OpenAI (AI_MODE=mock).
// Usa reglas por palabras clave; la interfaz lo señala siempre como "modo simulado".
import type { Analyzer, ClassifyOutput, ProposedCategory, ProposedFinding } from "./ai.js";
import { OTHER_CATEGORY, type Sentiment } from "../shared/types.js";
import { normalize } from "./text.js";

const THEMES: { name: string; definition: string; keys: string[] }[] = [
  { name: "rapidez", definition: "Ahorro de tiempo o agilidad para realizar tareas.", keys: ["rapid", "tiempo", "agil", "veloc", "inmediat", "ahorr"] },
  { name: "comprensión", definition: "La IA ayuda a entender o explicar conceptos.", keys: ["entend", "explic", "comprend", "aclar", "concepto"] },
  { name: "organización", definition: "Apoyo para planear, resumir u ordenar el trabajo.", keys: ["organiz", "resum", "plan", "estructur", "orden"] },
  { name: "confiabilidad", definition: "Dudas sobre la exactitud o veracidad de las respuestas.", keys: ["equivoc", "error", "confiab", "fals", "invent", "verific", "exact"] },
  { name: "dependencia", definition: "Temor a depender de la IA o dejar de pensar por cuenta propia.", keys: ["depend", "pereza", "facilis", "dejar de pensar", "pensar por"] },
  { name: "integridad académica", definition: "Plagio, copia o uso deshonesto en trabajos.", keys: ["plagi", "copi", "trampa", "honest", "etic"] },
  { name: "creatividad", definition: "Generación de ideas o inspiración para proyectos.", keys: ["idea", "creativ", "inspir", "lluvia"] },
  { name: "acceso y costo", definition: "Barreras de acceso, conectividad o versiones pagas.", keys: ["pag", "cost", "acceso", "internet", "suscrip", "conexion"] },
  { name: "estudio y práctica", definition: "Uso para repasar, practicar o prepararse para evaluaciones.", keys: ["estudi", "repas", "parcial", "examen", "practic", "cuestionario", "tarjeta"] },
  { name: "uso con criterio", definition: "Uso cuidadoso, como apoyo y no como sustituto.", keys: ["cuidado", "criterio", "apoyo", "no reemplaza", "con cuidado"] },
  { name: "escritura", definition: "Apoyo en redacción, gramática o textos.", keys: ["redac", "escrib", "texto", "gramat", "ensayo"] },
  { name: "programación", definition: "Apoyo con código y programación.", keys: ["codigo", "program"] },
  { name: "privacidad y reglas", definition: "Inquietudes sobre datos personales o normas de uso.", keys: ["privacid", "regla", "permitid", "sancion"] },
];

const POS = ["ayud", "util", "facil", "bien", "buen", "excelent", "mejor", "rapid", "aprend", "benefic", "ahorr", "positiv", "encant", "practic"];
const NEG = ["error", "equivoc", "preocup", "miedo", "depend", "dificultad", "mal", "problem", "fals", "plagi", "riesgo", "confus", "pereza", "dud"];

const has = (text: string, keys: string[]) => keys.some((k) => text.includes(k));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function sentimentOf(text: string): Sentiment {
  const n = normalize(text);
  const p = POS.filter((k) => n.includes(k)).length;
  const q = NEG.filter((k) => n.includes(k)).length;
  if (p > 0 && q > 0) return "mixto";
  if (p > 0) return "positivo";
  if (q > 0) return "negativo";
  return "neutral";
}

function sentenceWith(text: string, keys: string[]): string | null {
  const sentences = text.split(/(?<=[.!?;])\s+|,\s+(?:pero|aunque|sin embargo)\s+/i);
  return sentences.find((s) => has(normalize(s), keys))?.trim().replace(/[.!?;]$/, "") ?? null;
}

export const mockAnalyzer: Analyzer = {
  mode: "mock",
  model: "simulador-local",

  async proposeCodebook({ responses }) {
    await sleep(900);
    const found: ProposedCategory[] = [];
    for (const t of THEMES) {
      const hits = responses.filter((r) => has(normalize(r.text), t.keys));
      if (hits.length > 0) found.push({ name: t.name, definition: t.definition, exampleCodes: hits.slice(0, 3).map((h) => h.code) });
    }
    return found.length ? found.slice(0, 8) : [{ name: "experiencia general", definition: "Valoraciones generales sobre el uso de IA.", exampleCodes: [] }];
  },

  async classify({ response, categories }): Promise<ClassifyOutput> {
    await sleep(250 + Math.random() * 500);
    const n = normalize(response);
    const cats: string[] = [];
    const evidences: string[] = [];
    for (const c of categories) {
      const theme = THEMES.find((t) => t.name === c.name);
      const keys = theme?.keys ?? [normalize(c.name)];
      if (has(n, keys)) {
        cats.push(c.name);
        const s = sentenceWith(response, keys);
        if (s && !evidences.includes(s)) evidences.push(s);
      }
    }
    const sentiment = sentimentOf(response);
    return {
      sentiment,
      categories: cats.length ? cats.slice(0, 3) : [OTHER_CATEGORY],
      justification: `Simulación: palabras clave asociadas a ${cats.length ? cats.slice(0, 3).join(", ") : "ninguna categoría"}.`,
      evidences: evidences.slice(0, 2),
      raw: { simulado: true },
    };
  },

  async synthesize({ questions }) {
    await sleep(1200);
    const out: ProposedFinding[] = [];
    for (const q of questions) {
      const top = q.categories.filter((c) => c.name !== OTHER_CATEGORY).sort((a, b) => b.count - a.count)[0];
      if (!top) continue;
      const support = q.samples.filter((s) => s.categories.includes(top.name)).slice(0, 3).map((s) => s.code);
      if (!support.length) continue;
      out.push({
        title: `Pregunta ${q.ord}: predomina «${top.name}»`,
        text: `(Simulación) La categoría «${top.name}» aparece en ${top.count} de ${q.analyzed} respuestas analizadas de esta pregunta.`,
        questionOrd: q.ord,
        support,
      });
    }
    return out;
  },
};
