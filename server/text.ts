// Utilidades de texto: normalización y verificación de citas literales.

/** Minúsculas, sin tildes, sin puntuación y con espacios colapsados. */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Conserva solo las evidencias que existen en la respuesta original (tolerando
 * diferencias de tildes, mayúsculas y puntuación). Devuelve el fragmento tal como
 * aparece en el texto original para que la cita sea verdaderamente literal.
 */
export function verifyEvidences(original: string, evidences: string[]): string[] {
  const out: string[] = [];
  for (const ev of evidences) {
    const target = normalize(ev);
    if (target.length < 3) continue;
    const literal = findLiteral(original, target);
    if (literal && !out.includes(literal)) out.push(literal);
  }
  return out;
}

/** Busca en `original` el tramo cuyo texto normalizado coincide con `target`. */
function findLiteral(original: string, target: string): string | null {
  // Mapeo de cada carácter normalizado a su posición en el original.
  const chars: string[] = [];
  const positions: number[] = [];
  let lastWasSpace = true;
  for (let i = 0; i < original.length; i++) {
    const n = normalize(original[i]!);
    if (n === "" || n === " ") {
      if (!lastWasSpace) {
        chars.push(" ");
        positions.push(i);
        lastWasSpace = true;
      }
      continue;
    }
    for (const c of n) {
      chars.push(c);
      positions.push(i);
    }
    lastWasSpace = false;
  }
  const haystack = chars.join("");
  const idx = haystack.indexOf(target);
  if (idx < 0) return null;
  const start = positions[idx]!;
  const end = positions[idx + target.length - 1]!;
  return original.slice(start, end + 1).trim();
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1).trimEnd() + "…";
}
