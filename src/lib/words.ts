import { useCallback, useEffect, useState } from "react";
import { storage } from "./api";

// Palabras vacías del español (se comparan sin tildes).
const STOPWORDS = new Set(
  `a al algo algun alguna algunas alguno algunos ante antes aqui asi aun aunque bien cada casi como con contra cosa cosas cual cuales cuando cuanto de del desde donde dos e el ella ellas ello ellos en entre era eran es esa esas ese eso esos esta estaba estado estan estar estas este esto estos estoy fue fueron ha hace hacen hacer hago han hasta hay he hemos la las le les lo los mas me mi mis mismo mucha muchas mucho muchos muy nada ni no nos nosotros nuestra nuestro o otra otras otro otros para pero poco por porque pues que quien se sea sean ser si sido siempre sin sobre solo son su sus tal tambien tan tanto te tener tengo tiene tienen todo todos tu tus un una unas uno unos usted ya yo veces vez ella hacia mediante segun sino tras cual luego aun asi alla aca ahi ahora entonces etc tambien puede pueden puedo hacerlo haber habia sea`.split(
    /\s+/,
  ),
);

const fold = (w: string) => w.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export interface WordCount {
  key: string;
  word: string;
  count: number; // número de respuestas en que aparece
}

/** Frecuencia documental: en cuántas respuestas aparece cada palabra. */
export function wordFrequencies(texts: string[], exclude: Iterable<string>, hidden: Set<string>, limit = 45): WordCount[] {
  const skip = new Set([...exclude].map(fold));
  const counts = new Map<string, { forms: Map<string, number>; count: number }>();
  for (const text of texts) {
    const seen = new Set<string>();
    for (const raw of text.match(/[\p{L}]+/gu) ?? []) {
      const lower = raw.toLowerCase();
      const key = fold(lower);
      if (key.length < 3 || STOPWORDS.has(key) || skip.has(key) || seen.has(key)) continue;
      seen.add(key);
      const entry = counts.get(key) ?? { forms: new Map(), count: 0 };
      entry.count++;
      entry.forms.set(lower, (entry.forms.get(lower) ?? 0) + 1);
      counts.set(key, entry);
    }
  }
  // Une plurales simples ("respuestas" → "respuesta") cuando ambas formas existen.
  for (const key of [...counts.keys()]) {
    const singular = key.endsWith("es") && counts.has(key.slice(0, -2)) ? key.slice(0, -2) : key.endsWith("s") && counts.has(key.slice(0, -1)) ? key.slice(0, -1) : null;
    if (!singular) continue;
    const a = counts.get(singular)!;
    const b = counts.get(key)!;
    a.count += b.count;
    for (const [f, n] of b.forms) a.forms.set(f, (a.forms.get(f) ?? 0) + n);
    counts.delete(key);
  }
  return [...counts]
    .filter(([key]) => !hidden.has(key))
    .map(([key, e]) => ({ key, count: e.count, word: [...e.forms].sort((x, y) => y[1] - x[1])[0]![0] }))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
    .slice(0, limit);
}

/** Palabras de las preguntas: se omiten porque solo repiten el enunciado. */
export const questionWords = (questions: string[]) => questions.flatMap((q) => q.match(/[\p{L}]+/gu) ?? []);

/**
 * Palabras ocultadas por el docente. Se guardan en este navegador y se sincronizan
 * entre la pestaña del panel y la del proyector.
 */
export function useHiddenWords(sessionId: string) {
  const key = `tvc-hidden-words-${sessionId}`;
  const read = useCallback(() => {
    try {
      return new Set<string>(JSON.parse(storage.get("local", key) || "[]"));
    } catch {
      return new Set<string>();
    }
  }, [key]);
  const [hidden, setHidden] = useState<Set<string>>(read);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => e.key === key && setHidden(read());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key, read]);
  const update = (next: Set<string>) => {
    setHidden(next);
    storage.set("local", key, JSON.stringify([...next]));
  };
  return {
    hidden,
    hide: (k: string) => update(new Set([...hidden, k])),
    show: (k: string) => update(new Set([...hidden].filter((x) => x !== k))),
  };
}

/** Bandera "nube visible en el proyector", sincronizada igual que las palabras ocultas. */
export function useCloudVisible(sessionId: string) {
  const key = `tvc-cloud-visible-${sessionId}`;
  const [visible, setVisible] = useState(() => storage.get("local", key) !== "0");
  useEffect(() => {
    const onStorage = (e: StorageEvent) => e.key === key && setVisible(e.newValue !== "0");
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key]);
  return {
    visible,
    setVisible: (v: boolean) => {
      setVisible(v);
      storage.set("local", key, v ? "1" : "0");
    },
  };
}
