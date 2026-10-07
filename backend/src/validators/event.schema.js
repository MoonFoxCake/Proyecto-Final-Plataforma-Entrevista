const { z } = require('zod');

const candidateSchema = z.object({
  nombreCompleto: z.string().trim().min(2).max(120),
  cedula: z.string().trim().min(3).max(40),
  correo: z.string().trim().email(),
}).strict();

const eventSchema = z.object({
  nombre: z.string().trim().min(3).max(160),
  puesto: z.string().trim().min(2).max(120),
  descripcion: z.string().trim().max(600).optional(),
  fechaHoraHabilitacion: z.string().datetime(),
}).strict();

const reviewSchema = z.object({
  observations: z.string().trim().max(2000).optional().default(''),
  reviewed: z.boolean().optional().default(false),
}).strict();

const DEMO_QUESTION_IDS = ['demo-a-1', 'demo-a-2', 'demo-a-3', 'demo-a-4'];
// Module A sends `answers` (Likert); Module B sends `macrocaseAnswers` (always
// written text). The service checks which one the invitation expects and
// validates Module B answers against the event's macrocase.
const submissionSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  answers: z.array(z.object({
    questionId: z.enum(DEMO_QUESTION_IDS),
    value: z.number().int().min(1).max(5),
  }).strict()).length(DEMO_QUESTION_IDS.length).optional(),
  // `timedOut`: the question's time ran out and the answer was sent as it
  // was (it may be empty). The service rejects empty answers otherwise.
  macrocaseAnswers: z.array(z.object({
    questionId: z.string().min(1).max(120),
    text: z.string().trim().max(5000),
    timedOut: z.boolean().optional(),
  }).strict()).min(1).max(50).optional(),
}).strict().superRefine((data, context) => {
  if (Boolean(data.answers) === Boolean(data.macrocaseAnswers)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['answers'], message: 'Envía las respuestas de un solo módulo.' });
    return;
  }
  if (data.answers && new Set(data.answers.map((answer) => answer.questionId)).size !== DEMO_QUESTION_IDS.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['answers'], message: 'Cada pregunta debe responderse una sola vez.' });
  }
});

const moduleBInvitationSchema = z.object({
  candidateIds: z.array(z.string().min(1).max(120)).min(1, 'Selecciona al menos un candidato.').max(500),
}).strict();

module.exports = { candidateSchema, eventSchema, reviewSchema, submissionSchema, moduleBInvitationSchema };
