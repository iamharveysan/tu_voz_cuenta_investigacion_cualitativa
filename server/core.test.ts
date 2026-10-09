import { test } from "node:test";
import assert from "node:assert/strict";
import { normalize, verifyEvidences } from "./text.js";
import { cleanClassification, cleanCodebook, cleanFindings } from "./ai.js";

test("normalize quita tildes, mayúsculas y puntuación", () => {
  assert.equal(normalize("¡Me AYUDÓ, mucho!"), "me ayudo mucho");
});

test("verifyEvidences conserva solo citas que existen en la respuesta y las devuelve literales", () => {
  const original = "Me ayuda a organizarme, pero algunas respuestas no son confiables.";
  const out = verifyEvidences(original, ["me ayuda a organizarme", "algunas respuestas NO son confiables", "texto inventado"]);
  assert.deepEqual(out, ["Me ayuda a organizarme", "algunas respuestas no son confiables"]);
});

test("verifyEvidences tolera diferencias de tildes", () => {
  const out = verifyEvidences("La información está desactualizada.", ["la informacion esta desactualizada"]);
  assert.deepEqual(out, ["La información está desactualizada"]);
});

const input = {
  question: "¿Qué dificultades has tenido?",
  response: "A veces se equivoca y me da miedo depender de ella.",
  categories: [
    { name: "confiabilidad", definition: "" },
    { name: "dependencia", definition: "" },
  ],
};

test("cleanClassification descarta categorías fuera del libro de códigos y citas inventadas", () => {
  const out = cleanClassification(
    {
      sentimiento: "negativo",
      categorias: ["confiabilidad", "inventada", "confiabilidad"],
      justificacion: "x".repeat(400),
      evidencias: ["se equivoca", "esto no está en el texto"],
    },
    input,
  );
  assert.deepEqual(out.categories, ["confiabilidad"]);
  assert.deepEqual(out.evidences, ["se equivoca"]);
  assert.ok(out.justification.length <= 240);
});

test("cleanClassification usa «otro» si no queda ninguna categoría válida y lo quita si hay otras", () => {
  assert.deepEqual(cleanClassification({ sentimiento: "neutral", categorias: [], justificacion: "", evidencias: [] }, input).categories, ["otro"]);
  assert.deepEqual(
    cleanClassification({ sentimiento: "mixto", categorias: ["otro", "dependencia"], justificacion: "", evidencias: [] }, input).categories,
    ["dependencia"],
  );
});

test("cleanCodebook deduplica, reserva «otro» y filtra ejemplos que no existen", () => {
  const out = cleanCodebook(
    {
      categorias: [
        { nombre: "Rapidez", definicion: "Ahorro de tiempo", ejemplos: ["P01-1", "P99-9"] },
        { nombre: "rapidez", definicion: "duplicada", ejemplos: [] },
        { nombre: "otro", definicion: "", ejemplos: [] },
      ],
    },
    new Set(["P01-1"]),
  );
  assert.equal(out.length, 1);
  assert.equal(out[0]!.name, "rapidez");
  assert.deepEqual(out[0]!.exampleCodes, ["P01-1"]);
});

test("cleanFindings descarta hallazgos sin evidencia válida de la sesión", () => {
  const out = cleanFindings(
    {
      hallazgos: [
        { titulo: "Con soporte", hallazgo: "texto", pregunta: 2, soporte: ["P01-2", "P77-1"] },
        { titulo: "Sin soporte", hallazgo: "texto", pregunta: 9, soporte: ["P99-9"] },
      ],
    },
    new Set(["P01-2"]),
  );
  assert.equal(out.length, 1);
  assert.deepEqual(out[0]!.support, ["P01-2"]);
  assert.equal(out[0]!.questionOrd, 2);
});
