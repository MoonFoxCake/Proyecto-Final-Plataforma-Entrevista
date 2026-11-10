import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CompaniesView } from './AdminCompaniesView.jsx';
import { getCompanies } from '../services/authService.js';
import { getProcesses } from '../services/adminReviewService.js';

vi.mock('../services/authService.js', () => ({ getCompanies: vi.fn() }));
vi.mock('../services/adminReviewService.js', () => ({ getProcesses: vi.fn() }));

const companies = [
  { id: 'org-1', companyName: 'Empresa Uno', subscription: { planId: 'fase-a' }, users: [{ id: 'u1', displayName: 'María Jiménez', email: 'maria@uno.com' }] },
  { id: 'org-2', companyName: 'Empresa Dos', subscription: { planId: 'completo' }, users: [] },
];
const processes = [
  { id: 'p1', orgId: 'org-1', name: 'Selección actual', status: 'IN_REVIEW', summary: { totalParticipants: 4 } },
  { id: 'p2', orgId: 'org-1', name: 'Selección publicada', status: 'PUBLISHED' },
  { id: 'p3', orgId: 'org-1', name: 'Selección vencida', status: 'ACTIVE', endDate: '2020-01-01' },
  { id: 'p4', orgId: 'org-2', name: 'Otro proceso', status: 'ACTIVE' },
];

beforeEach(() => {
  vi.resetAllMocks();
  getCompanies.mockResolvedValue(companies);
  getProcesses.mockResolvedValue(processes);
});
afterEach(cleanup);

function renderPage() {
  render(<MemoryRouter><Routes><Route path="/" element={<CompaniesView />} /><Route path="/admin/processes/:id" element={<h1>Detalle del proceso</h1>} /></Routes></MemoryRouter>);
}
const openCompany = (name = 'Empresa Uno') => fireEvent.click(screen.getByRole('button', { name: new RegExp(name) }));

test('replaces registration with a searchable company and user directory', async () => {
  renderPage();
  await screen.findByText('Empresa Uno');
  expect(screen.queryByText('Nueva cuenta')).toBeNull();
  expect(screen.queryByText('Crear usuario de empresa')).toBeNull();
  fireEvent.change(screen.getByLabelText('Buscar empresa o usuario'), { target: { value: 'maria jimenez' } });
  expect(screen.getByText('Empresa Uno')).toBeTruthy();
  expect(screen.queryByText('Empresa Dos')).toBeNull();
  openCompany();
  expect(screen.getByText('maria@uno.com')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
  expect(screen.getByText('Empresa Dos')).toBeTruthy();
});

test('separates current processes from published and expired ones and opens their details', async () => {
  renderPage();
  await screen.findByText('Empresa Uno');
  openCompany();
  expect(screen.getByText('Selección actual')).toBeTruthy();
  expect(screen.queryByText('Selección publicada')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Anteriores 2' }));
  expect(screen.getByText('Selección publicada')).toBeTruthy();
  expect(screen.getByText('Selección vencida')).toBeTruthy();
  expect(screen.queryByText('Selección actual')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Activos 1' }));
  fireEvent.click(screen.getByRole('link', { name: 'Ver proceso' }));
  expect(await screen.findByRole('heading', { name: 'Detalle del proceso' })).toBeTruthy();
});

test('associates processes by organization ID even when companies have identical names', async () => {
  getCompanies.mockResolvedValue(companies.map((company) => ({ ...company, companyName: 'Mismo nombre' })));
  renderPage();
  await screen.findAllByText('Mismo nombre');
  fireEvent.click(screen.getAllByRole('button', { name: /Mismo nombre/ })[1]);
  expect(screen.getByText('Otro proceso')).toBeTruthy();
  expect(screen.queryByText('Selección actual')).toBeNull();
});

test('preserves calendar-only dates without shifting them to the previous day', async () => {
  getProcesses.mockResolvedValue([{ ...processes[0], availableFrom: '2026-11-01' }]);
  renderPage();
  await screen.findByText('Empresa Uno');
  openCompany();
  const expectedDate = new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium' }).format(new Date(2026, 10, 1));
  expect(screen.getByText(expectedDate)).toBeTruthy();
});

test('combines plan and activity filters and handles companies without users or processes', async () => {
  getCompanies.mockResolvedValue([...companies, { id: 'org-3', companyName: 'Sin actividad', users: [] }]);
  renderPage();
  await screen.findByText('Empresa Uno');
  fireEvent.change(screen.getByLabelText('Plan contratado'), { target: { value: 'completo' } });
  expect(screen.getByText('Empresa Dos')).toBeTruthy();
  expect(screen.queryByText('Empresa Uno')).toBeNull();
  fireEvent.change(screen.getByLabelText('Actividad de procesos'), { target: { value: 'previous' } });
  expect(screen.getByText('No encontramos empresas con estos filtros')).toBeTruthy();
  fireEvent.click(screen.getByText('Limpiar filtros'));
  fireEvent.change(screen.getByLabelText('Actividad de procesos'), { target: { value: 'none' } });
  openCompany('Sin actividad');
  expect(screen.getByText('Esta empresa aún no tiene usuarios asociados.')).toBeTruthy();
  expect(screen.getByText('Esta empresa aún no tiene procesos.')).toBeTruthy();
});

test('keeps users available on process request failure and recovers on retry', async () => {
  getProcesses.mockRejectedValueOnce(new Error('Connection failed'));
  renderPage();
  await screen.findByText('Empresa Uno');
  expect(screen.getByLabelText('Actividad de procesos').disabled).toBe(true);
  openCompany();
  expect(screen.getByText('maria@uno.com')).toBeTruthy();
  expect(screen.queryByText('Esta empresa aún no tiene procesos.')).toBeNull();
  fireEvent.click(within(screen.getAllByRole('alert')[0]).getByRole('button', { name: 'Reintentar' }));
  await screen.findByText('Selección actual');
  expect(screen.getByLabelText('Actividad de procesos').disabled).toBe(false);
});

test('shows company load errors with retry instead of a misleading empty directory', async () => {
  getCompanies.mockRejectedValueOnce(new Error('Connection failed'));
  renderPage();
  expect((await screen.findByRole('alert')).textContent).toContain('No se pudieron cargar las empresas.');
  expect(screen.queryByText('Aún no hay empresas registradas')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  expect(await screen.findByText('Empresa Uno')).toBeTruthy();
});

test('makes all companies reachable through pagination and resets the page on search', async () => {
  getCompanies.mockResolvedValue(Array.from({ length: 10 }, (_, index) => ({ id: `org-${index}`, companyName: `Empresa ${String(index + 1).padStart(2, '0')}`, users: [] })));
  renderPage();
  await screen.findByText('Empresa 01');
  expect(screen.queryByText('Empresa 09')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
  expect(screen.getByText('Empresa 10')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Buscar empresa o usuario'), { target: { value: 'Empresa 01' } });
  expect(screen.getByText('Empresa 01')).toBeTruthy();
  expect(screen.queryByRole('navigation', { name: 'Páginas de empresas' })).toBeNull();
});
