import type { WordCount } from "../lib/words";

const LIGHT = ["#102A43", "#2463EB", "#7C3AED", "#0891B2", "#0E9F6E", "#334E68", "#4F46E5", "#DB2777"];
const DARK = ["#FFFFFF", "#7FB0FF", "#C4A5FF", "#67E8F9", "#6EE7B7", "#CBD5E1", "#A5B4FC", "#F9A8D4"];

/**
 * Nube de palabras sin dependencias: las más frecuentes quedan al centro
 * (orden intercalado) y el tamaño crece con la raíz de la frecuencia.
 */
export function WordCloud({
  words,
  dark,
  min = 14,
  max = 44,
  onWordClick,
  clickHint,
}: {
  words: WordCount[];
  dark?: boolean;
  min?: number;
  max?: number;
  onWordClick?: (w: WordCount) => void;
  clickHint?: string;
}) {
  const top = words[0]?.count ?? 1;
  const palette = dark ? DARK : LIGHT;
  // Intercala: la más frecuente en el centro, las siguientes alternando a los lados.
  const arranged: { w: WordCount; rank: number }[] = [];
  words.forEach((w, rank) => (rank % 2 === 0 ? arranged.push({ w, rank }) : arranged.unshift({ w, rank })));

  return (
    <div className={`wordcloud ${dark ? "dark" : ""}`}>
      {arranged.map(({ w, rank }) => {
        const size = min + (max - min) * Math.sqrt(w.count / top);
        const Tag = onWordClick ? "button" : "span";
        return (
          <Tag
            key={w.key}
            className="wc-word"
            style={{ fontSize: size, color: palette[rank % palette.length], fontWeight: rank < 5 ? 800 : rank < 15 ? 700 : 600 }}
            title={`Aparece en ${w.count} respuesta${w.count === 1 ? "" : "s"}${clickHint ? ` · ${clickHint}` : ""}`}
            onClick={onWordClick ? () => onWordClick(w) : undefined}
          >
            {w.word}
          </Tag>
        );
      })}
    </div>
  );
}
