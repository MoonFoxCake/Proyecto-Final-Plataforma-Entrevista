import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { CompanyDashboardPage } from './CompanyDashboardPage.jsx';
import * as subscriptions from '../services/subscriptionService.js';
import * as events from '../services/eventService.js';
vi.mock('../services/subscriptionService.js', () => ({ getSubscription: vi.fn() }));
vi.mock('../services/eventService.js', () => ({ getEvents: vi.fn(), getEventCandidates: vi.fn() }));
vi.mock('../services/authService.js', () => ({ logout: vi.fn() }));
const plan = { companyName: 'Empresa de prueba', subscription: { planId: 'fase-a', status: 'active' } };
const navButton = (name) => within(screen.getByRole('navigation', { name: 'Navegación de empresa' })).getByRole('button', { name });
function PlansLocation() { const location = useLocation(); return <p>Planes: {location.search}</p>; }
const renderPage = (path = '/company-dashboard') => render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/company-dashboard" element={<CompanyDashboardPage />} /><Route path="/planes" element={<PlansLocation />} /></Routes></MemoryRouter>);
beforeEach(() => { vi.resetAllMocks(); events.getEvents.mockResolvedValue([]); subscriptions.getSubscription.mockResolvedValue(plan); });
afterEach(cleanup);

test('removes subscription details from routine sections and loads them only on demand', async () => {
  renderPage();
  await waitFor(() => expect(events.getEvents).toHaveBeenCalled());
  expect(screen.queryByRole('region', { name: 'Tu plan actual' })).toBeNull();
  expect(subscriptions.getSubscription).not.toHaveBeenCalled();
  fireEvent.click(navButton(/Candidatos/));
  expect(screen.getByRole('heading', { name: 'Candidatos' })).toBeTruthy();
  expect(subscriptions.getSubscription).not.toHaveBeenCalled();
  fireEvent.click(navButton(/Mi plan/));
  expect(await screen.findByRole('heading', { name: 'Fase A' })).toBeTruthy();
  expect(subscriptions.getSubscription).toHaveBeenCalledTimes(1);
  expect(navButton(/Mi plan/).getAttribute('aria-current')).toBe('page');
  expect(screen.getByText('Plan activo')).toBeTruthy();
  expect(screen.getByText('Empresa de prueba')).toBeTruthy();
  expect(screen.getByText('Incluido')).toBeTruthy();
  expect(screen.getAllByText('Disponible en otro plan')).toHaveLength(2);
  fireEvent.click(navButton(/Eventos/));
  await screen.findByText('No hay eventos disponibles');
  expect(screen.queryByRole('heading', { name: 'Fase A' })).toBeNull();
});

test('the dashboard puts what needs the company first, with the reports received and the next step of each process', async () => {
  const deliveredAt = new Date().toISOString();
  events.getEvents.mockResolvedValue([
    { id: 'e1', name: 'Concurso Analistas', modality: 'online', modules: ['A', 'B'], position: 'Analista', moduleResults: { A: { deliveredAt } } },
  ]);
  events.getEventCandidates.mockResolvedValue([{ id: 'c1', status: 'EVALUATION_COMPLETED', submittedAt: deliveredAt }]);
  renderPage();
  const pending = await screen.findByRole('region', { name: 'Pendientes' });
  expect(within(pending).getByText('Concurso Analistas: recibiste el PDF de la Fase A')).toBeTruthy();
  expect(within(pending).getByRole('link', { name: 'Elegir →' }).getAttribute('href')).toBe('/company/events/e1/resultados');
  expect(within(screen.getByRole('region', { name: 'Resultados recientes' })).getByRole('button', { name: 'Descargar PDF' })).toBeTruthy();
  expect(within(screen.getByRole('region', { name: 'Procesos activos' })).getByRole('link', { name: 'Elige quién continúa a la Fase B' })).toBeTruthy();
  expect(within(screen.getByRole('region', { name: 'Indicadores' })).getByText('Informes recibidos')).toBeTruthy();
  // Only virtual processes: no onsite attendance chart.
  expect(screen.queryByText('Asistencia presencial')).toBeNull();
});

test('supports direct access to the plan and preserves the existing plan-management route', async () => {
  subscriptions.getSubscription.mockResolvedValue({ ...plan, subscription: { planId: 'COMPLETE', status: 'active' } });
  renderPage('/company-dashboard?section=subscription');
  await screen.findByRole('heading', { name: 'Plan completo' });
  expect(screen.getAllByText('Incluido')).toHaveLength(3);
  expect(screen.queryByText(/Función pendiente/)).toBeNull();
  expect(events.getEvents).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('link', { name: 'Ver planes' }));
  expect(screen.getByText('Planes: ?mode=manage')).toBeTruthy();
});

test('offers a retry without inventing a default plan when loading fails', async () => {
  subscriptions.getSubscription.mockRejectedValueOnce(new Error('Offline'));
  renderPage('/company-dashboard?section=subscription');
  expect((await screen.findByRole('alert')).textContent).toContain('No pudimos consultar tu plan');
  expect(screen.queryByRole('heading', { name: 'Fase A' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Volver a intentar' }));
  expect(await screen.findByRole('heading', { name: 'Fase A' })).toBeTruthy();
});

test.each([null, { subscription: { planId: 'unrecognized', status: 'active' } }])('handles absent or unrecognized subscription data: %j', async (data) => {
  subscriptions.getSubscription.mockResolvedValue(data);
  renderPage('/company-dashboard?section=subscription');
  await screen.findByRole('alert');
  expect(screen.queryByRole('region', { name: 'Tu plan actual' })).toBeNull();
});

test('reloads subscription details when returning from another section', async () => {
  renderPage('/company-dashboard?section=subscription');
  await screen.findByRole('heading', { name: 'Fase A' });
  fireEvent.click(navButton(/Candidatos/));
  subscriptions.getSubscription.mockResolvedValue({ ...plan, subscription: { planId: 'fase-a-b', status: 'pending_simulation' } });
  fireEvent.click(navButton(/Mi plan/));
  await screen.findByRole('heading', { name: 'Fase A + B' });
  expect(screen.getByText('Plan activo')).toBeTruthy();
  expect(subscriptions.getSubscription).toHaveBeenCalledTimes(2);
});
