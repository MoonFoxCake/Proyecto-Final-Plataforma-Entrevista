import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AdminProcessesView } from './AdminProcessesPage.jsx';
import { getProcesses } from '../services/adminReviewService.js';
import { isClosed, processDate } from './adminProcesses.js';

vi.mock('../services/adminReviewService.js', () => ({ getProcesses: vi.fn() }));

const processes = [
  { id: 'p1', orgId: 'org-1', name: 'Selección de analistas', company: 'TEC', position: 'Analista financiero', status: 'IN_REVIEW', availableFrom: '2026-11-02', summary: { totalParticipants: 10, responsesReceived: 6, reviewed: 2 } },
  { id: 'p2', orgId: 'org-2', name: 'Programa anterior', company: 'TEC', position: 'Desarrollador', status: 'PUBLISHED', availableFrom: '2026-10-01', summary: { totalParticipants: 3, responsesReceived: 3, reviewed: 3 } },
  { id: 'p3', orgId: 'org-1', name: 'Talento universitario', company: 'TEC', position: 'Asistente', status: 'READY_TO_PUBLISH', availableFrom: '2026-11-01', summary: { totalParticipants: 2, responsesReceived: 2, reviewed: 2 } },
  { id: 'p4', orgId: 'org-3', name: 'Sin participantes', company: 'UCR', status: 'ACTIVE' },
];
const change = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const cards = () => within(screen.getByRole('region', { name: 'Resultados de procesos' })).queryAllByRole('article');

beforeEach(() => {
  vi.resetAllMocks();
  getProcesses.mockResolvedValue(processes);
});
afterEach(cleanup);

function renderPage() {
  render(<MemoryRouter><Routes><Route path="/" element={<AdminProcessesView />} /><Route path="/admin/processes/:id" element={<h1>Detalle del proceso</h1>} /></Routes></MemoryRouter>);
}

test('combines search, company IDs and status filters without mixing companies with the same name', async () => {
  renderPage();
  await screen.findByRole('heading', { name: 'Selección de analistas' });
  change('Buscar proceso', 'seleccion');
  expect(cards()).toHaveLength(1);
  change('Empresa', 'org-2');
  expect(screen.getByText('No encontramos procesos con estos filtros')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
  change('Empresa', 'org-1');
  change('Estado de evaluación', 'READY_TO_PUBLISH');
  expect(cards()).toHaveLength(1);
  expect(within(cards()[0]).getByRole('heading', { name: 'Talento universitario' })).toBeTruthy();
});

test('prioritizes review tasks and shows meaningful progress and unanswered counts', async () => {
  renderPage();
  await screen.findByRole('heading', { name: 'Selección de analistas' });
  fireEvent.click(screen.getByRole('button', { name: 'Por revisar', exact: true }));
  expect(cards()).toHaveLength(1);
  expect(within(cards()[0]).getByText('4 participantes sin responder · 4 respuestas por revisar.')).toBeTruthy();
  expect(within(cards()[0]).getByRole('progressbar').getAttribute('aria-valuenow')).toBe('20');
  fireEvent.click(screen.getByRole('button', { name: 'Listos para publicar', exact: true }));
  expect(cards()).toHaveLength(1);
  expect(within(cards()[0]).getByRole('heading', { name: 'Talento universitario' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Publicados', exact: true }));
  expect(within(cards()[0]).getByRole('heading', { name: 'Programa anterior' })).toBeTruthy();
});

test('includes the whole final day in date filters, excludes missing dates and validates backwards ranges', async () => {
  getProcesses.mockResolvedValue([...processes, { ...processes[0], id: 'late', name: 'Turno nocturno', availableFrom: '2026-11-02T23:59:00' }]);
  renderPage();
  await screen.findByRole('heading', { name: 'Turno nocturno' });
  change('Fecha de inicio desde', '2026-11-02');
  change('Fecha de inicio hasta', '2026-11-02');
  expect(cards()).toHaveLength(2);
  expect(screen.queryByRole('heading', { name: 'Sin participantes' })).toBeNull();
  change('Fecha de inicio hasta', '2026-11-01');
  expect((await screen.findByRole('alert')).textContent).toContain('La fecha desde debe ser anterior o igual');
  expect(screen.getByLabelText('Fecha de inicio hasta').getAttribute('aria-invalid')).toBe('true');
  expect(cards()).toHaveLength(0);
});

test('sorts by date, review workload and name while keeping undated processes last', async () => {
  renderPage();
  await screen.findByRole('heading', { name: 'Selección de analistas' });
  change('Ordenar por', 'oldest');
  expect(within(cards()[0]).getByRole('heading', { name: 'Programa anterior' })).toBeTruthy();
  expect(within(cards().at(-1)).getByRole('heading', { name: 'Sin participantes' })).toBeTruthy();
  change('Ordenar por', 'pending');
  expect(within(cards()[0]).getByRole('heading', { name: 'Selección de analistas' })).toBeTruthy();
  change('Ordenar por', 'name');
  expect(within(cards()[0]).getByRole('heading', { name: 'Programa anterior' })).toBeTruthy();
});

test('separates history from current processes without treating an old start date as a closing date', async () => {
  getProcesses.mockResolvedValue([
    { ...processes[0], availableFrom: '2020-01-01' },
    processes[1],
    { ...processes[2], endDate: '2020-12-31' },
  ]);
  renderPage();
  await screen.findByRole('heading', { name: 'Selección de analistas' });
  change('Vigencia', 'current');
  expect(cards()).toHaveLength(1);
  expect(within(cards()[0]).getByRole('heading', { name: 'Selección de analistas' })).toBeTruthy();
  change('Vigencia', 'previous');
  expect(cards()).toHaveLength(2);
  expect(screen.queryByRole('heading', { name: 'Selección de analistas' })).toBeNull();
});

test('handles missing summaries and links to the existing detail page', async () => {
  renderPage();
  await screen.findByRole('heading', { name: 'Sin participantes' });
  expect(screen.getByText('Este proceso aún no tiene participantes.')).toBeTruthy();
  fireEvent.click(screen.getByRole('link', { name: 'Ver proceso: Sin participantes' }));
  expect(await screen.findByRole('heading', { name: 'Detalle del proceso' })).toBeTruthy();
});

test('recovers from request errors and does not present a failed request as an empty list', async () => {
  getProcesses.mockRejectedValueOnce(new Error('Network failed'));
  renderPage();
  expect((await screen.findByRole('alert')).textContent).toContain('No se pudieron cargar los procesos');
  expect(screen.queryByText('Aún no hay procesos registrados')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  expect(await screen.findByRole('heading', { name: 'Selección de analistas' })).toBeTruthy();
});

test('paginates all processes and resets to the first page after changing filters', async () => {
  getProcesses.mockResolvedValue(Array.from({ length: 8 }, (_, index) => ({ ...processes[0], id: `p${index}`, name: `Proceso ${index}`, availableFrom: '2026-11-01' })));
  renderPage();
  await screen.findByRole('heading', { name: 'Proceso 0' });
  expect(cards()).toHaveLength(6);
  fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
  expect(cards()).toHaveLength(2);
  change('Buscar proceso', 'Proceso 0');
  expect(cards()).toHaveLength(1);
  expect(screen.getByRole('heading', { name: 'Proceso 0' })).toBeTruthy();
  expect(screen.queryByRole('navigation', { name: 'Páginas de procesos' })).toBeNull();
});

test('preserves calendar dates and keeps a date-only closing day open until midnight', () => {
  expect(processDate('2026-11-10').getDate()).toBe(10);
  expect(isClosed({ status: 'ACTIVE', endDate: '2026-11-10' }, new Date(2026, 10, 10, 12))).toBe(false);
  expect(isClosed({ status: 'ACTIVE', endDate: '2026-11-10' }, new Date(2026, 10, 11))).toBe(true);
  expect(processDate({ _seconds: 0 }).getTime()).toBe(0);
});
