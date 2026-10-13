# Fase 1 — Informe de impacto técnico

Fecha: 2026-10-12 · Rama analizada: `demo-02` (commit `af76e99`)

Este informe es el entregable de la Fase 1 de [task.md](../task.md). Describe cómo funciona hoy
la plataforma en lo que toca a los cambios pedidos, qué componentes hay que modificar y una
propuesta compatible con la arquitectura actual. **No se modificó código de la aplicación en
esta fase.**

---

## 1. Arquitectura actual

| Capa | Ubicación | Notas |
|---|---|---|
| Frontend | `frontend/` — React 18 + Vite + React Router 6 + Tailwind | SPA en Firebase Hosting. Llama al backend con axios ([api.js](../frontend/src/services/api.js)) adjuntando el ID token de Firebase. |
| Backend | `backend/` — Express + Firebase Admin | Desplegado en Render. Capas `routes → controllers → services → repositories`. |
| DI | [container/index.js](../backend/src/container/index.js) | Arma repositorios Firestore o in-memory (tests) y los inyecta en los servicios. |
| Datos | Cloud Firestore | [firestore.rules](../firestore.rules) **deniega todo acceso desde el cliente**: todo pasa por el backend (Admin SDK). |
| Correo | [ResendEmailService.js](../backend/src/services/ResendEmailService.js) | API HTTP de Resend; devuelve el `id` del proveedor. |
| Voz | [AzureSpeechService.js](../backend/src/services/AzureSpeechService.js) + Supabase Storage | TTS con visemas generado al guardar un macrocaso; respaldo con la voz del navegador. |
| Pruebas | Jest (backend, in-memory) · Vitest + Testing Library (frontend) | Línea base: backend **54/54**, frontend **10/10** (ejecutadas el 2026-10-12). |

Montaje de rutas ([app.js](../backend/src/app.js)):

- Públicas: `POST /api/v1/auth/register`, `GET /api/v1/invitations/access`, `POST /api/v1/invitations/access/submit`.
- Autenticadas (`verifyToken` + `checkTenant`): `/auth`, `/events` (rol `company`), `/admin` (rol `admin`), `/macrocasos` (rol `admin`).

## 2. Modelo de datos actual (Firestore)

| Colección | Campos relevantes | Escrita por |
|---|---|---|
| `users` (id = uid) | `role` (`admin`/`company`/`candidate`), `orgId`, `companyName` | `AuthService` |
| `organizations` | `companyName`, `name`, contacto | `AuthService` |
| `events` (+ legado `processes`) | `orgId`, `name`, `position`, `description`, `availableFrom`, `plan: 'A'`, `status` (`ACTIVE`/`PUBLISHED`), `evaluationsPublishedAt`, `moduleB: { macrocase (copia), assignedAt }` | `EventService`, `ReviewService`, `InvitationService` |
| `candidates` | `eventId`, `orgId`, `anonymousCode` (`P-001`…), `nombreCompleto`, `cedula`, `correo`, `fechaHoraCita`, `status` (`INVITED_PENDING`/`INVITATION_SENT`/`EVALUATION_COMPLETED`), `invitationId`, `emailProviderId`, `reviewStatus`, `reviewObservations`, `moduleB: { status, invitationId, invitedAt, submittedAt }` | `CandidateService`, `InvitationService`, `ReviewService` |
| `invitations` | `candidateId`, `eventId`, `orgId`, `module` (`A`/`B`), `tokenHash` (SHA-256), `status` (`ACTIVE`/`COMPLETED`/`EXPIRED`/`CANCELLED`), `availableAt`, `expiresAt`, `submittedAt` | `InvitationService` |
| `evaluationSubmissions` (id = invitationId) | `candidateId`, `eventId`, `orgId`, `module`, `instrumentVersion` (`DEMO_A_V1` / `MACROCASE:<id>`), `answers`, `submittedAt` | `FirestoreInvitationRepository.completeWithSubmission` (transacción) |
| `macroCases` (banco) | `name`, `description`, `introduction` (texto único), `maxCharacters`, `defaultTimeLimit` (s por pregunta), `active`, `questions[{ id, order, text, audioUrl, audioPath, audioSource, ttsText, ttsVoice, visemes, ttsError }]` | `MacrocaseService` |

No existen colecciones de progreso, sesiones, credenciales ni auditoría.

## 3. Tokens de invitación (flujo actual)

1. **Generación** — `InvitationService.publishOne`: `crypto.randomBytes(32).toString('base64url')` (43 caracteres). Se guarda solo `sha256(token)`; si había una invitación `ACTIVE` del mismo candidato/evento/módulo, se cancela. El token en claro va únicamente en la URL del correo (`/evaluation/access?token=…`).
2. **Vigencia** — Módulo A: disponible desde `fechaHoraCita`, expira 24 h después. Módulo B: disponible de inmediato, expira a los 3 días.
3. **Validación** — `GET /invitations/access?token=` → `validateAccess` devuelve un estado (`INVALID`, `NOT_YET_AVAILABLE`, `VALID`, `COMPLETED`, `EXPIRED`, `CANCELLED`) y, para el Módulo B, el macrocaso público (`publicMacrocase`, que omite `audioPath` y campos internos).
4. **Consumo** — `POST /invitations/access/submit` → `submitEvaluation` → transacción que crea `evaluationSubmissions/{invitationId}`, marca la invitación `COMPLETED` y actualiza el candidato. Un segundo envío devuelve `alreadySubmitted: true` (no se duplica).

El token **es a la vez** el enlace de citación y la credencial de acceso. Esa es justamente la
dependencia que hay que separar en la modalidad presencial.

## 4. Módulo B actual

- **Asignación**: al primer `POST /events/:id/module-b/invitations`, `MacrocaseService.pickSnapshotForModuleB` elige al azar un macrocaso activo y **copia** su contenido en `event.moduleB.macrocase`. Todos los candidatos del evento reciben esa copia; editar el banco después no la altera.
- **Requisitos**: el evento debe tener los resultados del Módulo A publicados y el candidato debe estar `REVIEWED` sin Módulo B completado.
- **Flujo en el navegador** ([MacrocaseModule.jsx](../frontend/src/components/evaluation/macrocase/MacrocaseModule.jsx)): `intro` → `reading` (texto completo; el botón se habilita al llegar al final) → `questions` (el avatar lee cada pregunta; una respuesta escrita por pregunta, solo hacia adelante, temporizador opcional por pregunta) → `ConfirmPanel` → envío.
- **Avatar** ([TalkingAvatarView.jsx](../frontend/src/components/avatar/TalkingAvatarView.jsx)): `speak()` reproduce el audio con visemas o recurre a la voz del navegador; `stop()` corta lo que suene; cada llamada a `speak()` invalida la anterior (`speakIdRef`), así que hoy ya no se superponen audios. Ya existen "Escuchar de nuevo", aviso de autoplay bloqueado y aviso de "sin voz en español".
- **Narración del caso**: **no existe**. Solo se narran las preguntas; el texto del caso se lee en pantalla.
- **Persistencia**: **no existe guardado progresivo**. Las respuestas viven en el estado de React; al recargar se pierden y el flujo reinicia en `intro`, con lo que el candidato **vuelve a ver el caso completo** (contradice la regla "no podrás volver a ver el caso").
- **Revisión**: `ReviewService.moduleBDetail` muestra al administrador `answers[{ questionId, question, text, timedOut }]` bajo un `anonymousId`. La empresa no ve las respuestas.
- **Vista previa admin**: `MacrocasePreviewFlow` reutiliza `MacrocaseModule` sin enviar nada.

## 5. Permisos actuales

- `checkPersistedRole` lee el rol desde `users/{uid}` en el servidor (el cliente no lo controla) y fija `req.user.orgId`.
- **Empresa** (`company`): CRUD de sus eventos y candidatos, publicar invitaciones del Módulo A, enviar el Módulo B. El aislamiento entre organizaciones lo aplica `EventService.getEvent` (404 si `event.orgId !== req.user.orgId`), y todo lo demás pasa por ahí.
- **Administrador** (`admin`): banco de macrocasos, revisión ética anónima de todos los procesos, publicación de resultados.
- **No hay sub-roles dentro de una organización**: todos los usuarios `company` de una organización tienen los mismos permisos. No existe un rol "aplicador" o "supervisor".
- `TenantService` es un stub sin implementar y no se usa.

## 6. Hallazgos que condicionan el diseño

1. **Sin limitación de intentos** en ningún endpoint (no hay `express-rate-limit` ni equivalente). La Fase 7 lo necesita. En un aula todas las computadoras suelen salir por **la misma IP pública** (NAT), así que un límite solo por IP bloquearía al grupo entero.
2. **El token viaja en la query string** (`GET /access?token=`). Para los códigos presenciales conviene `POST`, para que no queden en URLs, historial ni logs.
3. `errorHandler` hace `console.error(err)` del error completo. Habrá que garantizar que ningún error lleve códigos de acceso.
4. **Sin biblioteca PDF** en backend ni frontend.
5. Solo se guarda `emailProviderId` del correo; no hay consulta del estado de entrega en Resend.
6. `instrumentVersion` del Módulo B es `MACROCASE:<id>`, que identifica el macrocaso pero no la versión de su contenido. Como el contenido está copiado en el evento, la trazabilidad real la da esa copia. Con el nuevo modelo por secciones conviene agregar `schemaVersion`.
7. `anonymousCode` se calcula como `count + 1`, así que dos altas simultáneas podrían colisionar. Es un problema menor, pero importa para cargas en lote de 20 candidatos (Fase 9).
8. [firestore.indexes.json](../firestore.indexes.json) está desactualizado (`processes`, `enrollments`). Las consultas actuales son de igualdad simple y no lo necesitan.
9. `GET /events/:id` devuelve el evento completo a la empresa, incluida la copia del macrocaso con sus preguntas. No incluye rúbricas porque hoy no existen, pero si se agregan campos internos al macrocaso habrá que filtrarlos ahí también.

## 7. Componentes afectados por fase

### Fase 2 — Módulo B por secciones

| Archivo | Cambio |
|---|---|
| `backend/src/services/MacrocaseService.js` | Normalizar/validar `sections[{ id, order, title, narrative, narrativeAudio…, questions[] }]`; generar voz también para la narrativa de cada sección; snapshot con `schemaVersion: 2`; adaptador de macrocasos antiguos (`introduction` + `questions` → 1 sección). |
| `backend/src/services/InvitationService.js` | `publicMacrocase` por secciones; `checkMacrocaseAnswers` por sección; `instrumentVersion` con versión de esquema; nuevos métodos de progreso. |
| `backend/src/repositories/*InvitationRepository.js` | `saveProgress` / `getProgress` (nueva colección `evaluationProgress/{invitationId}`) con regla solo-hacia-adelante validada en el servidor. |
| `backend/src/routes/invitation.routes.js`, `validators/event.schema.js`, `controllers/invitation.controller.js` | Endpoints de progreso (`GET/PUT /invitations/access/progress`) y esquema de respuestas con `sectionId`. |
| `backend/src/services/ReviewService.js` | Mostrar respuestas agrupadas por sección (compatible con envíos antiguos sin `sectionId`). |
| `frontend/src/components/evaluation/macrocase/*` | Nuevo flujo `intro → [sección i: narrativa → preguntas]* → resumen → envío`; barra de progreso por sección; reanudación desde el progreso guardado. `MacrocaseReading` y `MacrocaseQuestions` se reutilizan por sección. |
| `frontend/src/components/avatar/TalkingAvatarView.jsx` | Sin cambios de API (ya ofrece `speak`/`stop`/`whenReady` y evita superposición). Se usará también para la narrativa. |
| `frontend/src/pages/AdminMacrocasesPage.jsx` | Editor de secciones (narrativa + preguntas por sección) en lugar de `introduction` + lista plana. |
| `frontend/src/pages/AdminParticipantReviewPage.jsx` | Agrupar respuestas por sección. |
| Pruebas | `MacrocaseService.test.js`, `InvitationService.moduleB.test.js`, `MacrocaseModule.test.jsx`, `EvaluationAccessPage.test.jsx`, `macrocaseFixture.js`. |

### Fases 3 a 8 — Modalidad presencial

| Área | Archivos existentes a modificar | Nuevos |
|---|---|---|
| Configuración del evento | `EventService.js`, `validators/event.schema.js`, `NewEventPage.jsx`, `EventDetailPage.jsx` | — |
| Citaciones | `InvitationService.js` (rama presencial sin token), `ResendEmailService.js` (plantilla `sendCitation` sin enlace ni código) | Estado de citación separado: `candidate.citation{ status, sentAt, providerId, lastEvent }` |
| Credenciales | `container/index.js`, `routes/event.routes.js`, `utils/constants.js` | `AccessCredentialService`, `I/Firestore/InMemoryAccessCredentialRepository`, colección `accessCredentials`, colección `auditLog` |
| PDF | `backend/package.json` (dependencia PDF) | `PrintableService` (tarjetas y lista de asistencia) |
| Panel del aplicador | `EventDetailPage.jsx` (pestaña/acción), `eventService.js` | `OnsiteApplicationPage.jsx`, endpoints `/events/:id/onsite/*` |
| Acceso del candidato | `app.js` (ruta pública), `AppRouter.jsx`, `EvaluationAccessPage.jsx` (reutilizar el runner) | `OnsiteAccessPage.jsx` (`/presencial`), middleware de límite de intentos, colección `evaluationSessions` |
| Recuperación | `AccessCredentialService` | Revocar/reemitir; invalidar sesión previa; registro en `auditLog` |

## 8. Propuesta de implementación

### 8.1 Módulo B: modelo de contenido (versión 2)

```js
// macroCases/{id} y event.moduleB.macrocase (copia)
{
  schemaVersion: 2,
  name, description, maxCharacters, defaultTimeLimit,
  instructions,                  // texto de la pantalla de introducción
  sections: [{
    id, order, title,
    narrative,                   // texto narrativo de la sección
    narrativeAudio: { audioUrl, audioPath, audioSource, ttsText, ttsVoice, visemes, ttsError },
    questions: [{ id, order, text, audioUrl, audioPath, audioSource, ttsText, ttsVoice, visemes, ttsError }],
  }],
}
```

- **Compatibilidad**: una función `toSectionedMacrocase()` en el backend convierte en lectura los documentos sin `schemaVersion` (`introduction` → `sections[0].narrative`, `questions` → `sections[0].questions`). No hace falta migrar datos, y las copias ya asignadas a eventos siguen funcionando.
- **Al candidato** solo llega el contenido público (sin `audioPath`, `ttsText` ni `ttsError`). Recomiendo que el servidor entregue **solo la sección en curso**, según el progreso guardado. Así la regla de no retroceder se aplica en el servidor y no solo en la interfaz, y al recargar no reaparece texto que ya no corresponde.
- **Envío**: `answers[{ sectionId, questionId, question, text, timedOut? }]` con `instrumentVersion: 'MACROCASE:<id>:v2'`. La revisión admin agrupa por `sectionId` y trata como "sección única" los envíos antiguos que no lo tienen.

### 8.2 Módulo B: progreso

- Colección `evaluationProgress/{invitationId}`: `{ stage: { sectionIndex, step: 'narrative'|'questions' }, answers: { [questionId]: { text, lockedAt?, timedOut? } }, updatedAt }`.
- Guardado automático del borrador (con debounce) y "bloqueo" de cada respuesta al continuar. El servidor rechaza cambios en respuestas bloqueadas o en secciones ya superadas.
- El envío final sigue usando la transacción existente (`completeWithSubmission`), que ya impide un segundo envío.

### 8.3 Modalidad presencial

- **Evento**: `modality: 'online' | 'onsite'` (sin campo = `online`, lo que mantiene la compatibilidad), más `onsite: { venue, room, date, startTime, endTime, instructions }` y `modules: ['A'] | ['A','B'] | ['B']`, validados con Zod.
- **Citación**: correo propio sin enlace ni código. Su estado (`citation.status`) es independiente del estado de acceso (`accessCredentials.status`) y del de evaluación (`candidate.status`).
- **Credencial**:
  - Código de 10 caracteres de un alfabeto de 31 símbolos sin ambiguos (`23456789ABCDEFGHJKMNPQRSTUVWXYZ`), mostrado como `XXXX-XXXX-XX`. Son unos 49 bits de entropía, generados con `crypto.randomInt`.
  - Se almacena **HMAC-SHA256 con un secreto del servidor** (`ACCESS_CODE_PEPPER`), no un SHA-256 simple. Con tan pocos bits, un SHA-256 sin secreto se podría romper por fuerza bruta si se filtrara la base de datos.
  - Documento: `{ candidateId, eventId, orgId, module, codeHash, status: GENERATED|ENABLED|USED|REVOKED|EXPIRED, expiresAt, createdBy/At, enabledBy/At, usedAt, revokedBy/At, replacedBy }`.
  - Unicidad por asignación: al emitir, una transacción revoca la credencial anterior de la misma asignación (`candidateId+eventId+module`).
- **Lote e impresión**: `POST /events/:id/onsite/credentials` genera los códigos para los candidatos seleccionados que **aún no tienen credencial vigente**. Una repetición accidental no regenera nada; reemitir es una operación individual explícita. La misma respuesta devuelve el PDF de tarjetas generado en memoria: los códigos no se persisten en claro, no se guarda el PDF y no se registran en logs. La lista de asistencia es otro PDF sin códigos que se puede descargar cuantas veces haga falta.
- **Acceso del candidato**: `POST /api/v1/onsite/access { code }` (ruta pública con límite de intentos). Si la credencial está `ENABLED` y vigente, en una transacción pasa a `USED` y se crea una **sesión de evaluación** con un token opaco de 32 bytes, igual al de las invitaciones actuales. Así el runner existente (`LikertQuestionnaire` / `MacrocaseEvaluation`) y los endpoints de progreso y envío se reutilizan con un cambio mínimo. La sesión se guarda en `sessionStorage`, se cierra tras el envío y la pantalla vuelve a `/presencial`.
- **Límite de intentos**: un limitador en memoria por IP con umbral holgado (por el NAT del aula), un contador global de fallos por ventana de tiempo con bloqueo temporal y una espera progresiva. Render free corre una sola instancia, así que un limitador en memoria es suficiente para este alcance.
- **Recuperación**: el supervisor revoca la credencial (lo que invalida la sesión activa) y emite otra para la **misma** asignación. La nueva sesión retoma `evaluationProgress`, de modo que no se pierden respuestas ni se duplica la evaluación. Solo puede haber una sesión activa por asignación.
- **Auditoría**: colección `auditLog` `{ orgId, eventId, actorUid, action, targetCandidateId, credentialId, at }`, sin códigos.

## 9. Compatibilidad y riesgos

| Riesgo | Mitigación |
|---|---|
| Macrocasos del banco y copias en eventos con el formato antiguo | Adaptador en lectura; no se reescriben documentos existentes. |
| Envíos antiguos del Módulo B sin `sectionId` | La revisión los muestra como una sección única. |
| Eventos sin `modality` | Se tratan como `online`; el flujo por correo no cambia. |
| Regresión en el flujo por enlace | Se mantienen `GET /access` y `POST /access/submit`; las pruebas actuales siguen como red de seguridad. |
| Filtración de códigos | HMAC con secreto del servidor, `POST` en lugar de query string, sin logs y sin PDF persistido. |
| Bloqueo de un aula completa por el límite de intentos | Límite por IP holgado combinado con un contador global y espera progresiva. |
| Permisos de aplicador | Hoy cualquier usuario `company` de la organización podría operar (ver decisión D9). |

## 10. Decisiones pendientes de validación

Las decisiones marcadas con ✅ las resuelve el propio `task.md` en sus listas de tareas; conviene
igualmente que la cliente las confirme.

| # | Decisión | Estado / recomendación | ¿Bloquea? |
|---|---|---|---|
| D1 | ¿Una o varias preguntas por sección? | ✅ La 2.1 pide "una o varias". El modelo admite N. | No |
| D2 | ¿Retroceder y modificar respuestas? | ✅ La 2.2 pide "impedir retroceder o corregir". | No |
| D3 | ¿Narración obligatoria u opcional? | ✅ La 2.3 pide poder leer sin escuchar toda la narración, así que es opcional. | No |
| D4 | ¿La narrativa de la sección sigue visible mientras se responden sus preguntas? | Hoy el caso se oculta al pasar a las preguntas. **Hay que confirmarlo.** | **Fase 2** |
| D5 | ¿Se mantiene el límite de tiempo por pregunta (`defaultTimeLimit`) en el modelo por secciones? | Recomiendo mantenerlo por pregunta. | **Fase 2** |
| D6 | ¿Cuánto tiempo permanecen habilitadas las credenciales? | Propuesta: válidas hasta el fin de la jornada de la cita; habilitación con duración configurable. | Fase 4 |
| D7 | ¿Pueden cambiar de computadora? | Propuesta: solo mediante revocación y reemisión por el supervisor. | Fase 8 |
| D8 | ¿El supervisor puede pausar una evaluación? | Propuesta: no en este incremento; la revocación y reemisión cubre los incidentes. | Fase 8 |
| D9 | ¿Quién puede operar la aplicación presencial? | Hoy todos los usuarios `company` de la organización son equivalentes. Opciones: (a) cualquier usuario `company`; (b) nuevo permiso `onsiteOperator` por usuario. | Fase 6 |
| D10 | ¿Cómo se manejan ausentes o reprogramados? | Propuesta: el ausente conserva su credencial `GENERATED` hasta que expire; la reprogramación revoca y reemite. | Fase 6 |
| D11 | ¿Los módulos A y B en citas presenciales separadas? | Afecta al modelo `modules` y a las citaciones. Hoy el B exige el A publicado y revisado. | Fase 3 |
| D12 | ¿PDF generado en el servidor o en el navegador? | Recomiendo el servidor (por ejemplo `pdfkit`), en la misma respuesta de emisión y sin persistirlo. | Fase 5 |

## 11. Pruebas previstas por fase

- **Fase 2**: unitarias de normalización y adaptador de secciones, `checkMacrocaseAnswers` por secciones, progreso solo hacia adelante y rechazo de un segundo envío (Jest, in-memory); flujo de componentes por secciones, reanudación tras remontar y control de audio (Vitest); prueba manual en el navegador con `preview`.
- **Fases 3 a 8**: unitarias de generación y hash de códigos, transiciones de estado, revocación y reemisión, aislamiento entre organizaciones y límite de intentos; supertest sobre `createApp(createContainer('memory'))` para los permisos en el backend.
- **Fase 9**: el guion completo de la sección 9 de `task.md`.
