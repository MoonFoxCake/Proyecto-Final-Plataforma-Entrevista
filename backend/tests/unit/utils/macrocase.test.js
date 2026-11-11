const { applyAction, stageView, finalAnswers } = require('../../../src/utils/macrocase');
const macrocase = { name: 'Caso', defaultTimeLimit: 0, sections: [{ id: 's1', title: 'Sección', questions: [{ id: 'q1', text: 'Pediría ayuda.' }] }] };
const progress = { step: 'question', sectionIndex: 0, questionIndex: 0, answers: [], draft: { questionId: 'q1', text: 'Borrador escrito anterior' }, timerStartedAt: null };
test('does not invent a numeric selection from a legacy written draft', () => {
  expect(stageView(macrocase, progress).draft).toBeNull();
  const saved = applyAction(macrocase, progress, { type: 'SAVE_DRAFT', questionId: 'q1', value: 1 });
  expect(stageView(macrocase, saved).draft).toBe(1);
});
test('keeps already locked written answers without converting them to a Likert choice', () => {
  const saved = { ...progress, step: 'review', answers: [{ questionId: 'q1', text: 'Respuesta histórica.' }] };
  expect(finalAnswers(macrocase, saved)[0]).toMatchObject({ text: 'Respuesta histórica.' });
  expect(finalAnswers(macrocase, saved)[0]).not.toHaveProperty('value');
});
test('rejects invalid stored numeric values and never treats a skipped choice as neutral', () => {
  expect(() => finalAnswers(macrocase, { ...progress, step: 'review', answers: [{ questionId: 'q1', value: 0 }] })).toThrow('no es válida');
  expect(finalAnswers(macrocase, { ...progress, step: 'review', answers: [{ questionId: 'q1', value: null, timedOut: true }] })[0]).toMatchObject({ value: null, timedOut: true });
});
