# Especificación v2 — Tu voz cuenta

> Evolución de la especificación original (`especificacion_app_investigacion_cualitativa.md`), ajustada para una **demostración en vivo** en clase. Se mantienen sus principios: datos reales, sin cifras simuladas en producción, análisis solo cuando el docente lo decide, IA solo desde el backend y revisión humana.

## 1. Cambios respecto a la v1 y por qué

| Tema | v1 | v2 | Motivo |
|---|---|---|---|
| Infraestructura | Firebase (Auth, Firestore, Functions) | Un Web Service en Render + SQLite en disco persistente | Menos cuentas y configuración; Functions exigía plan Blaze; menos puntos de falla en vivo |
| Autenticación docente | Firebase Auth + rol | Contraseña en variable de entorno + cookie firmada HMAC | Un solo docente; suficiente y verificable en cada endpoint |
| Tiempo real | Suscripción Firestore | Consulta periódica (2,5 s; 1 s durante análisis) | Simple y robusto para una clase |
| Categorías | Emergentes por respuesta, sin ver las demás | **Libro de códigos en dos pasos**: codificación abierta sobre todo el corpus → validación humana → clasificación restringida al libro aprobado | Evita la dispersión de etiquetas («rapidez», «ahorro de tiempo», «agilidad») y refleja el proceso cualitativo real |
| Citas | Literales exactas | Coincidencia normalizada (tildes, mayúsculas, puntuación), guardando el fragmento original | Los modelos alteran mínimamente las citas; sin cita verificable → `requiere_revision` |
| Antiabuso | Rate limiting sin IP | Límite en memoria por IP (no persistida), amplio para NAT del campus + idempotencia | Resuelve la tensión entre privacidad y abuso |
| Experiencia docente | Secciones A–D | Recorrido de **5 pasos** proyectable + modo proyección | La demo enseña el *proceso*, no solo el gráfico final |

## 2. Flujo

1. Docente crea la sesión (título + 3 preguntas editables hasta la primera respuesta) y la activa.
2. Estudiantes responden desde `/?s=CODIGO`: 3 respuestas (15–1500 caracteres), consentimiento, envío idempotente.
3. **Codificación abierta**: por pregunta, el modelo lee hasta 200 respuestas y propone 4–8 categorías con definición operativa y ejemplos (códigos de respuesta verificados).
4. **Validación**: renombrar (se propaga a análisis existentes), editar definición, fusionar, eliminar, añadir; **aprobar**. Cualquier cambio exige reaprobación.
5. **Clasificación** (solo nuevas / todas con confirmación): una llamada por respuesta, concurrencia 6, reintentos con backoff del SDK, progreso real. Un fallo nunca sobrescribe un análisis exitoso.
6. **Resultados**: sentimiento por pregunta (barra 100 % apilada) o dona por pregunta; categorías multietiqueta coloreadas por sentimiento; clic → testimonios con citas resaltadas; corrección humana que conserva la salida original de la IA.
7. **Hallazgos**: 3–5 hallazgos provisionales con códigos de soporte validados contra la sesión. Los gráficos no dependen de esta síntesis.

## 3. Contratos con el modelo (JSON Schema estricto)

- Libro de códigos: `{ categorias: [{ nombre, definicion, ejemplos[] }] }`
- Clasificación: `{ sentimiento: enum, categorias: enum(libro ∪ {otro})[], justificacion, evidencias[] }`
- Síntesis: `{ hallazgos: [{ titulo, hallazgo, pregunta: 1|2|3|null, soporte[] }] }`

`response_id`, `run_id`, modelo y versión de prompt los añade el servidor. Las respuestas de estudiantes se tratan como datos no confiables (instrucción explícita en cada prompt).

## 4. Modelo de datos (SQLite)

`sessions`, `questions`, `submissions` (seq por sesión, hash de idempotencia, versión de consentimiento), `responses`, `categories` (origen IA/docente, ejemplos), `runs` (tipo, modo, estado, total/procesadas/fallidas, modelo, versión de prompt), `analyses` (salida IA + campos de revisión humana), `findings`.

## 5. Rutas

| Ruta | Acceso |
|---|---|
| `/`, `/?s=CODIGO` | Público: formulario |
| `/gracias` | Público |
| `/admin/login` | Público |
| `/admin` | Docente: sesiones |
| `/admin/sesiones/:id?paso=0..4` | Docente: recorrido de 5 pasos |
| `/admin/sesiones/:id/proyectar` | Docente: proyección (teclas 1–5: participa, palabras, sentimientos, categorías, hallazgos; Q, F) |

## 6. Fuera de alcance (igual que v1)

Registro de estudiantes, más de tres preguntas, chat público con IA, gamificación, análisis automático por envío, análisis causal o de personalidad.
