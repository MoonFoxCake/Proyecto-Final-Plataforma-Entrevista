import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CandidateList } from './CandidateList.jsx';

const candidates = [
  { id: 'candidate-1', eventId: 'event-1', nombreCompleto: 'María Demo', correo: 'maria@example.com', cedula: '123', status: 'INVITATION_SENT', fechaHoraCita: '2026-09-10T15:00:00.000Z' },
  { id: 'candidate-2', eventId: 'event-1', nombreCompleto: 'Carlos Demo', correo: 'carlos@example.com', cedula: '456', status: 'EVALUATION_COMPLETED', profileAvailable: true, fechaHoraCita: '2026-09-10T15:00:00.000Z' },
];

test('enables the profile only after administrative publication', () => {
  render(<MemoryRouter><CandidateList candidates={candidates} loading={false} /></MemoryRouter>);

  expect(screen.getByText('Invitación enviada')).toBeTruthy();
  expect(screen.getByText('Perfil disponible')).toBeTruthy();
  expect(screen.getByText('No disponible')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Ver perfil' }).getAttribute('href')).toBe('/company/events/event-1/candidates/candidate-2/result');
});
