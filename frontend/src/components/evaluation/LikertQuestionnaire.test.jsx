import { fireEvent, render, screen } from '@testing-library/react';
import { LikertQuestionnaire } from './LikertQuestionnaire.jsx';
import { submitEvaluation } from '../../services/invitationService.js';

vi.mock('../../services/invitationService.js', () => ({ submitEvaluation: vi.fn() }));

describe('LikertQuestionnaire', () => {
  test('confirms and submits all answers without exposing a recap', async () => {
    submitEvaluation.mockResolvedValue({ state: 'COMPLETED', submittedAt: '2026-09-30T18:00:00.000Z' });
    render(<LikertQuestionnaire token={'a'.repeat(43)} />);

    expect(screen.getByRole('button', { name: 'Continuar →' }).disabled).toBe(true);
    expect(screen.queryByText(/Anterior/i)).toBeNull();

    for (let question = 1; question <= 4; question += 1) {
      expect(screen.getByText(String(question), { selector: 'strong' })).toBeTruthy();
      fireEvent.click(screen.getByRole('radio', { name: 'De acuerdo' }));
      const buttonName = question === 4 ? 'Finalizar cuestionario →' : 'Continuar →';
      fireEvent.click(screen.getByRole('button', { name: buttonName }));
    }

    expect(screen.getByText('Finalizar evaluación')).toBeTruthy();
    expect(screen.queryByText('Revisa tus respuestas')).toBeNull();
    expect(screen.queryByText('Volver a revisar')).toBeNull();
    expect(screen.queryByText(/modificar/i)).toBeNull();
    expect(screen.queryByText(/Anterior/i)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Enviar evaluación' }));

    expect(await screen.findByText('Evaluación completada')).toBeTruthy();
    expect(submitEvaluation).toHaveBeenCalledTimes(1);
    expect(submitEvaluation).toHaveBeenCalledWith('a'.repeat(43), [
      { questionId: 'demo-a-1', value: 4 },
      { questionId: 'demo-a-2', value: 4 },
      { questionId: 'demo-a-3', value: 4 },
      { questionId: 'demo-a-4', value: 4 },
    ]);
  });
});
