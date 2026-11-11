import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AdminResultsView } from './AdminProcessesPage.jsx';
import { getProcesses } from '../services/adminReviewService.js';
import { isClosed, processDate, resultState } from './adminProcesses.js';

vi.mock('../services/adminReviewService.js', () => ({ getProcesses: vi.fn() }));

const processes = [
  { id: 'p1', orgId: 'org-1', name: 'Selección de analistas', company: 'TEC', position: 'Analista financiero', createdAt: '2026-11-05', availableFrom: '2026-11-06', reports: { A: 'DELIVERED', B: 'PENDING' }, summary: { totalParticipants: 10, responsesReceived: 6 } },
  { id: 'p2', orgId: 'org-2', name: 'Programa anterior', company: 'TEC', position: 'Desarrollador', createdAt: '2026-10-01', availableFrom: '2026-10-02', reports: { A: 'DELIVERED' }, summary: { totalParticipants: 3, responsesReceived: 3 } },
  { id: 'p3', orgId: 'org-1', name: 'Talento universitario', company: 'TEC', position: 'Asistente', createdAt: '2026-11-01', availableFrom: '2026-11-02', reports: { A: 'IN_PROGRESS', B: 'NOT_STARTED' }, summary: { totalParticipants: 2, responsesReceived: 1 } },
  { id: 'p4', orgId: 'org-3', name: 'Sin participantes', company: 'UCR', reports: { A: 'NOT_STARTED' } },
];
const change = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const cards = () => within(screen.getByRole('region', { name: 'Resultados de procesos' })).queryAllByRole('article');
const names = () => cards().map((card) => within(card).getByRole('heading').textContent);

beforeEach(() => {
  vi.resetAllMocks();
  getProcesses.mockResolvedValue(processes);
});
afterEach(cleanup);

function renderPage() {
  render(<MemoryRouter><Routes><Route path="/" element={<AdminResultsView />} /><Route path="/admin/processes/:id" element={<h1>Detalle del proceso</h1>} /></Routes></MemoryRouter>);
}

test('shows each phase of every process with what it needs and highlights pending PDFs', async () => {
  renderPage();
  await screen.findByRole('heading', { name: 'Selección de analistas' });
  expect(screen.getByRole('heading', { name: 'Resultados', level: 1 })).toBeTruthy();
  const first = cards()[0];
  expect(within(first).getByText('PDF por entregar', { selector: 'span' })).toBeTruthy();
  expect(within(within(first).getByRole('list')).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Fase A · PDF entregado', 'Fase B · PDF por entregar']);
  expect(screen.getByText(/Hay 1 fase terminada/)).toBeTruthy();
  fireEvent.click(within(first).getByRole('link', { name: 'Abrir resultados: Selección de analistas' }));
  expect(await screen.findByRole('heading', { name: 'Detalle del proceso' })).toBeTruthy();
});

test('filters by result state and goes straight to what waits for its PDF', async () => {
  renderPage();
  await screen.findByRole('heading', { name: 'Selección de analistas' });
  fireEvent.click(screen.getByRole('button', { name: /Ver pendientes/ }));
  expect(names()).toEqual(['Selección de analistas']);
  fireEvent.click(screen.getByRole('button', { name: 'En curso', exact: true }));
  expect(names()).toEqual(['Talento universitario']);
  fireEvent.click(screen.getByRole('button', { name: 'Entregados', exact: true }));
  expect(names()).toEqual(['Programa anterior']);
});

test('sorts from the most recent or the oldest, by pending PDFs and by name', async () => {
  renderPage();
  await screen.findByRole('heading', { name: 'Selección de analistas' });
  expect(names()).toEqual(['Selección de analistas', 'Talento universitario', 'Programa anterior', 'Sin participantes']);
  change('Ordenar por', 'oldest');
  expect(names()).toEqual(['Programa anterior', 'Talento universitario', 'Selección de analistas', 'Sin participantes']);
  change('Ordenar por', 'pending');
  expect(names()[0]).toBe('Selección de analistas');
  change('Ordenar por', 'name');
  expect(names()[0]).toBe('Programa anterior');
});

test('combines search and company filters without mixing companies with the same name', async () => {
  renderPage();
  await screen.findByRole('heading', { name: 'Selección de analistas' });
  change('Buscar proceso', 'seleccion');
  expect(cards()).toHaveLength(1);
  change('Empresa', 'org-2');
  expect(screen.getByText('No encontramos procesos con estos filtros')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
  change('Empresa', 'org-1');
  expect(names()).toEqual(['Selección de analistas', 'Talento universitario']);
});

test('validates backwards date ranges', async () => {
  renderPage();
  await screen.findByRole('heading', { name: 'Selección de analistas' });
  change('Fecha de inicio desde', '2026-11-06');
  change('Fecha de inicio hasta', '2026-11-06');
  expect(names()).toEqual(['Selección de analistas']);
  change('Fecha de inicio hasta', '2026-11-01');
  expect((await screen.findByRole('alert')).textContent).toContain('La fecha desde debe ser anterior o igual');
  expect(cards()).toHaveLength(0);
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
  getProcesses.mockResolvedValue(Array.from({ length: 8 }, (_, index) => ({ ...processes[0], id: `p${index}`, name: `Proceso ${index}` })));
  renderPage();
  await screen.findByRole('heading', { name: 'Proceso 0' });
  expect(cards()).toHaveLength(6);
  fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
  expect(cards()).toHaveLength(2);
  change('Buscar proceso', 'Proceso 0');
  expect(cards()).toHaveLength(1);
  expect(screen.queryByRole('navigation', { name: 'Páginas de procesos' })).toBeNull();
});

test('a process is finished when all its results were delivered or its closing day passed', () => {
  expect(resultState(processes[0])).toBe('PENDING');
  expect(resultState(processes[1])).toBe('DELIVERED');
  expect(resultState(processes[2])).toBe('IN_PROGRESS');
  expect(resultState(processes[3])).toBe('NOT_STARTED');
  expect(isClosed(processes[1])).toBe(true);
  expect(processDate('2026-11-10').getDate()).toBe(10);
  expect(isClosed({ reports: { A: 'IN_PROGRESS' }, endDate: '2026-11-10' }, new Date(2026, 10, 10, 12))).toBe(false);
  expect(isClosed({ reports: { A: 'IN_PROGRESS' }, endDate: '2026-11-10' }, new Date(2026, 10, 11))).toBe(true);
});
