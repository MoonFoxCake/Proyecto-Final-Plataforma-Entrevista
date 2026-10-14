import { forwardRef, useImperativeHandle } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { EvaluationAccessPage } from './EvaluationAccessPage.jsx';
import {
  advanceMacrocase, finalizeMacrocase, getMacrocaseStage, validateInvitationAccess,
} from '../services/invitationService.js';

vi.mock('../services/invitationService.js', () => ({
  validateInvitationAccess: vi.fn(),
  submitEvaluation: vi.fn(),
  getMacrocaseStage: vi.fn(),
  advanceMacrocase: vi.fn(),
  finalizeMacrocase: vi.fn(),
}));

vi.mock('../components/avatar/TalkingAvatarView.jsx', () => ({
  TalkingAvatarView: forwardRef(function MockAvatar(_props, ref) {
    useImperativeHandle(ref, () => ({ speak: vi.fn(), stop: vi.fn(), whenReady: () => Promise.resolve() }));
    return <div />;
  }),
  preloadAvatar: vi.fn(),
  AUTOPLAY_BLOCKED: 'autoplay-blocked',
}));

const TOKEN = 'b'.repeat(43);
const OVERVIEW = {
  name: 'Caperucita roja', description: '', instructions: '', maxCharacters: 200, defaultTimeLimit: 0, totalSections: 1, totalQuestions: 1,
};
const PROGRESS = { sectionIndex: 0, totalSections: 1, questionIndex: 0, sectionQuestions: 1, answered: 0, totalQuestions: 1 };

test('a Module B invitation runs the macrocase stage by stage through the backend', async () => {
  window.scrollTo = vi.fn();
  validateInvitationAccess.mockResolvedValue({
    state: 'VALID',
    module: 'B',
    candidate: { nombreCompleto: 'María Apta' },
    organization: { nombre: 'TechCorp' },
    event: { nombre: 'Programa Trainee', puesto: 'Analista', availableFrom: '2026-10-06T15:00:00.000Z' },
    expiresAt: '2026-10-09T15:00:00.000Z',
    macrocase: OVERVIEW,
  });
  getMacrocaseStage.mockResolvedValue({ state: 'VALID', step: 'intro', macrocase: OVERVIEW, progress: PROGRESS });
  advanceMacrocase.mockResolvedValue({
    state: 'VALID',
    step: 'review',
    macrocase: OVERVIEW,
    progress: { ...PROGRESS, answered: 1 },
    summary: [{ sectionId: 's1', order: 1, title: 'El bosque', total: 1, answered: 1, timedOut: 0 }],
  });
  finalizeMacrocase.mockResolvedValue({ state: 'COMPLETED', submittedAt: '2026-10-06T16:00:00.000Z' });

  render(<MemoryRouter initialEntries={[`/evaluation/access?token=${TOKEN}`]}><EvaluationAccessPage /></MemoryRouter>);

  expect(await screen.findByText('Segunda etapa')).toBeTruthy();
  expect(screen.queryByText('3–5 minutos · Demo')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Continuar →' }));

  fireEvent.click(await screen.findByRole('button', { name: 'Comenzar →' }));
  await waitFor(() => expect(advanceMacrocase).toHaveBeenCalledWith(TOKEN, { type: 'START' }));

  expect(await screen.findByText('El bosque', { exact: false })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Enviar evaluación' }));

  expect(await screen.findByText('Evaluación completada')).toBeTruthy();
  expect(finalizeMacrocase).toHaveBeenCalledWith(TOKEN);
});
