# Tu voz cuenta · Laboratorio de investigación cualitativa en vivo

Aplicación web para **demostrar en clase, paso a paso, cómo se analiza un tema con métodos cualitativos** apoyados por IA:

| Paso | Qué ocurre | Mensaje metodológico |
|---|---|---|
| 1. Recolección | Los estudiantes responden 3 preguntas abiertas desde el celular (QR, anónimo) | Los datos son reales |
| 2. Codificación abierta | La IA lee **todas** las respuestas de cada pregunta y propone un libro de códigos | Así nace un libro de códigos |
| 3. Validación humana | El docente renombra, fusiona, elimina o añade categorías y aprueba | **La IA sugiere; el investigador decide** |
| 4. Clasificación | Cada respuesta recibe sentimiento + categorías del libro + citas literales verificadas | Sentimiento ≠ análisis temático |
| 5. Resultados | Gráficos por pregunta, testimonios por barra, corrección manual y hallazgos con evidencia | Ningún número sin su evidencia |

Además: **modo proyección** (pantalla oscura para el aula), **exportación CSV** (matriz de codificación para Excel/Google Sheets) y una **sesión demo con datos sintéticos** como plan B.

## Arquitectura

```
GitHub ──► Render Web Service (Node 24 + Express)
             ├─ App React (formulario público + panel docente)
             ├─ API REST (envíos, login docente, análisis)
             ├─ OpenAI (solo desde el servidor; la clave nunca llega al navegador)
             └─ SQLite en disco persistente (/var/data/tuvoz.db)
```

- **Sin cuentas extra**: solo GitHub, Render y OpenAI.
- **Seguridad**: panel protegido por contraseña con cookie firmada (`httpOnly`, `sameSite=strict`); cada endpoint docente verifica la sesión en el servidor. El formulario público solo puede **escribir** respuestas, nunca leerlas.
- **Integridad del análisis**: salidas JSON con esquema estricto, categorías restringidas al libro de códigos aprobado, citas verificadas contra el texto original y hallazgos que solo pueden citar respuestas de la sesión.
- **Idempotencia**: si un celular pierde la conexión y reintenta, la participación no se duplica.

## Desarrollo local

Requisitos: Node 22.13+ (recomendado 24).

```bash
npm install
cp .env.example .env        # y completa ADMIN_PASSWORD y SESSION_SECRET
npm run dev                 # web en http://localhost:5173 · API en :4317
```

Para ensayar **sin gastar OpenAI**, deja `AI_MODE=mock` en `.env`: un clasificador local por palabras clave (la interfaz muestra una franja «Modo simulado»). Para probar con OpenAI real: `AI_MODE=openai` y tu `OPENAI_API_KEY`.

Los estudiantes pueden probar desde su celular en la misma red usando la dirección «Network» que imprime Vite.

```bash
npm test          # pruebas de verificación de citas, validación de salidas IA y hallazgos
npm run typecheck
npm run build && npm start   # versión de producción local
```

## Despliegue en Render (paso a paso)

1. **Sube el repositorio a GitHub** (privado o público; `.env` está excluido).
2. En Render: **New → Blueprint** → elige el repositorio. Render lee `render.yaml` y crea:
   - un Web Service `tu-voz-cuenta` (plan *Starter*, no se duerme),
   - un disco persistente de 1 GB en `/var/data` para la base de datos.
3. Render te pedirá los secretos:
   - `OPENAI_API_KEY`: tu clave de OpenAI (platform.openai.com → API keys).
   - `ADMIN_PASSWORD`: la contraseña del panel docente (mínimo 10 caracteres).
   - `SESSION_SECRET` se genera solo.
4. Espera el build (~2 min) y abre `https://<tu-servicio>.onrender.com/admin`.
5. Verifica el modelo: `OPENAI_MODEL` viene como `gpt-5-mini`. Si tu cuenta usa otro modelo con *Structured Outputs*, cámbialo en **Environment** sin tocar código.

> Alternativa manual (sin Blueprint): New → Web Service · Build `npm ci --include=dev && npm run build` · Start `npm start` · Health check `/api/health` · añade un Disk en `/var/data` y las variables de `.env.example` con `DATABASE_PATH=/var/data/tuvoz.db` y `NODE_ENV=production`.

## Guion sugerido para la clase (25–35 min)

1. **Antes (5 min antes de clase)**: entra a `/admin`, crea la sesión y **actívala**. Abre **Proyectar** en el computador del proyector (tecla `F` = pantalla completa).
2. **Recolección (5–7 min)**: proyecta la vista *Participa* (tecla `1`). El contador y los puntos crecen con cada envío. Luego pasa a *Palabras* (`2`): la nube crece en vivo (desde el paso 1 del panel puedes ocultar cualquier palabra o pausar la nube). Pregunta al grupo: *¿la palabra más grande es la idea más importante?* Frecuencia no es significado: por eso codificamos. Cuando llegue el grupo, **cierra la recepción**.
3. **Codificación abierta (3 min)**: en el panel, paso 2 → *Proponer libro de códigos con IA*. Pregunta al grupo: *¿Estas categorías reflejan lo que dijeron?*
4. **Validación (5–8 min)**: paso 3. Fusiona categorías redundantes, renombra, añade lo que el grupo eche en falta. **Aprueba**. Este es el corazón de la clase: la IA no decide.
5. **Clasificación (2 min)**: paso 4 → *Analizar con IA*. La barra de progreso muestra el trabajo real.
6. **Resultados (5–10 min)**: proyecta *Sentimientos* (`3`) y *Categorías* (`4`). Discute por qué la pregunta 2 (beneficios) y la 3 (preocupaciones) no son comparables. Haz clic en una barra en el panel para leer testimonios y **corrige** alguna clasificación en vivo.
7. **Hallazgos (5 min)**: *Generar hallazgos con IA* y proyecta (`5`). Contrástalos con la interpretación del grupo.
8. **Cierre**: exporta el CSV (matriz de codificación) y ábrelo en Google Sheets.

**Plan B**: si responden pocos estudiantes o falla la red, crea una *Sesión demo (datos sintéticos)*: está marcada como tal en todas las pantallas.

**Consejos**: haz un ensayo con 3–5 personas el día anterior; pide a los estudiantes usar datos móviles si el wifi del aula es inestable.

## Datos y privacidad

- No se recogen nombres, correos ni IP como dato de investigación. La IP solo se usa en memoria para limitar abusos y no se guarda.
- Las respuestas se envían a OpenAI únicamente cuando el docente pulsa los botones de análisis.
- Los registros del servidor no incluyen testimonios ni secretos.
- Desde el panel se puede **eliminar** una sesión con todos sus datos (exporta antes el CSV si lo necesitas).

## Estructura

```
server/   API Express, SQLite (node:sqlite), análisis con OpenAI y simulador local
src/      React + Vite: formulario, panel por pasos, proyección, gráficos (Recharts)
shared/   tipos compartidos
docs/     especificación funcional v2
```
