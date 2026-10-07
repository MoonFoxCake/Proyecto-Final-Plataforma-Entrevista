import { forwardRef, useImperativeHandle } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { EvaluationAccessPage } from './EvaluationAccessPage.jsx';
import { submitMacrocaseAnswers, validateInvitationAccess } from '../services/invitationService.js';

vi.mock('../services/invitationService.js', () => ({
  validateInvitationAccess: vi.fn(),
  submitEvaluation: vi.fn(),
  submitMacrocaseAnswers: vi.fn(),
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

test('a Module B invitation runs the macrocase and sends the written answers', async () => {
  window.scrollTo = vi.fn();
  validateInvitationAccess.mockResolvedValue({
    state: 'VALID',
    module: 'B',
    candidate: { nombreCompleto: 'María Apta' },
    organization: { nombre: 'TechCorp' },
    event: { nombre: 'Programa Trainee', puesto: 'Analista', availableFrom: '2026-10-06T15:00:00.000Z' },
    expiresAt: '2026-10-09T15:00:00.000Z',
    macrocase: {
      name: 'Caperucita roja',
      introduction: 'Había una vez una niña.',
      maxCharacters: 200,
      questions: [{ id: 'q1', order: 1, text: '¿Qué haría usted en el lugar del lobo?', audioUrl: '', visemes: [] }],
    },
  });
  submitMacrocaseAnswers.mockResolvedValue({ state: 'COMPLETED', submittedAt: '2026-10-06T16:00:00.000Z' });

  render(<MemoryRouter initialEntries={[`/evaluation/access?token=${TOKEN}`]}><EvaluationAccessPage /></MemoryRouter>);

  expect(await screen.findByText('Segunda etapa · Módulo B')).toBeTruthy();
  expect(screen.queryByText('3–5 minutos · Demo')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Continuar →' }));
  fireEvent.click(screen.getByRole('button', { name: 'Leer el caso →' }));
  fireEvent.click(screen.getByRole('button', { name: 'Comenzar preguntas →' }));

  fireEvent.change(screen.getByLabelText('Tu respuesta'), { target: { value: 'No me comería a nadie.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Finalizar macrocaso →' }));
  fireEvent.click(screen.getByRole('button', { name: 'Enviar evaluación' }));

  expect(await screen.findByText('Evaluación completada')).toBeTruthy();
  await waitFor(() => expect(submitMacrocaseAnswers).toHaveBeenCalledWith(TOKEN, [{ questionId: 'q1', text: 'No me comería a nadie.' }]));
});
