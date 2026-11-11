import { act, fireEvent, render, screen } from '@testing-library/react';
import { MicrocaseQuestionnaire } from './MicrocaseQuestionnaire.jsx';
import { advanceTimed, finalizeEvaluation, getTimedState } from '../../services/invitationService.js';

vi.mock('../../services/invitationService.js', () => ({ advanceTimed: vi.fn(), finalizeEvaluation: vi.fn(), getTimedState: vi.fn() }));

const MICROCASE = {
  name: 'Micro',
  story: 'Historia',
  timeLimitMinutes: 1,
  questions: [{ questionId: 'q1', sectionTitle: 'H1', question: 'Uno' }, { questionId: 'q2', sectionTitle: 'H2', question: 'Dos' }],
};
const view = (changes) => ({ state: 'VALID', step: 'questions', answers: [], questionIndex: 0, totalQuestions: 2, limitSeconds: 60, remainingSeconds: 60, ...changes });

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  finalizeEvaluation.mockResolvedValue({ state: 'COMPLETED', submittedAt: '2026-11-10T12:00:00.000Z' });
});
afterEach(() => vi.useRealTimers());

const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });

test('resumes on the question and with the time the server reports', async () => {
  getTimedState.mockResolvedValue(view({ questionIndex: 1, answers: [{ questionId: 'q1', value: 4 }], remainingSeconds: 30 }));
  render(<MicrocaseQuestionnaire token='t' microcase={MICROCASE} />);
  await flush();
  expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Dos');
  expect(screen.getByRole('timer').textContent).toContain('00:30');
});

test('when the time runs out it saves the current selection and submits', async () => {
  getTimedState.mockResolvedValue(view({ remainingSeconds: 5 }));
  advanceTimed.mockResolvedValue(view({ questionIndex: 1, remainingSeconds: 0 }));
  render(<MicrocaseQuestionnaire token='t' microcase={MICROCASE} />);
  await flush();
  fireEvent.click(screen.getByRole('radio', { name: 'De acuerdo' }));

  await act(async () => { await vi.advanceTimersByTimeAsync(6000); });

  expect(advanceTimed).toHaveBeenCalledWith('t', { type: 'ANSWER', questionId: 'q1', value: 4 });
  expect(finalizeEvaluation).toHaveBeenCalledTimes(1);
  expect(screen.getByText('El tiempo terminó y se enviaron las respuestas registradas.')).toBeTruthy();
});

test('answers are sent to the server one by one', async () => {
  getTimedState.mockResolvedValue(view());
  advanceTimed.mockResolvedValue(view({ questionIndex: 1, answers: [{ questionId: 'q1', value: 2 }] }));
  render(<MicrocaseQuestionnaire token='t' microcase={MICROCASE} />);
  await flush();
  fireEvent.click(screen.getByRole('radio', { name: 'En desacuerdo' }));
  fireEvent.click(screen.getByRole('button', { name: /Continuar/ }));
  await flush();
  expect(advanceTimed).toHaveBeenCalledWith('t', { type: 'ANSWER', questionId: 'q1', value: 2 });
  expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Dos');
});
