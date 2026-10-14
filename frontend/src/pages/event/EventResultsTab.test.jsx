import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import * as eventService from '../../services/eventService.js';
import { ONSITE_EVENT, renderEvent } from './renderEvent.test-utils.jsx';

vi.mock('../../services/eventService.js', () => ({ getEvent: vi.fn(), getEventCandidates: vi.fn(), sendModuleBInvitations: vi.fn() }));
vi.mock('../../services/credentialService.js', () => ({ getCredentials: vi.fn(async () => ({ modules: [] })) }));
vi.mock('../../components/company/CompanySidebar.jsx', () => ({ CompanySidebar: () => <nav aria-label='Menú' /> }));

const PUBLISHED = { ...ONSITE_EVENT, status: 'PUBLISHED', evaluationsPublishedAt: '2026-11-10T00:00:00.000Z' };
const CANDIDATES = [
  { id: 'c1', eventId: 'event-1', nombreCompleto: 'María López', status: 'EVALUATION_COMPLETED', profileAvailable: true },
  { id: 'c2', eventId: 'event-1', nombreCompleto: 'Carlos Díaz', status: 'EVALUATION_COMPLETED', profileAvailable: true, moduleB: { status: 'COMPLETED' } },
  { id: 'c3', eventId: 'event-1', nombreCompleto: 'Ana Ruiz', status: 'CITED' },
];

beforeEach(() => {
  vi.clearAllMocks();
  window.confirm = vi.fn(() => true);
  eventService.getEventCandidates.mockResolvedValue(CANDIDATES);
});

test('before publication it explains when the results will appear', async () => {
  eventService.getEvent.mockResolvedValue(ONSITE_EVENT);
  renderEvent('/company/events/event-1/resultados');
  expect(await screen.findByText('Aún no hay resultados publicados')).toBeTruthy();
  expect(screen.queryByRole('table')).toBeNull();
});

test('lists the profiles and opens the existing profile page', async () => {
  eventService.getEvent.mockResolvedValue(PUBLISHED);
  renderEvent('/company/events/event-1/resultados');

  const maria = (await screen.findByText('María López')).closest('tr');
  expect(within(maria).getByText('Perfil disponible')).toBeTruthy();
  expect(within(screen.getByText('Carlos Díaz').closest('tr')).getByText('Respondido')).toBeTruthy();
  expect(within(screen.getByText('Ana Ruiz').closest('tr')).getByText('No disponible')).toBeTruthy();

  fireEvent.click(within(maria).getByRole('link', { name: 'Ver perfil' }));
  expect(await screen.findByText('Perfil del candidato')).toBeTruthy();
});

test('onsite Module B: picks who continues and asks for the session in a dialog', async () => {
  eventService.getEvent.mockResolvedValue(PUBLISHED);
  eventService.sendModuleBInvitations.mockResolvedValue({ total: 1, sent: 1, failed: 0 });
  renderEvent('/company/events/event-1/resultados');

  // Only María: published profile, Module B not answered.
  fireEvent.click(await screen.findByRole('button', { name: 'Seleccionar disponibles (1)' }));
  fireEvent.click(screen.getByRole('button', { name: 'Citar al Módulo B (1)' }));

  const dialog = within(screen.getByRole('dialog', { name: 'Citar al Módulo B (1)' }));
  expect(dialog.getByLabelText('Sede').value).toBe('Campus Central');
  fireEvent.click(dialog.getByRole('button', { name: 'Enviar citaciones' }));
  expect(dialog.getByRole('alert').textContent).toMatch(/fecha y el horario/);
  expect(eventService.sendModuleBInvitations).not.toHaveBeenCalled();

  fireEvent.change(dialog.getByLabelText('Fecha'), { target: { value: '2026-11-20' } });
  fireEvent.change(dialog.getByLabelText('Hora de inicio'), { target: { value: '09:00' } });
  fireEvent.change(dialog.getByLabelText('Hora de fin'), { target: { value: '11:00' } });
  fireEvent.click(dialog.getByRole('button', { name: 'Enviar citaciones' }));

  await waitFor(() => expect(eventService.sendModuleBInvitations).toHaveBeenCalledWith('event-1', ['c1'], expect.objectContaining({
    sede: 'Campus Central', ubicacion: 'Aula 204', fechaHoraInicio: new Date('2026-11-20T09:00').toISOString(),
  })));
  expect(await screen.findByText('Se envió la citación al Módulo B a 1 candidato(s).')).toBeTruthy();
});

test('online Module B keeps its confirmation before sending links', async () => {
  eventService.getEvent.mockResolvedValue({ ...PUBLISHED, modality: 'online', onsite: undefined });
  eventService.sendModuleBInvitations.mockResolvedValue({ total: 1, sent: 1, failed: 0 });
  renderEvent('/company/events/event-1/resultados');

  fireEvent.click(await screen.findByRole('checkbox', { name: 'Seleccionar a María López para el Módulo B' }));
  fireEvent.click(screen.getByRole('button', { name: 'Enviar Módulo B (1)' }));
  expect(window.confirm).toHaveBeenCalled();
  await waitFor(() => expect(eventService.sendModuleBInvitations).toHaveBeenCalledWith('event-1', ['c1'], undefined));
});

test('events without Module B only list the profiles', async () => {
  eventService.getEvent.mockResolvedValue({ ...PUBLISHED, modules: ['A'] });
  renderEvent('/company/events/event-1/resultados');
  expect(await screen.findByText('Perfiles publicados del Módulo A.')).toBeTruthy();
  expect(screen.queryByRole('checkbox')).toBeNull();
  expect(screen.queryByRole('button', { name: /Módulo B/ })).toBeNull();
});
