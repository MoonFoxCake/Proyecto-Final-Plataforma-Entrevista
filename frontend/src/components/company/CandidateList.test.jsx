import { render, screen } from '@testing-library/react';
import { CandidateList } from './CandidateList.jsx';

test('online: identity, appointment and general status', () => {
  render(<CandidateList candidates={[
    { id: 'c1', nombreCompleto: 'María Demo', correo: 'maria@example.com', cedula: '123', status: 'INVITATION_SENT', fechaHoraCita: '2026-09-10T15:00:00.000Z' },
    { id: 'c2', nombreCompleto: 'Carlos Demo', correo: 'carlos@example.com', cedula: '456', status: 'EVALUATION_COMPLETED', profileAvailable: true },
    { id: 'c3', nombreCompleto: 'Ana Demo', correo: 'ana@example.com', cedula: '789', status: 'EVALUATION_COMPLETED' },
  ]} />);

  expect(screen.getByText('Invitación enviada')).toBeTruthy();
  expect(screen.getByText('Perfil disponible')).toBeTruthy();
  expect(screen.getByText('En revisión')).toBeTruthy();
  expect(screen.getByRole('columnheader', { name: 'Estado' })).toBeTruthy();
  // Module B and profiles live in "Resultados".
  expect(screen.queryByRole('link')).toBeNull();
  expect(screen.queryByRole('checkbox')).toBeNull();
});

test('onsite events show the citation apart from the evaluation status', () => {
  const rows = [
    { id: 'c1', nombreCompleto: 'Sin Citar', cedula: '1', status: 'INVITED_PENDING' },
    { id: 'c2', nombreCompleto: 'Con Error', cedula: '2', status: 'INVITED_PENDING', citation: { status: 'FAILED', error: 'Resend caído' } },
    { id: 'c3', nombreCompleto: 'Citada', cedula: '3', status: 'CITED', citation: { status: 'SENT', providerId: 'e3' } },
    { id: 'c4', nombreCompleto: 'Entregada', cedula: '4', status: 'CITED', citation: { status: 'SENT', providerId: 'e4', delivery: { status: 'delivered' } } },
    { id: 'c5', nombreCompleto: 'Rebotada', cedula: '5', status: 'CITED', citation: { status: 'SENT', providerId: 'e5', delivery: { status: 'bounced' } } },
  ];
  render(<CandidateList candidates={rows} onsite citationAction={<button type='button'>↻ Actualizar</button>} />);

  expect(screen.getByRole('columnheader', { name: /Citación/ })).toBeTruthy();
  expect(screen.getByRole('button', { name: '↻ Actualizar' })).toBeTruthy();
  expect(screen.getByText('Sin enviar')).toBeTruthy();
  expect(screen.getByText('Error al enviar').closest('[title]').getAttribute('title')).toBe('Resend caído');
  expect(screen.getByText('Enviada')).toBeTruthy();
  expect(screen.getByText('Entregada', { selector: 'span' })).toBeTruthy();
  expect(screen.getByText('Rebotada', { selector: 'span' })).toBeTruthy();
  // Being cited says nothing about the evaluation itself.
  expect(screen.getAllByText('Por evaluar')).toHaveLength(5);
});
