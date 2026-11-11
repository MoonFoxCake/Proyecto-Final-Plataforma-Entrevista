import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CompanyEventsView } from './CompanyEventsView.jsx';
import { availabilityOf, filterCompanyEvents, stateOf } from './companyEvents.js';
import { getEvents } from '../services/eventService.js';
vi.mock('../services/eventService.js', () => ({ getEvents: vi.fn() }));
const events = [
  { id: 'e1', name: 'Profesor de Química', position: 'Profesor', modality: 'onsite', modules: ['A', 'B'], status: 'ACTIVE', onsite: { venue: 'Campus Central', room: 'Laboratorio', startsAt: '2026-11-20T09:00:00' } },
  { id: 'e2', name: 'Profesor de Computación', position: 'Docente', modality: 'online', modules: ['A', 'B', 'C'], status: 'PUBLISHED', availableFrom: '2026-11-21T23:59:59' },
  { id: 'e3', title: 'Profesor de Inglés', status: 'DRAFT', availableFrom: '2026-10-01' },
  { id: 'e4', name: 'Evento sin fecha', status: 'NEW_STATE', modules: ['A'] },
];
const defaults = { query: '', modality: 'all', status: 'all', module: 'all', period: 'all', from: '', until: '', sort: 'recent' };
beforeEach(() => { vi.resetAllMocks(); getEvents.mockResolvedValue(events); });
afterEach(cleanup);
const renderPage = (query = '') => render(<MemoryRouter initialEntries={[`/company-dashboard?section=events${query}`]}><CompanyEventsView /></MemoryRouter>);
const change = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const eventLinks = () => screen.queryAllByRole('link', { name: /^Ver evento / });
const load = async () => { renderPage(); await screen.findByRole('link', { name: 'Ver evento Profesor de Química' }); };

test('combines search, modality, modules and state without extra requests and clears all filters', async () => {
  await load();
  expect(eventLinks()).toHaveLength(4);
  change('Buscar evento', 'quimica laboratorio');
  expect(eventLinks()).toHaveLength(1);
  expect(eventLinks()[0].getAttribute('href')).toBe('/company/events/e1');
  change('Modalidad', 'online');
  expect(screen.getByRole('heading', { name: 'No hay eventos que coincidan' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
  change('Módulos incluidos', 'C');
  change('Estado', 'published');
  expect(eventLinks()).toHaveLength(1);
  expect(eventLinks()[0].textContent).toContain('Con resultados');
  expect(screen.queryByText('Publicado · Activo')).toBeNull();
  expect(getEvents).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
  expect(eventLinks()).toHaveLength(4);
});

test('filters an inclusive date range, reports reversed dates and clears dates when changing periods', async () => {
  await load();
  change('Fecha de habilitación', 'custom');
  change('Desde', '2026-11-20');
  change('Hasta', '2026-11-21');
  expect(eventLinks()).toHaveLength(2);
  change('Desde', '2026-11-22');
  expect(screen.getByRole('alert').textContent).toContain('igual o posterior');
  expect(eventLinks()).toHaveLength(0);
  expect(screen.queryByRole('heading', { name: 'No hay eventos que coincidan' })).toBeNull();
  change('Fecha de habilitación', 'undated');
  expect(screen.queryByRole('alert')).toBeNull();
  expect(eventLinks()).toHaveLength(1);
  change('Fecha de habilitación', 'custom');
  expect(screen.getByLabelText('Desde').value).toBe('');
  expect(screen.getByLabelText('Hasta').value).toBe('');
});

test('orders results and supports direct links with saved filters', async () => {
  renderPage('&modality=online&module=B&sort=name');
  await screen.findByRole('link', { name: 'Ver evento Profesor de Computación' });
  expect(eventLinks().map((link) => link.getAttribute('href'))).toEqual(['/company/events/e2', '/company/events/e3']);
  expect(screen.getByLabelText('Modalidad').value).toBe('online');
  fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
  change('Ordenar por', 'upcoming');
  expect(eventLinks().map((link) => link.getAttribute('href'))).toEqual(['/company/events/e3', '/company/events/e1', '/company/events/e2', '/company/events/e4']);
});

test('paginates and returns to the first page when the search changes', async () => {
  getEvents.mockResolvedValue(Array.from({ length: 11 }, (_, index) => ({ ...events[0], id: `event-${index}`, name: `Evento ${String(index).padStart(2, '0')}` })));
  renderPage('&sort=name');
  await screen.findByRole('link', { name: 'Ver evento Evento 00' });
  expect(eventLinks()).toHaveLength(8);
  fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
  expect(eventLinks()).toHaveLength(3);
  change('Buscar evento', 'Evento 00');
  expect(eventLinks()).toHaveLength(1);
  expect(eventLinks()[0].getAttribute('href')).toBe('/company/events/event-0');
});

test('distinguishes load errors from an empty organization and supports retry', async () => {
  getEvents.mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce([]);
  renderPage();
  await screen.findByRole('alert');
  expect(screen.queryByRole('heading', { name: 'No hay eventos disponibles' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar', exact: true }));
  await screen.findByRole('heading', { name: 'No hay eventos disponibles' });
  expect(screen.getByRole('link', { name: /Crear mi primer evento/ }).getAttribute('href')).toBe('/company/events/new');
});

test('refreshes data while retaining filters and supports collapsible mobile filters', async () => {
  await load();
  fireEvent.click(screen.getByRole('button', { name: 'Más filtros' }));
  expect(screen.getByRole('button', { name: 'Ocultar filtros' }).getAttribute('aria-expanded')).toBe('true');
  change('Modalidad', 'onsite');
  getEvents.mockResolvedValue([events[0]]);
  fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('1 de 1 eventos'));
  expect(screen.getByLabelText('Modalidad').value).toBe('onsite');
  expect(getEvents).toHaveBeenCalledTimes(2);
});

test('calendar presets include full local days and handle timestamps, undated events and legacy modules', () => {
  const now = new Date(2026, 10, 10, 12);
  const dated = [
    { id: 'yesterday', availableFrom: new Date(2026, 10, 9, 23, 59) },
    { id: 'today', availableFrom: new Date(2026, 10, 10, 23, 59, 59, 999) },
    { id: 'week-end', availableFrom: new Date(2026, 10, 16, 23, 59) },
    { id: 'too-late', availableFrom: new Date(2026, 10, 17) },
    { id: 'month-start', availableFrom: new Date(2026, 9, 12) },
    { id: 'too-old', availableFrom: new Date(2026, 9, 11, 23, 59) },
    { id: 'missing', availableFrom: 'invalid-date' },
  ];
  expect(filterCompanyEvents(dated, { ...defaults, period: 'today' }, now).map((event) => event.id)).toEqual(['today']);
  expect(filterCompanyEvents(dated, { ...defaults, period: 'next7' }, now).map((event) => event.id)).toEqual(['week-end', 'today']);
  expect(filterCompanyEvents(dated, { ...defaults, period: 'last30' }, now).map((event) => event.id)).toEqual(['today', 'yesterday', 'month-start']);
  expect(filterCompanyEvents(dated, { ...defaults, period: 'undated' }, now).map((event) => event.id)).toEqual(['missing']);
  expect(availabilityOf({ availableFrom: { _seconds: 0 } }).getTime()).toBe(0);
  expect(availabilityOf({ availableFrom: { seconds: 1 } }).getTime()).toBe(1000);
  expect(availabilityOf({ availableFrom: { toDate: () => new Date(2000) } }).getTime()).toBe(2000);
  expect(filterCompanyEvents([events[2]], { ...defaults, module: 'B' })).toHaveLength(1);
  expect(stateOf({ status: 'ACTIVE', evaluationsPublishedAt: '2026-11-10' })).toBe('published');
  expect(stateOf({ status: 'NEW_STATE' })).toBe('unknown');
});
