import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CandidateResultPage } from './CandidateResultPage.jsx';
import { getEventCandidates } from '../services/eventService.js';

vi.mock('../services/eventService.js', () => ({ getEventCandidates: vi.fn() }));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/company/events/event-1/candidates/candidate-1/result']}>
      <Routes>
        <Route path='/company/events/:eventId/candidates/:candidateId/result' element={<CandidateResultPage />} />
      </Routes>
    </MemoryRouter>
  );
}

test('loads the completed candidate from the protected event candidate source', async () => {
  getEventCandidates.mockResolvedValue([{
    id: 'candidate-1',
    eventId: 'event-1',
    nombreCompleto: 'María Demo',
    correo: 'maria@example.com',
    status: 'EVALUATION_COMPLETED',
    submittedAt: '2026-09-10T16:00:00.000Z',
  }]);

  renderPage();

  expect(await screen.findByText('María Demo')).toBeTruthy();
  expect(screen.getByText('Evaluación completada')).toBeTruthy();
  expect(screen.getByText('Comparación con el perfil ideal')).toBeTruthy();
  expect(screen.getByText('No es una nota.')).toBeTruthy();
  expect(screen.getByText('Mockup · Datos ilustrativos')).toBeTruthy();
  expect(screen.getByText(/Este perfil no fue calculado a partir de las respuestas demo/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Descargar reporte · Demo' }).disabled).toBe(true);
  expect(getEventCandidates).toHaveBeenCalledWith('event-1');
});

test('does not expose a candidate outside the returned event candidates', async () => {
  getEventCandidates.mockResolvedValue([]);
  renderPage();

  expect(await screen.findByText('Resultado no disponible')).toBeTruthy();
  expect(screen.getByText('El candidato no existe o no pertenece a este evento.')).toBeTruthy();
});
