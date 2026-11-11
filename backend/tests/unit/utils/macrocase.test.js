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
describe('multiple choice', () => {
  const options = ['Pedir ayuda', 'Esperar', 'Denunciar', 'Ignorar'].map((text, index) => ({ id: `o${index + 1}`, text }));
  const choice = { name: 'Caso', defaultTimeLimit: 0, sections: [{ id: 's1', title: 'Sección', narrative: 'Texto', questions: [{ id: 'q1', text: '¿Qué haría?', options }, { id: 'q2', text: '¿Y luego?', options }] }] };
  const atQuestion = (seed) => ({ step: 'question', sectionIndex: 0, questionIndex: 0, answers: [], draft: null, timerStartedAt: null, seed });

  test('START gives each candidate their own seed', () => {
    const first = applyAction(choice, null, { type: 'START' });
    const second = applyAction(choice, null, { type: 'START' });
    expect(first.seed).toMatch(/^[0-9a-f]{24}$/);
    expect(first.seed).not.toBe(second.seed);
  });

  test('shows the four options in a stable order per candidate that varies between candidates', () => {
    const order = (seed) => stageView(choice, atQuestion(seed)).question.options.map((option) => option.id).join();
    expect(stageView(choice, atQuestion('a')).question.options).toHaveLength(4);
    expect(order('a')).toBe(order('a'));
    const orders = new Set(Array.from({ length: 30 }, (_, index) => order(`seed-${index}`)));
    expect(orders.size).toBeGreaterThan(5);
    expect(stageView(choice, atQuestion('a')).macrocase.responseType).toBe('choice');
  });

  test('accepts only an option of the question and stores its text', () => {
    expect(() => applyAction(choice, atQuestion('a'), { type: 'SAVE_DRAFT', questionId: 'q1', value: 3 })).toThrow('Selecciona una de las opciones');
    expect(() => applyAction(choice, atQuestion('a'), { type: 'ANSWER', questionId: 'q1', value: 'otra' })).toThrow('Selecciona una de las opciones');
    let state = applyAction(choice, atQuestion('a'), { type: 'ANSWER', questionId: 'q1', value: 'o3' });
    state = applyAction(choice, state, { type: 'ANSWER', questionId: 'q2', value: 'o1' });
    expect(finalAnswers(choice, state)).toEqual([
      expect.objectContaining({ questionId: 'q1', value: 'o3', answerLabel: 'Denunciar', options: ['Pedir ayuda', 'Esperar', 'Denunciar', 'Ignorar'] }),
      expect.objectContaining({ questionId: 'q2', value: 'o1', answerLabel: 'Pedir ayuda' }),
    ]);
  });
});

test('rejects invalid stored numeric values and never treats a skipped choice as neutral', () => {
  expect(() => finalAnswers(macrocase, { ...progress, step: 'review', answers: [{ questionId: 'q1', value: 0 }] })).toThrow('no es válida');
  expect(finalAnswers(macrocase, { ...progress, step: 'review', answers: [{ questionId: 'q1', value: null, timedOut: true }] })[0]).toMatchObject({ value: null, timedOut: true });
});
