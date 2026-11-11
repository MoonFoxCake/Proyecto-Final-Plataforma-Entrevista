import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CompanyCandidatesView } from './CompanyCandidatesView.jsx';
import { appointmentOf, candidateState, filterCandidateRows } from './companyCandidates.js';
import * as api from '../services/eventService.js';
vi.mock('../services/eventService.js', () => ({ getEvents: vi.fn(), getEventCandidates: vi.fn() }));
const events = [
  { id: 'e1', name: 'Analistas', position: 'Finanzas', modules: ['A', 'B', 'C'], modality: 'online' },
  { id: 'e2', name: 'Analistas', position: 'Operaciones', modules: ['A', 'B'], modality: 'onsite' },
  { id: 'e3', name: 'Concurso cerrado', modules: ['A'], status: 'PUBLISHED' },
];
const candidate = { id: 'c1', nombreCompleto: 'Ana Gómez', correo: 'ana@example.test', cedula: '1-2345-6789', fechaHoraCita: '2026-11-20T15:00:00Z', status: 'EVALUATION_COMPLETED', moduleB: { status: 'COMPLETED' }, moduleC: { status: 'INVITATION_SENT' } };
const data = {
  e1: [candidate],
  e2: [{ ...candidate, profileAvailable: true, moduleC: undefined, moduleB: { status: 'CITED', citation: { appointment: { startsAt: '2026-12-01T15:00:00Z' } } } }],
  e3: [{ id: 'c2', nombreCompleto: 'Bruno Díaz', correo: 'bruno@example.test', status: 'INVITED_PENDING', citation: { status: 'FAILED' } }],
};
beforeAll(() => { HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); }; });
beforeEach(() => { vi.resetAllMocks(); api.getEvents.mockResolvedValue(events); api.getEventCandidates.mockImplementation(async (id) => data[id]); });
afterEach(cleanup);
const renderPage = (query = '') => render(<MemoryRouter initialEntries={[`/company-dashboard?section=candidates${query}`]}><CompanyCandidatesView /></MemoryRouter>);
const load = async () => { renderPage(); await screen.findByRole('article', { name: 'Bruno Díaz · Concurso cerrado' }); };
const change = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

test('combines accent-insensitive search, distinct event IDs, modality and module state without refetching', async () => {
  await load();
  expect(screen.getAllByRole('article')).toHaveLength(3);
  change('Buscar', 'ana gomez');
  expect(screen.getAllByRole('article')).toHaveLength(2);
  change('Evento', 'e2');
  expect(screen.getAllByRole('article')).toHaveLength(1);
  expect(screen.getByText('Operaciones')).toBeTruthy();
  change('Estado del Módulo A', 'review');
  expect(screen.getByRole('heading', { name: 'Sin coincidencias' })).toBeTruthy();
  change('Estado del Módulo A', 'all');
  change('Modalidad', 'online');
  expect(screen.queryAllByRole('article')).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
  change('Buscar', '123456789');
  expect(screen.getAllByRole('article')).toHaveLength(2);
  expect(api.getEventCandidates).toHaveBeenCalledTimes(3);
});

test('changes the state filter and counts to the selected module, without reusing Module A appointments', async () => {
  await load();
  change('Estado del Módulo A', 'review');
  change('Módulo', 'B');
  expect(screen.getByLabelText('Estado del Módulo B').value).toBe('all');
  expect(screen.getAllByRole('article')).toHaveLength(2);
  change('Estado del Módulo B', 'completed');
  expect(screen.getAllByRole('article')).toHaveLength(1);
  expect(screen.getByText('Sin cita configurada')).toBeTruthy();
  change('Módulo', 'C');
  expect(screen.getAllByRole('article')).toHaveLength(1);
  expect(screen.getByText('Invitación enviada')).toBeTruthy();
});

test('details preserve the selected event and expose only published profiles', async () => {
  await load();
  change('Evento', 'e1');
  fireEvent.click(screen.getByRole('button', { name: 'Ver detalle' }));
  let dialog = within(screen.getByRole('dialog'));
  expect(dialog.getByRole('link', { name: /Gestionar en evento/ }).getAttribute('href')).toBe('/company/events/e1/candidatos');
  expect(dialog.queryByRole('link', { name: /perfil inicial/ })).toBeNull();
  fireEvent.click(dialog.getByRole('button', { name: 'Cerrar', exact: true }));
  change('Evento', 'e2');
  fireEvent.click(screen.getByRole('button', { name: 'Ver detalle' }));
  dialog = within(screen.getByRole('dialog'));
});

test('adds candidates through an open event and excludes published events from the picker', async () => {
  await load();
  fireEvent.click(screen.getByRole('button', { name: '+ Agregar candidatos' }));
  const dialog = within(screen.getByRole('dialog'));
  expect(dialog.queryByRole('option', { name: 'Concurso cerrado' })).toBeNull();
  expect(dialog.queryByRole('link', { name: /Continuar al evento/ })).toBeNull();
  fireEvent.change(dialog.getByLabelText('Evento para agregar candidatos'), { target: { value: 'e1' } });
  expect(dialog.getByRole('link', { name: /Continuar al evento/ }).getAttribute('href')).toBe('/company/events/e1/candidatos?nuevo=1');
});

test('shows partial data explicitly and retries a failed event without claiming an empty directory', async () => {
  api.getEventCandidates.mockImplementation(async (id) => { if (id === 'e1') throw new Error('Unavailable'); return data[id]; });
  renderPage();
  expect((await screen.findByRole('alert')).textContent).toContain('Se muestran datos parciales');
  expect(screen.getAllByRole('article')).toHaveLength(2);
  api.getEventCandidates.mockImplementation(async (id) => data[id]);
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar carga' }));
  await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(3));
  expect(screen.queryByRole('alert')).toBeNull();
});

test('shows a retry for a failed directory and a useful empty state for companies without events', async () => {
  api.getEvents.mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce([]);
  renderPage();
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar', exact: true }));
  await screen.findByRole('heading', { name: 'Aún no hay candidatos' });
  expect(screen.getByRole('link', { name: 'Crear un evento' }).getAttribute('href')).toBe('/company/events/new');
  expect(api.getEventCandidates).not.toHaveBeenCalled();
});

test('supports direct filters, pagination and resets the page when the search changes', async () => {
  api.getEvents.mockResolvedValue([events[0]]);
  api.getEventCandidates.mockResolvedValue(Array.from({ length: 13 }, (_, index) => ({ ...candidate, id: `c${index}`, nombreCompleto: `Candidato ${String(index).padStart(2, '0')}` })));
  renderPage('&event=e1&module=B');
  await screen.findByRole('article', { name: 'Candidato 00 · Analistas' });
  expect(screen.getAllByRole('article')).toHaveLength(10);
  expect(screen.getByLabelText('Módulo').value).toBe('B');
  fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
  expect(screen.getAllByRole('article')).toHaveLength(3);
  change('Buscar', 'Candidato 00');
  expect(screen.getByRole('article', { name: 'Candidato 00 · Analistas' })).toBeTruthy();
});

test('expands mobile filters and preserves their selection when collapsed', async () => {
  await load();
  const toggle = screen.getByRole('button', { name: 'Más filtros' });
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(toggle);
  change('Módulo', 'C');
  fireEvent.click(screen.getByRole('button', { name: 'Ocultar filtros' }));
  expect(screen.getByRole('button', { name: 'Más filtros' }).getAttribute('aria-expanded')).toBe('false');
  expect(screen.getAllByRole('article')).toHaveLength(1);
  expect(screen.getByLabelText('Módulo').value).toBe('C');
});

test('does not report zero candidates when every candidate request fails', async () => {
  api.getEventCandidates.mockRejectedValue(new Error('Unavailable'));
  renderPage();
  await screen.findByRole('heading', { name: 'Carga incompleta' });
  expect(screen.queryByRole('heading', { name: 'Aún no hay candidatos' })).toBeNull();
  expect(within(screen.getByRole('region', { name: 'Resumen del Módulo A' })).getAllByText('—')).toHaveLength(3);
});

test('states and appointment sorting tolerate timestamps, absent later modules and legacy events', () => {
  const row = { key: 'e:c', event: { id: 'e' }, candidate: { ...candidate, status: 'INVITATION_SENT', moduleB: undefined } };
  expect(candidateState(row, 'A')).toBe('invited');
  expect(candidateState(row, 'B')).toBe('pending');
  expect(appointmentOf(row, 'B')).toBeNull();
  const unknown = { ...row, key: 'unknown', candidate: { status: 'NEW_STATE' } };
  expect(candidateState(unknown, 'A')).toBe('unknown');
  expect(candidateState({ ...row, candidate: data.e3[0] })).toBe('failed');
  const timestamp = { ...row, key: 'timestamp', candidate: { ...candidate, fechaHoraCita: { _seconds: 1 } } };
  expect(filterCandidateRows([row, unknown, timestamp], { query: '', event: 'all', modality: 'all', module: 'A', status: 'all', sort: 'appointment' }).map((item) => item.key)).toEqual(['timestamp', 'e:c', 'unknown']);
});
