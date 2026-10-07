import { fireEvent, render, screen } from '@testing-library/react';
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

test('after Module A is published, shows Module B and lets the company pick who continues', () => {
  const onToggle = vi.fn();
  const rows = [
    ...candidates,
    { id: 'candidate-3', eventId: 'event-1', nombreCompleto: 'Ana Lista', correo: 'ana@example.com', cedula: '789', status: 'EVALUATION_COMPLETED', profileAvailable: true, moduleB: { status: 'COMPLETED' } },
  ];
  render(<MemoryRouter><CandidateList candidates={rows} loading={false} showModuleB selection={{ selectedIds: new Set(), onToggle }} /></MemoryRouter>);

  expect(screen.getByText('Respondido')).toBeTruthy();
  expect(screen.getAllByText('No enviado')).toHaveLength(2);
  // Only Carlos (published profile, Module B not answered yet) can be selected.
  const checkboxes = screen.getAllByRole('checkbox');
  expect(checkboxes).toHaveLength(1);
  fireEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar a Carlos Demo para el Módulo B' }));
  expect(onToggle).toHaveBeenCalledWith('candidate-2');
});
