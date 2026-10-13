import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { EventDetailPage } from './EventDetailPage.jsx';
import * as eventService from '../services/eventService.js';

vi.mock('../services/eventService.js', () => ({
  getEvent: vi.fn(),
  getEventCandidates: vi.fn(),
  publishEventInvitations: vi.fn(),
  refreshCitationStatus: vi.fn(),
  sendModuleBInvitations: vi.fn(),
  createEventCandidate: vi.fn(),
}));
vi.mock('../components/company/CompanySidebar.jsx', () => ({ CompanySidebar: () => <nav /> }));

const ONSITE_EVENT = {
  id: 'event-1',
  name: 'Concurso Presencial',
  position: 'Analista',
  status: 'ACTIVE',
  modality: 'onsite',
  modules: ['A', 'B'],
  onsite: {
    venue: 'Campus Central', room: 'Aula 204', startsAt: '2026-11-05T14:00:00.000Z', endsAt: '2026-11-05T16:00:00.000Z', instructions: 'Llegar 15 minutos antes.',
  },
};

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/company/events/event-1']}>
      <Routes><Route path='/company/events/:eventId' element={<EventDetailPage />} /></Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.confirm = vi.fn(() => true);
});

test('an onsite event shows its venue and sends citations instead of links', async () => {
  eventService.getEvent.mockResolvedValue(ONSITE_EVENT);
  eventService.getEventCandidates.mockResolvedValue([
    { id: 'c1', eventId: 'event-1', nombreCompleto: 'María', cedula: '1', status: 'INVITED_PENDING' },
    { id: 'c2', eventId: 'event-1', nombreCompleto: 'Carlos', cedula: '2', status: 'CITED', citation: { status: 'SENT', providerId: 'e2' } },
  ]);
  eventService.publishEventInvitations.mockResolvedValue({ total: 1, sent: 1, failed: 0 });
  eventService.refreshCitationStatus.mockResolvedValue({ checked: 1, failed: 0 });
  renderPage();

  expect(await screen.findByText('Presencial')).toBeTruthy();
  expect(screen.getByText('Campus Central')).toBeTruthy();
  expect(screen.getByText('Aula 204')).toBeTruthy();
  expect(screen.getByText('Llegar 15 minutos antes.')).toBeTruthy();
  expect(screen.queryByText(/Evaluación habilitada para todos desde/)).toBeNull();
  expect(screen.queryByRole('button', { name: /Publicar invitaciones/ })).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Enviar citaciones (1)' }));
  expect(window.confirm.mock.calls[0][0]).toMatch(/No incluyen enlaces ni códigos de acceso/);
  expect(await screen.findByText('Se enviaron 1 citaciones correctamente.')).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: 'Actualizar estado de envío' }));
  await waitFor(() => expect(eventService.refreshCitationStatus).toHaveBeenCalledWith('event-1'));
  expect(await screen.findByText(/Estado de envío actualizado/)).toBeTruthy();
});

test('onsite Module B asks for its own session and sends it with the selected candidates', async () => {
  eventService.getEvent.mockResolvedValue({ ...ONSITE_EVENT, status: 'PUBLISHED', evaluationsPublishedAt: '2026-11-10T00:00:00.000Z' });
  eventService.getEventCandidates.mockResolvedValue([
    { id: 'c1', eventId: 'event-1', nombreCompleto: 'María', cedula: '1', status: 'EVALUATION_COMPLETED', profileAvailable: true },
  ]);
  eventService.sendModuleBInvitations.mockResolvedValue({ total: 1, sent: 1, failed: 0 });
  renderPage();

  expect(await screen.findByText('Sesión presencial del Módulo B')).toBeTruthy();
  // Starts at Module A's venue.
  expect(screen.getByLabelText('Sede').value).toBe('Campus Central');
  fireEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar a María para el Módulo B' }));

  fireEvent.click(screen.getByRole('button', { name: 'Citar al Módulo B (1)' }));
  expect(await screen.findByText(/Citación al Módulo B: Indica la fecha/)).toBeTruthy();
  expect(eventService.sendModuleBInvitations).not.toHaveBeenCalled();

  fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-11-20' } });
  fireEvent.change(screen.getByLabelText('Hora de inicio'), { target: { value: '09:00' } });
  fireEvent.change(screen.getByLabelText('Hora de fin'), { target: { value: '11:00' } });
  fireEvent.click(screen.getByRole('button', { name: 'Citar al Módulo B (1)' }));

  await waitFor(() => expect(eventService.sendModuleBInvitations).toHaveBeenCalledWith('event-1', ['c1'], expect.objectContaining({
    sede: 'Campus Central', ubicacion: 'Aula 204', fechaHoraInicio: new Date('2026-11-20T09:00').toISOString(),
  })));
});

test('an event without Module B does not offer it after publication', async () => {
  eventService.getEvent.mockResolvedValue({ ...ONSITE_EVENT, modules: ['A'], status: 'PUBLISHED', evaluationsPublishedAt: '2026-11-10T00:00:00.000Z' });
  eventService.getEventCandidates.mockResolvedValue([]);
  renderPage();

  expect(await screen.findByText(/Módulo A$/)).toBeTruthy();
  expect(screen.queryByText('Módulo B · Macrocaso')).toBeNull();
});
