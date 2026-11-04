const {
  submissionSchema, macrocaseActionSchema, macrocaseStageSchema, eventSchema, moduleBInvitationSchema,
} = require('../../../src/validators/event.schema');

const token = 'a'.repeat(43);

test('a Module B submission only confirms the saved answers', () => {
  expect(submissionSchema.safeParse({ token, finalize: true }).success).toBe(true);
  expect(submissionSchema.safeParse({ token }).success).toBe(false);
  expect(submissionSchema.safeParse({ token, finalize: false }).success).toBe(false);
  // Answers are no longer accepted from the browser in one block.
  expect(submissionSchema.safeParse({ token, finalize: true, macrocaseAnswers: [{ questionId: 'q1', text: 'x' }] }).success).toBe(false);
});

test('macrocase actions are a closed set with the fields each one needs', () => {
  const ok = (action) => macrocaseActionSchema.safeParse({ token, action }).success;
  expect(ok({ type: 'START' })).toBe(true);
  expect(ok({ type: 'FINISH_NARRATIVE', sectionId: 's1' })).toBe(true);
  expect(ok({ type: 'START_TIMER', questionId: 'q1' })).toBe(true);
  expect(ok({ type: 'SAVE_DRAFT', questionId: 'q1', text: '' })).toBe(true);
  expect(ok({ type: 'ANSWER', questionId: 'q1', text: 'Respuesta', timedOut: true })).toBe(true);

  expect(ok({ type: 'GO_BACK' })).toBe(false);
  expect(ok({ type: 'FINISH_NARRATIVE' })).toBe(false);
  expect(ok({ type: 'ANSWER', questionId: 'q1' })).toBe(false);
  expect(ok({ type: 'ANSWER', questionId: 'q1', text: 'x', sectionIndex: 0 })).toBe(false);
  expect(macrocaseActionSchema.safeParse({ token: 'corto', action: { type: 'START' } }).success).toBe(false);
});

test('the stage request only takes the token', () => {
  expect(macrocaseStageSchema.safeParse({ token }).success).toBe(true);
  expect(macrocaseStageSchema.safeParse({ token, step: 'review' }).success).toBe(false);
});

describe('event modality', () => {
  const base = { nombre: 'Concurso Demo', puesto: 'Analista' };
  const session = {
    sede: 'Campus Central', ubicacion: 'Aula 204', fechaHoraInicio: '2026-11-05T14:00:00.000Z', fechaHoraFin: '2026-11-05T16:00:00.000Z',
  };

  test('an event without modality is virtual, as before, and includes Module B by default', () => {
    const result = eventSchema.safeParse({ ...base, fechaHoraHabilitacion: '2026-10-10T15:00:00.000Z' });
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ modalidad: 'virtual', incluirModuloB: true });
  });

  test('a virtual event needs its availability date', () => {
    expect(eventSchema.safeParse({ ...base, modalidad: 'virtual' }).success).toBe(false);
  });

  test('an onsite event needs venue, location and a session that ends after it starts', () => {
    expect(eventSchema.safeParse({ ...base, modalidad: 'presencial', presencial: session }).success).toBe(true);
    expect(eventSchema.safeParse({ ...base, modalidad: 'presencial' }).success).toBe(false);
    expect(eventSchema.safeParse({ ...base, modalidad: 'presencial', presencial: { ...session, ubicacion: '' } }).success).toBe(false);
    expect(eventSchema.safeParse({ ...base, modalidad: 'presencial', presencial: { ...session, sede: undefined } }).success).toBe(false);

    const backwards = eventSchema.safeParse({ ...base, modalidad: 'presencial', presencial: { ...session, fechaHoraFin: '2026-11-05T13:00:00.000Z' } });
    expect(backwards.success).toBe(false);
    expect(JSON.stringify(backwards.error.flatten())).toContain('posterior');
  });

  test('the entry window: optional, 5 to 240 minutes, and it cannot end after the session', () => {
    const withWindow = (ventanaInicioMinutos) => eventSchema.safeParse({ ...base, modalidad: 'presencial', presencial: { ...session, ventanaInicioMinutos } });
    expect(withWindow(30).success).toBe(true);
    expect(withWindow(120).success).toBe(true);
    expect(withWindow(4).success).toBe(false);
    expect(withWindow(15.5).success).toBe(false);
    const tooLong = withWindow(121);
    expect(tooLong.success).toBe(false);
    expect(JSON.stringify(tooLong.error.flatten())).toContain('hora de finalización');
  });

  test('fields of the other modality are rejected', () => {
    expect(eventSchema.safeParse({ ...base, modalidad: 'presencial', presencial: session, fechaHoraHabilitacion: '2026-10-10T15:00:00.000Z' }).success).toBe(false);
    expect(eventSchema.safeParse({ ...base, modalidad: 'remota', fechaHoraHabilitacion: '2026-10-10T15:00:00.000Z' }).success).toBe(false);
  });

  test('a Module B citation carries its own session', () => {
    expect(moduleBInvitationSchema.safeParse({ candidateIds: ['c1'], citacion: session }).success).toBe(true);
    expect(moduleBInvitationSchema.safeParse({ candidateIds: ['c1'], citacion: { ...session, fechaHoraInicio: 'mañana' } }).success).toBe(false);
  });
});
