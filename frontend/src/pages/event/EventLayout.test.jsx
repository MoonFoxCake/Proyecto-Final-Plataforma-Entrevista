import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import * as eventService from '../../services/eventService.js';
import * as credentialService from '../../services/credentialService.js';
import { ONSITE_EVENT, renderEvent } from './renderEvent.test-utils.jsx';

vi.mock('../../services/eventService.js', () => ({
  getEvent: vi.fn(),
  getEventCandidates: vi.fn(),
  publishEventInvitations: vi.fn(),
  refreshCitationStatus: vi.fn(),
  sendModuleBInvitations: vi.fn(),
  createEventCandidate: vi.fn(),
}));
vi.mock('../../services/credentialService.js', () => ({ getCredentials: vi.fn() }));
vi.mock('../../services/onsiteService.js', () => ({ getRoster: vi.fn(async () => ({ module: 'A', isAppointmentDay: true, rows: [], counts: {} })) }));
vi.mock('../../components/company/CompanySidebar.jsx', () => ({ CompanySidebar: () => <nav aria-label='Menú' /> }));

const CANDIDATES = [
  { id: 'c1', eventId: 'event-1', nombreCompleto: 'María López', correo: 'maria@example.com', cedula: '100', status: 'INVITED_PENDING' },
  { id: 'c2', eventId: 'event-1', nombreCompleto: 'Carlos Díaz', correo: 'carlos@example.com', cedula: '200', status: 'CITED', citation: { status: 'SENT', providerId: 'e2' } },
];

beforeEach(() => {
  vi.clearAllMocks();
  window.confirm = vi.fn(() => true);
  eventService.getEvent.mockResolvedValue(ONSITE_EVENT);
  eventService.getEventCandidates.mockResolvedValue(CANDIDATES);
  credentialService.getCredentials.mockResolvedValue({ modules: [{ module: 'A', rows: [], counts: { pending: 2 } }] });
});

describe('event header and tabs', () => {
  test('one title, status and modality as secondary information, and a tab per working context', async () => {
    renderEvent();

    expect(await screen.findByRole('heading', { level: 1, name: 'Concurso Presencial' })).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByText('Activo')).toBeTruthy();
    expect(screen.getByText('Presencial')).toBeTruthy();
    expect(screen.getByText('Módulos A y B')).toBeTruthy();

    const tabs = within(screen.getByRole('navigation', { name: 'Secciones del evento' }));
    expect(tabs.getAllByRole('link').map((link) => link.textContent)).toEqual(['Resumen', 'Candidatos 2', 'Aplicación presencial', 'Resultados']);
    expect(tabs.getByRole('link', { name: 'Resumen' }).getAttribute('aria-current')).toBe('page');
    // No operational buttons in the header.
    expect(screen.queryByRole('button', { name: /Enviar citaciones|Preparar accesos|Agregar candidato/ })).toBeNull();
  });

  test('online events have no onsite tab', async () => {
    eventService.getEvent.mockResolvedValue({ ...ONSITE_EVENT, modality: 'online', onsite: undefined, availableFrom: '2026-11-05T14:00:00.000Z', modules: ['A'] });
    renderEvent();
    expect(await screen.findByText('Virtual')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Aplicación presencial' })).toBeNull();
    expect(screen.getByText('Módulo A')).toBeTruthy();
  });

  test('switching tabs keeps the loaded data (one request)', async () => {
    renderEvent();
    fireEvent.click(await screen.findByRole('link', { name: /Candidatos/ }));
    expect(await screen.findByRole('heading', { name: 'Candidatos' })).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: 'Resultados' }));
    expect(await screen.findByText('Aún no hay resultados publicados')).toBeTruthy();
    expect(eventService.getEvent).toHaveBeenCalledTimes(1);
  });

  test('the former applicator URL opens the "Aplicar" stage', async () => {
    renderEvent('/company/events/event-1/onsite');
    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/company/events/event-1/presencial?etapa=aplicar'));
  });
});

describe('summary tab', () => {
  test('shows the facts, the figures and a single next action', async () => {
    renderEvent();
    expect(await screen.findByText('Campus Central')).toBeTruthy();
    expect(screen.getByText('Aula 204')).toBeTruthy();
    expect(screen.getByText('Llegar 15 minutos antes.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Envía las citaciones (1)' })).toBeTruthy();
    // No operational tables here.
    expect(screen.queryByRole('table')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Ir a candidatos' }));
    expect(screen.getByTestId('location').textContent).toBe('/company/events/event-1/candidatos');
  });
});

describe('candidates tab', () => {
  test('sends the pending citations, without codes, and confirms with a temporary notice', async () => {
    eventService.publishEventInvitations.mockResolvedValue({ total: 1, sent: 1, failed: 0 });
    renderEvent('/company/events/event-1/candidatos');

    expect(await screen.findByRole('columnheader', { name: /Citación/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar citaciones (1)' }));
    expect(window.confirm.mock.calls[0][0]).toMatch(/No incluyen enlaces ni códigos de acceso/);
    // A temporary notice in the live region, not a permanent banner.
    expect((await screen.findByText('Se enviaron 1 citaciones.')).closest('[aria-live="polite"]')).toBeTruthy();
    expect(eventService.getEvent).toHaveBeenCalledTimes(2); // reloaded after sending
  });

  test('refreshes the delivery status from the citation column', async () => {
    eventService.refreshCitationStatus.mockResolvedValue({ checked: 1, failed: 0 });
    renderEvent('/company/events/event-1/candidatos');
    fireEvent.click(await screen.findByRole('button', { name: '↻ Actualizar' }));
    await waitFor(() => expect(eventService.refreshCitationStatus).toHaveBeenCalledWith('event-1'));
    expect(await screen.findByText(/Estado de envío actualizado/)).toBeTruthy();
  });

  test('opens the registration form from the summary shortcut', async () => {
    eventService.getEventCandidates.mockResolvedValue([]);
    renderEvent('/company/events/event-1/candidatos?nuevo=1');
    expect(await screen.findByRole('heading', { name: 'Agregar candidato' })).toBeTruthy();
  });

  test('empty state points to the next step', async () => {
    eventService.getEventCandidates.mockResolvedValue([]);
    renderEvent('/company/events/event-1/candidatos');
    expect(await screen.findByText('Aún no hay candidatos')).toBeTruthy();
    expect(screen.getByText('Agrega al primero para poder enviar las citaciones.')).toBeTruthy();
  });

  test('after publication candidates cannot be added', async () => {
    eventService.getEvent.mockResolvedValue({ ...ONSITE_EVENT, status: 'PUBLISHED', evaluationsPublishedAt: '2026-11-10T00:00:00.000Z' });
    renderEvent('/company/events/event-1/candidatos');
    expect(await screen.findByText(/no se pueden agregar candidatos/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Agregar candidato/ })).toBeNull();
  });
});
