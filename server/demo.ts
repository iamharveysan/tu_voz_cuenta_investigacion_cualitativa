// DATOS SINTÉTICOS para el plan B de la demostración. Se crean en una sesión aparte,
// marcada como demo en toda la interfaz; nunca se mezclan con sesiones reales.
import { db, newId, newPublicCode, now, tx } from "./db.js";
import { CONSENT_VERSION } from "../shared/types.js";

export const DEFAULT_QUESTIONS = [
  "¿Cómo ha sido tu experiencia utilizando inteligencia artificial para aprender?",
  "¿Qué beneficios has encontrado al utilizarla en tus actividades académicas?",
  "¿Qué dificultades o preocupaciones has experimentado al utilizar inteligencia artificial?",
];

const SYNTHETIC: [string, string, string][] = [
  ["Ha sido muy buena, la uso casi todos los días para repasar antes de los parciales.", "Me explica los temas difíciles con ejemplos sencillos y puedo preguntar las veces que quiera sin pena.", "A veces me da respuestas que suenan seguras pero están equivocadas, y si no reviso me confío."],
  ["Al principio la usaba para todo, ahora la uso con más cuidado.", "Me ahorra tiempo buscando información y organizando mis ideas para los ensayos.", "Siento que me volví un poco dependiente; me cuesta empezar un texto sin pedirle ayuda."],
  ["Regular. Me sirve para algunas cosas pero no para todas las materias.", "En programación me ayuda a encontrar errores en el código rápidamente.", "En materias de humanidades las respuestas son muy genéricas y no profundizan."],
  ["Positiva, aunque con altibajos dependiendo de cómo formule las preguntas.", "Aprendí a hacer mejores preguntas y eso me ayuda a pensar mejor el problema.", "Me preocupa que los profesores piensen que todo lo hice con IA aunque no sea así."],
  ["La he usado poco, prefiero los libros y las clases.", "Para resumir lecturas largas es útil.", "No confío en las fuentes que da, varias veces inventó referencias que no existían."],
  ["Excelente, cambió mi forma de estudiar.", "Puedo crear cuestionarios de práctica y tarjetas de estudio en minutos.", "La versión gratuita es limitada y no todos mis compañeros pueden pagar la suscripción."],
  ["Ha sido una herramienta de apoyo, no la uso para hacer las tareas por mí.", "Me da ideas cuando estoy bloqueado con un proyecto creativo.", "Hay compañeros que copian y pegan sin leer, y eso me parece un problema de honestidad académica."],
  ["Confusa al inicio, no sabía qué preguntarle.", "Con el tiempo me ayudó a entender conceptos de estadística que no entendía en clase.", "A veces explica de una forma distinta al profesor y me confunde más."],
  ["Muy útil para idiomas, practico conversación en inglés.", "Me corrige la gramática y me explica por qué me equivoqué.", "Me preocupa la privacidad, no sé qué hacen con lo que le escribo."],
  ["Buena pero hay que verificar todo.", "Rapidez para encontrar información básica de un tema nuevo.", "Tengo que verificar todo en otras fuentes, entonces a veces no ahorro tanto tiempo."],
  ["La uso sobre todo para organizar mi semana y mis entregas.", "Me ayuda a planear y dividir trabajos grandes en pasos pequeños.", "Ninguna dificultad grave, solo que a veces no entiende bien lo que le pido."],
  ["Mixta: me ayuda pero siento que aprendo menos cuando la uso mucho.", "Entiendo más rápido los ejercicios cuando me explica paso a paso.", "Siento que dejo de pensar por mí mismo y eso me preocupa para el futuro profesional."],
  ["Ha sido interesante, me da curiosidad cómo funciona.", "Me motivó a investigar más sobre los temas de clase.", "Me preocupa que reemplace trabajos de mi carrera."],
  ["Bastante positiva para escribir y redactar.", "Mejora la redacción de mis textos y me sugiere conectores.", "Los textos que genera suenan todos iguales, sin personalidad."],
  ["No la uso mucho porque en la universidad no está claro si está permitida.", "Cuando la usé me ayudó a entender un tema de cálculo.", "No hay reglas claras sobre cuándo se puede usar y eso genera miedo a ser sancionado."],
  ["Muy buena para estudiar en grupo, la consultamos juntos.", "Resuelve dudas en el momento sin esperar al profesor.", "A veces el grupo se queda con la primera respuesta y no discutimos."],
  ["Útil, pero no reemplaza al profesor.", "Me da explicaciones alternativas cuando no entiendo la del libro.", "Le falta contexto de lo que vimos en clase, entonces responde cosas que no aplican."],
  ["Me ha ayudado bastante en la tesis.", "Para buscar enfoques metodológicos y ordenar el marco teórico es muy práctica.", "Inventó citas de autores y casi las pongo en mi documento sin revisarlas."],
  ["Normal, la uso como un buscador más.", "Encuentro información más rápido que en Google.", "No sé si la información está actualizada."],
  ["Fue difícil al principio por mi conexión a internet, ahora va mejor.", "Me explica con paciencia y a mi ritmo.", "Sin buen internet no se puede usar, y en mi casa la conexión falla."],
  ["Muy positiva, la recomiendo a mis compañeros.", "Me ayuda a practicar para exámenes con preguntas tipo test.", "Ninguna, por ahora todo bien."],
  ["Creo que es útil pero hay que saber usarla con criterio.", "Me ayuda a revisar si mis argumentos tienen lógica.", "Es fácil caer en la pereza de no leer los textos completos porque ella los resume."],
  ["Me ha servido para entender código de otros.", "Aprendo patrones nuevos de programación viendo sus ejemplos.", "A veces el código que propone no funciona y pierdo tiempo arreglándolo."],
  ["Un poco ambigua: a veces me sorprende y a veces me decepciona.", "Me da muchas ideas para presentaciones.", "Me preocupa el impacto ambiental del uso de estos modelos."],
];

export function createDemoSession(): string {
  const id = newId();
  const ts = now();
  tx(() => {
    db.prepare(
      `INSERT INTO sessions (id, title, public_code, status, is_demo, created_at, activated_at, closed_at)
       VALUES (?, ?, ?, 'closed', 1, ?, ?, ?)`,
    ).run(id, "DEMO · Datos sintéticos — Percepciones sobre IA en el aprendizaje", newPublicCode(), ts, ts, ts);
    const qIds = DEFAULT_QUESTIONS.map((text, i) => {
      const qid = newId();
      db.prepare("INSERT INTO questions (id, session_id, ord, text) VALUES (?, ?, ?, ?)").run(qid, id, i + 1, text);
      return qid;
    });
    SYNTHETIC.forEach((answers, i) => {
      const subId = newId();
      const t = new Date(Date.now() - (SYNTHETIC.length - i) * 37_000).toISOString();
      db.prepare(
        "INSERT INTO submissions (id, session_id, seq, idem_key, consent_version, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).run(subId, id, i + 1, `demo-${i}`, CONSENT_VERSION, t);
      answers.forEach((text, j) =>
        db
          .prepare("INSERT INTO responses (id, session_id, submission_id, question_id, text, created_at) VALUES (?, ?, ?, ?, ?, ?)")
          .run(newId(), id, subId, qIds[j]!, text, t),
      );
    });
  });
  return id;
}
