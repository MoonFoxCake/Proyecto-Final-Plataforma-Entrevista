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

const DEMO_QUESTION_IDS = ['demo-a-1', 'demo-a-2', 'demo-a-3', 'demo-a-4'];
const submissionSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  answers: z.array(z.object({
    questionId: z.enum(DEMO_QUESTION_IDS),
    value: z.number().int().min(1).max(5),
  }).strict()).length(DEMO_QUESTION_IDS.length),
}).strict().superRefine((data, context) => {
  const ids = new Set(data.answers.map((answer) => answer.questionId));
  if (ids.size !== DEMO_QUESTION_IDS.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['answers'], message: 'Cada pregunta debe responderse una sola vez.' });
  }
});

module.exports = { candidateSchema, eventSchema, submissionSchema };
