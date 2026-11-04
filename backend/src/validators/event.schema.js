const { z } = require('zod');

const candidateSchema = z.object({
  nombreCompleto: z.string().trim().min(2).max(120),
  cedula: z.string().trim().min(3).max(40),
  correo: z.string().trim().email(),
}).strict();

// Onsite appointment: where and when the candidates must show up.
const citationSchema = z.object({
  sede: z.string().trim().min(2, 'Indica la sede.').max(160),
  ubicacion: z.string().trim().min(1, 'Indica la ubicación dentro de la sede (aula, sala, piso…).').max(160),
  fechaHoraInicio: z.string().datetime(),
  fechaHoraFin: z.string().datetime(),
  // Minutes from the start during which the access codes let candidates begin.
  ventanaInicioMinutos: z.number().int().min(5, 'La ventana de inicio debe ser de al menos 5 minutos.')
    .max(240, 'La ventana de inicio no puede superar 240 minutos.').optional(),
  indicaciones: z.string().trim().max(1000).optional(),
}).strict().refine((data) => new Date(data.fechaHoraFin) > new Date(data.fechaHoraInicio), {
  path: ['fechaHoraFin'],
  message: 'La hora de finalización debe ser posterior a la de inicio.',
}).refine((data) => data.ventanaInicioMinutos === undefined
  || new Date(data.fechaHoraInicio).getTime() + data.ventanaInicioMinutos * 60 * 1000 <= new Date(data.fechaHoraFin).getTime(), {
  path: ['ventanaInicioMinutos'],
  message: 'La ventana de inicio no puede terminar después de la hora de finalización.',
});

const eventBase = {
  nombre: z.string().trim().min(3).max(160),
  puesto: z.string().trim().min(2).max(120),
  descripcion: z.string().trim().max(600).optional(),
  // Module A always applies; Module B is optional (it still requires
  // Module A to be reviewed and published first).
  incluirModuloB: z.boolean().optional().default(true),
};

// `virtual`: candidates get a personal link by e-mail (the original flow,
// also the default for clients that do not send `modalidad`).
// `presencial`: they get a citation to a venue; access is handed out there.
const eventSchema = z.preprocess(
  (body) => (body && typeof body === 'object' && body.modalidad === undefined ? { ...body, modalidad: 'virtual' } : body),
  z.discriminatedUnion('modalidad', [
    z.object({ ...eventBase, modalidad: z.literal('virtual'), fechaHoraHabilitacion: z.string().datetime() }).strict(),
    z.object({ ...eventBase, modalidad: z.literal('presencial'), presencial: citationSchema }).strict(),
  ]),
);

const reviewSchema = z.object({
  observations: z.string().trim().max(2000).optional().default(''),
  reviewed: z.boolean().optional().default(false),
}).strict();

const DEMO_QUESTION_IDS = ['demo-a-1', 'demo-a-2', 'demo-a-3', 'demo-a-4'];
const accessToken = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
// Module A sends `answers` (Likert). Module B answers are saved stage by
// stage (`macrocaseActionSchema`), so its final submission only confirms
// them with `finalize: true`. The service checks which one the invitation
// expects.
const submissionSchema = z.object({
  token: accessToken,
  answers: z.array(z.object({
    questionId: z.enum(DEMO_QUESTION_IDS),
    value: z.number().int().min(1).max(5),
  }).strict()).length(DEMO_QUESTION_IDS.length).optional(),
  finalize: z.literal(true).optional(),
}).strict().superRefine((data, context) => {
  if (Boolean(data.answers) === Boolean(data.finalize)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['answers'], message: 'Envía las respuestas de una sola evaluación.' });
    return;
  }
  if (data.answers && new Set(data.answers.map((answer) => answer.questionId)).size !== DEMO_QUESTION_IDS.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['answers'], message: 'Cada pregunta debe responderse una sola vez.' });
  }
});

// `citacion`: only for onsite events, the appointment of the Module B session.
const moduleBInvitationSchema = z.object({
  candidateIds: z.array(z.string().min(1).max(120)).min(1, 'Selecciona al menos un candidato.').max(500),
  citacion: citationSchema.optional(),
}).strict();

// Onsite access credentials: issue codes for a module, revoke / reissue one.
// `papel`: paper size of the printable cards PDF.
const paperSize = z.enum(['CARTA', 'A4']).optional().default('CARTA');

const credentialBatchSchema = z.object({
  modulo: z.enum(['A', 'B']),
  candidateIds: z.array(z.string().min(1).max(120)).min(1, 'Selecciona al menos un candidato.').max(500),
  papel: paperSize,
}).strict();

const credentialActionSchema = z.object({
  motivo: z.string().trim().max(300).optional(),
  papel: paperSize,
}).strict();

const attendanceQuerySchema = z.object({
  modulo: z.enum(['A', 'B']).optional().default('A'),
  papel: paperSize,
}).strict();

// Applicator panel.
const onsiteRosterQuerySchema = z.object({
  modulo: z.enum(['A', 'B']).optional().default('A'),
}).strict();

const attendanceSchema = z.object({
  modulo: z.enum(['A', 'B']),
  candidateId: z.string().min(1).max(120),
  presente: z.boolean(),
}).strict();

// Candidate login at the venue: only the code (format checked by the service).
const onsiteLoginSchema = z.object({
  codigo: z.string().max(32),
}).strict();

const macrocaseStageSchema = z.object({ token: accessToken }).strict();

const stageId = z.string().min(1).max(120);
// `timedOut`: the question's time ran out and the answer goes as it was (it
// may be empty); the service only accepts it once the timer really expired.
const macrocaseActionSchema = z.object({
  token: accessToken,
  action: z.discriminatedUnion('type', [
    z.object({ type: z.literal('START') }).strict(),
    z.object({ type: z.literal('FINISH_NARRATIVE'), sectionId: stageId }).strict(),
    z.object({ type: z.literal('START_TIMER'), questionId: stageId }).strict(),
    z.object({ type: z.literal('SAVE_DRAFT'), questionId: stageId, text: z.string().max(5000) }).strict(),
    z.object({
      type: z.literal('ANSWER'), questionId: stageId, text: z.string().max(5000), timedOut: z.boolean().optional(),
    }).strict(),
  ]),
}).strict();

module.exports = {
  candidateSchema,
  citationSchema,
  eventSchema,
  reviewSchema,
  submissionSchema,
  moduleBInvitationSchema,
  macrocaseStageSchema,
  macrocaseActionSchema,
  credentialBatchSchema,
  credentialActionSchema,
  attendanceQuerySchema,
  onsiteRosterQuerySchema,
  attendanceSchema,
  onsiteLoginSchema,
};
