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

test('onsite events show the citation apart from the evaluation status', () => {
  const rows = [
    { id: 'c1', eventId: 'event-1', nombreCompleto: 'Sin Citar', cedula: '1', status: 'INVITED_PENDING' },
    { id: 'c2', eventId: 'event-1', nombreCompleto: 'Con Error', cedula: '2', status: 'INVITED_PENDING', citation: { status: 'FAILED', error: 'Resend caído' } },
    { id: 'c3', eventId: 'event-1', nombreCompleto: 'Citada', cedula: '3', status: 'CITED', citation: { status: 'SENT', providerId: 'e3' } },
    { id: 'c4', eventId: 'event-1', nombreCompleto: 'Entregada', cedula: '4', status: 'CITED', citation: { status: 'SENT', providerId: 'e4', delivery: { status: 'delivered' } } },
    { id: 'c5', eventId: 'event-1', nombreCompleto: 'Rebotada', cedula: '5', status: 'CITED', citation: { status: 'SENT', providerId: 'e5', delivery: { status: 'bounced' } } },
  ];
  render(<MemoryRouter><CandidateList candidates={rows} loading={false} onsite /></MemoryRouter>);

  expect(screen.getByRole('columnheader', { name: 'Citación' })).toBeTruthy();
  expect(screen.getByText('Sin enviar')).toBeTruthy();
  expect(screen.getByText('Error al enviar').closest('[title]').getAttribute('title')).toBe('Resend caído');
  expect(screen.getByText('Enviada')).toBeTruthy();
  expect(screen.getByText('Entregada', { selector: 'span' })).toBeTruthy();
  expect(screen.getByText('Rebotada', { selector: 'span' })).toBeTruthy();
  // Being cited says nothing about the evaluation itself.
  expect(screen.getAllByText('Por evaluar')).toHaveLength(5);
  expect(screen.queryByText('Invitación enviada')).toBeNull();
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
