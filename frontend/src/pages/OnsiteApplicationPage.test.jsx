import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { OnsiteApplicationPage } from './OnsiteApplicationPage.jsx';
import * as onsiteService from '../services/onsiteService.js';
import * as eventService from '../services/eventService.js';
import * as credentialService from '../services/credentialService.js';

vi.mock('../services/onsiteService.js', () => ({
  getRoster: vi.fn(),
  setAttendance: vi.fn(),
  enableCredentials: vi.fn(),
}));
vi.mock('../services/eventService.js', () => ({ getEvent: vi.fn() }));
vi.mock('../components/company/CompanySidebar.jsx', () => ({ CompanySidebar: () => <nav /> }));
vi.mock('../services/credentialService.js', () => ({ reissueCredential: vi.fn() }));

const SESSION = { venue: 'Campus Central', room: 'Aula 204', startsAt: '2026-11-05T14:00:00.000Z', endsAt: '2026-11-05T16:00:00.000Z' };
const EXPIRES = '2026-11-06T05:59:59.999Z';

const row = (overrides) => ({
  appointmentAt: SESSION.startsAt, attendance: null, credential: { id: `cred-${overrides.candidateId}`, status: 'GENERATED', expiresAt: EXPIRES }, evaluation: 'PENDING', ...overrides,
});

function roster(rows, extra = {}) {
  return {
    module: 'A',
    isAppointmentDay: true,
    rows,
    counts: {
      cited: rows.length,
      present: rows.filter((item) => item.attendance).length,
      enabled: rows.filter((item) => item.credential?.status === 'ENABLED').length,
      inProgress: rows.filter((item) => item.evaluation === 'IN_PROGRESS').length,
      completed: rows.filter((item) => item.evaluation === 'COMPLETED').length,
    },
    ...extra,
  };
}

const ROWS = [
  row({ candidateId: 'c1', nombreCompleto: 'Ana López', cedula: '100', attendance: { status: 'PRESENT', markedAt: '2026-11-05T14:05:00.000Z' } }),
  row({ candidateId: 'c2', nombreCompleto: 'Bruno Díaz', cedula: '200' }),
  row({ candidateId: 'c3', nombreCompleto: 'Carla Méndez', cedula: '300', attendance: { status: 'PRESENT', markedAt: '2026-11-05T14:06:00.000Z' }, credential: { id: 'cred-c3', status: 'ENABLED', expiresAt: EXPIRES } }),
  row({ candidateId: 'c4', nombreCompleto: 'Diego Ramírez', cedula: '400', credential: null, evaluation: 'COMPLETED' }),
];

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/company/events/event-1/onsite']}>
      <Routes><Route path='/company/events/:eventId/onsite' element={<OnsiteApplicationPage />} /></Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.confirm = vi.fn(() => true);
  eventService.getEvent.mockResolvedValue({ id: 'event-1', name: 'Concurso Presencial', modality: 'onsite', modules: ['A'], onsite: SESSION });
  onsiteService.getRoster.mockResolvedValue(roster(ROWS));
});

test('shows the roster with attendance, access and evaluation, and enables only present candidates in bulk', async () => {
  onsiteService.enableCredentials.mockResolvedValue({ module: 'A', enabled: [{ candidateId: 'c1', nombreCompleto: 'Ana López' }], skipped: [] });
  renderPage();

  expect(await screen.findByText('Ana López')).toBeTruthy();
  expect(screen.getByText('Cédula 200')).toBeTruthy();
  expect(within(screen.getByText('Carla Méndez').closest('tr')).getByText('Habilitado')).toBeTruthy();
  expect(within(screen.getByText('Diego Ramírez').closest('tr')).getByText('Completada')).toBeTruthy();

  // Only Ana: present with a prepared code (Bruno is not present, Carla already enabled).
  fireEvent.click(screen.getByRole('button', { name: 'Habilitar presentes (1)' }));
  expect(window.confirm.mock.calls[0][0]).toMatch(/1 candidato\(s\) marcados como presentes: Ana López/);
  await waitFor(() => expect(onsiteService.enableCredentials).toHaveBeenCalledWith('event-1', 'A', ['c1']));
  expect(await screen.findByText(/Se habilitó el acceso de 1 candidato/)).toBeTruthy();
});

test('marks a candidate present after confirming the identity check', async () => {
  onsiteService.setAttendance.mockResolvedValue({ status: 'PRESENT' });
  renderPage();

  const bruno = (await screen.findByText('Bruno Díaz')).closest('tr');
  expect(within(bruno).queryByRole('button', { name: 'Habilitar' })).toBeNull();
  fireEvent.click(within(bruno).getByRole('button', { name: 'Marcar presente' }));

  expect(window.confirm.mock.calls[0][0]).toBe('¿Verificaste la identidad de Bruno Díaz con su documento (cédula 200)?');
  await waitFor(() => expect(onsiteService.setAttendance).toHaveBeenCalledWith('event-1', 'A', 'c2', true));
});

test('enables one present candidate and shows why others could not be enabled', async () => {
  onsiteService.enableCredentials.mockResolvedValue({ module: 'A', enabled: [], skipped: [{ candidateId: 'c1', nombreCompleto: 'Ana López', reason: 'su acceso venció' }] });
  renderPage();

  const ana = (await screen.findByText('Ana López')).closest('tr');
  fireEvent.click(within(ana).getByRole('button', { name: 'Habilitar' }));
  await waitFor(() => expect(onsiteService.enableCredentials).toHaveBeenCalledWith('event-1', 'A', ['c1']));
  expect((await screen.findByRole('alert')).textContent).toMatch(/Ana López: su acceso venció/);
});

test('filters by attendance, access and evaluation, and searches by name or ID', async () => {
  renderPage();
  await screen.findByText('Ana López');

  fireEvent.change(screen.getByLabelText('Filtrar por asistencia'), { target: { value: 'present' } });
  expect(screen.queryByText('Bruno Díaz')).toBeNull();
  expect(screen.getByText('Carla Méndez')).toBeTruthy();

  fireEvent.change(screen.getByLabelText('Filtrar por acceso'), { target: { value: 'ENABLED' } });
  expect(screen.queryByText('Ana López')).toBeNull();

  fireEvent.change(screen.getByLabelText('Filtrar por asistencia'), { target: { value: 'all' } });
  fireEvent.change(screen.getByLabelText('Filtrar por acceso'), { target: { value: 'all' } });
  fireEvent.change(screen.getByLabelText('Filtrar por evaluación'), { target: { value: 'COMPLETED' } });
  expect(screen.getByText('Diego Ramírez')).toBeTruthy();
  expect(screen.queryByText('Ana López')).toBeNull();

  fireEvent.change(screen.getByLabelText('Filtrar por evaluación'), { target: { value: 'all' } });
  fireEvent.change(screen.getByLabelText('Buscar candidato'), { target: { value: '200' } });
  expect(screen.getByText('Bruno Díaz')).toBeTruthy();
  expect(screen.queryByText('Ana López')).toBeNull();
});

test('recovers an interrupted session: a new code is shown once on screen', async () => {
  const inProgress = row({
    candidateId: 'c5', nombreCompleto: 'Elena Castillo', cedula: '500', attendance: { status: 'PRESENT', markedAt: '2026-11-05T14:07:00.000Z' },
    credential: { id: 'cred-c5', status: 'USED', expiresAt: EXPIRES }, evaluation: 'IN_PROGRESS',
  });
  onsiteService.getRoster.mockResolvedValue(roster([...ROWS, inProgress]));
  credentialService.reissueCredential.mockResolvedValue({
    module: 'A', issued: [{ credentialId: 'new', candidateId: 'c5', nombreCompleto: 'Elena Castillo', module: 'A', code: 'PQ7RS-2TUV3', expiresAt: EXPIRES, appointment: SESSION }], skipped: [], rejected: [],
  });
  window.prompt = vi.fn(() => 'Se cerró el navegador');
  renderPage();

  const elena = (await screen.findByText('Elena Castillo')).closest('tr');
  // Completed evaluations cannot be recovered.
  expect(within(screen.getByText('Diego Ramírez').closest('tr')).queryByRole('button', { name: /Recuperar|Reemitir/ })).toBeNull();
  fireEvent.click(within(elena).getByRole('button', { name: 'Recuperar acceso' }));

  expect(window.prompt.mock.calls[0][0]).toMatch(/solo funcionará en la misma computadora/);
  await waitFor(() => expect(credentialService.reissueCredential).toHaveBeenCalledWith('event-1', 'cred-c5', 'Se cerró el navegador'));
  expect(within(await screen.findByRole('dialog')).getByText('PQ7RS-2TUV3')).toBeTruthy();
  expect(screen.getByText(/Habilítalo para que pueda ingresar/)).toBeTruthy();
});

test('outside the appointment day the actions are disabled with an explanation', async () => {
  onsiteService.getRoster.mockResolvedValue(roster(ROWS, { isAppointmentDay: false }));
  renderPage();

  expect(await screen.findByText(/Hoy no es el día de la cita/)).toBeTruthy();
  const bruno = screen.getByText('Bruno Díaz').closest('tr');
  expect(within(bruno).getByRole('button', { name: 'Marcar presente' }).disabled).toBe(true);
});
