import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import * as eventService from '../../services/eventService.js';
import * as credentialService from '../../services/credentialService.js';
import * as onsiteService from '../../services/onsiteService.js';
import { saveFile } from '../../utils/download.js';
import { ONSITE_EVENT, SESSION, renderEvent } from './renderEvent.test-utils.jsx';

vi.mock('../../services/eventService.js', () => ({ getEvent: vi.fn(), getEventCandidates: vi.fn() }));
vi.mock('../../services/credentialService.js', () => ({
  getCredentials: vi.fn(),
  issueCredentials: vi.fn(),
  revokeCredential: vi.fn(),
  reissueCredential: vi.fn(),
  getAttendanceSheet: vi.fn(),
}));
vi.mock('../../services/onsiteService.js', () => ({ getRoster: vi.fn(), setAttendance: vi.fn(), enableCredentials: vi.fn() }));
vi.mock('../../utils/download.js', () => ({ saveFile: vi.fn(), base64ToBlob: vi.fn((base64, type) => ({ base64, type })) }));
vi.mock('../../components/company/CompanySidebar.jsx', () => ({ CompanySidebar: () => <nav aria-label='Menú' /> }));

const EXPIRES = '2026-11-06T05:59:59.999Z';
const PREPARE_ROWS = [
  { candidateId: 'c1', nombreCompleto: 'Ana López', canIssue: true, credential: null },
  { candidateId: 'c2', nombreCompleto: 'Bruno Díaz', canIssue: true, credential: { id: 'cred-2', status: 'GENERATED', expiresAt: EXPIRES } },
  { candidateId: 'c3', nombreCompleto: 'Zoe Ruiz', canIssue: true, credential: null },
  { candidateId: 'c4', nombreCompleto: 'Ya Evaluada', canIssue: false, blockedReason: 'ya completó el Módulo A', credential: null },
];
const counts = { total: 4, prepared: 1, enabled: 0, used: 0, revoked: 0, expired: 0, pending: 3 };
const issued = (items) => ({ module: 'A', issued: items.map((item) => ({ module: 'A', expiresAt: EXPIRES, appointment: SESSION, ...item })), skipped: [], rejected: [], cardsPdf: { fileName: 'credenciales-acceso.pdf', contentType: 'application/pdf', base64: 'JVBERi0=' } });

const rosterRow = (overrides) => ({ appointmentAt: SESSION.startsAt, attendance: null, credential: { id: `cred-${overrides.candidateId}`, status: 'GENERATED', expiresAt: EXPIRES }, evaluation: 'PENDING', ...overrides });
const ROSTER = [
  rosterRow({ candidateId: 'c1', nombreCompleto: 'Ana López', cedula: '100', attendance: { status: 'PRESENT', markedAt: '2026-11-05T14:05:00.000Z' } }),
  rosterRow({ candidateId: 'c2', nombreCompleto: 'Bruno Díaz', cedula: '200' }),
  rosterRow({ candidateId: 'c3', nombreCompleto: 'Carla Méndez', cedula: '300', attendance: { status: 'PRESENT', markedAt: '2026-11-05T14:06:00.000Z' }, credential: { id: 'cred-c3', status: 'USED', expiresAt: EXPIRES }, evaluation: 'IN_PROGRESS' }),
  rosterRow({ candidateId: 'c4', nombreCompleto: 'Diego Ramírez', cedula: '400', credential: null, evaluation: 'COMPLETED' }),
];

beforeEach(() => {
  vi.clearAllMocks();
  window.confirm = vi.fn(() => true);
  window.prompt = vi.fn(() => 'Hoja extraviada');
  window.print = vi.fn();
  eventService.getEvent.mockResolvedValue(ONSITE_EVENT);
  eventService.getEventCandidates.mockResolvedValue([]);
  credentialService.getCredentials.mockResolvedValue({ modules: [{ module: 'A', rows: PREPARE_ROWS, counts }, { module: 'B', rows: [], counts: { ...counts, total: 0, pending: 0 } }] });
  onsiteService.getRoster.mockResolvedValue({ module: 'A', isAppointmentDay: true, rows: ROSTER, counts: { cited: 4, present: 2, enabled: 0, inProgress: 1, completed: 1 } });
});

describe('stage navigation', () => {
  test('three stages and a module switch, kept in the URL', async () => {
    renderEvent('/company/events/event-1/presencial');
    const stages = within(await screen.findByRole('navigation', { name: 'Etapas de la aplicación presencial' }));
    expect(stages.getByRole('button', { name: /Preparar accesos/ }).getAttribute('aria-current')).toBe('step');

    fireEvent.click(screen.getByRole('button', { name: 'B · Macrocaso' }));
    expect(screen.getByTestId('location').textContent).toBe('/company/events/event-1/presencial?modulo=B&etapa=preparar');
    expect(await screen.findByText(/Cítalos desde Resultados/)).toBeTruthy();

    fireEvent.click(stages.getByRole('button', { name: /Aplicar/ }));
    expect(screen.getByTestId('location').textContent).toBe('/company/events/event-1/presencial?modulo=B&etapa=aplicar');
    await waitFor(() => expect(onsiteService.getRoster).toHaveBeenCalledWith('event-1', 'B'));
  });
});

describe('1 · prepare accesses', () => {
  test('selects the pending candidates, chooses the card format and shows the codes once', async () => {
    credentialService.issueCredentials.mockResolvedValue(issued([
      { credentialId: 'n1', candidateId: 'c1', nombreCompleto: 'Ana López', code: 'K7M2P-9QX4R' },
      { credentialId: 'n3', candidateId: 'c3', nombreCompleto: 'Zoe Ruiz', code: 'HT3NW-8BZ6E' },
    ]));
    renderEvent('/company/events/event-1/presencial');

    expect(await screen.findByText(/ya completó el Módulo A/)).toBeTruthy();
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    expect(screen.getByText('Cómo funcionan los accesos')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar pendientes (2)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Generar accesos (2)' }));
    const confirm = within(screen.getByRole('dialog', { name: 'Generar 2 acceso(s) · Módulo A' }));
    fireEvent.click(confirm.getByLabelText('A4'));
    fireEvent.click(confirm.getByRole('button', { name: 'Generar accesos' }));

    await waitFor(() => expect(credentialService.issueCredentials).toHaveBeenCalledWith('event-1', 'A', ['c1', 'c3'], 'A4'));
    const codes = within(await screen.findByRole('dialog', { name: /Accesos preparados/ }));
    expect(codes.getByText('K7M2P-9QX4R')).toBeTruthy();
    fireEvent.click(codes.getByRole('button', { name: 'Descargar hojas de acceso (PDF)' }));
    expect(saveFile).toHaveBeenCalledWith({ base64: 'JVBERi0=', type: 'application/pdf' }, 'credenciales-acceso.pdf');
    expect(codes.getByRole('button', { name: 'Cerrar' }).disabled).toBe(true);
  });

  test('revokes or reissues a lost card, with confirmation', async () => {
    credentialService.revokeCredential.mockResolvedValue({ id: 'cred-2', status: 'REVOKED' });
    credentialService.reissueCredential.mockResolvedValue(issued([{ credentialId: 'n2', candidateId: 'c2', nombreCompleto: 'Bruno Díaz', code: 'PQ7RS-2TUV3' }]));
    renderEvent('/company/events/event-1/presencial');

    fireEvent.click(await screen.findByRole('button', { name: 'Revocar' }));
    await waitFor(() => expect(credentialService.revokeCredential).toHaveBeenCalledWith('event-1', 'cred-2', 'Hoja extraviada'));
    expect(await screen.findByText('Se revocó el acceso de Bruno Díaz.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Reemitir' }));
    expect(within(await screen.findByRole('dialog')).getByText('PQ7RS-2TUV3')).toBeTruthy();
  });
});

describe('2 · organize', () => {
  test('shows what is ready, downloads the attendance list on its own paper, and explains where cards come from', async () => {
    const blob = { size: 10 };
    credentialService.getAttendanceSheet.mockResolvedValue({ blob, fileName: 'lista.pdf' });
    renderEvent('/company/events/event-1/presencial?etapa=organizar');

    expect(await screen.findByRole('heading', { name: 'Lista de asistencia' })).toBeTruthy();
    expect(screen.getByText('Sin preparar').nextSibling.textContent).toBe('3');
    fireEvent.change(screen.getByLabelText('Formato'), { target: { value: 'A4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Descargar lista (PDF)' }));
    await waitFor(() => expect(saveFile).toHaveBeenCalledWith(blob, 'lista.pdf'));
    expect(credentialService.getAttendanceSheet).toHaveBeenCalledWith('event-1', 'A', 'A4');

    // Cards are only delivered when issued: no fake download here.
    expect(screen.queryByRole('button', { name: /Descargar hojas/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ir a Preparar accesos' }));
    expect(screen.getByTestId('location').textContent).toBe('/company/events/event-1/presencial?modulo=A&etapa=preparar');
  });
});

describe('3 · apply', () => {
  test('marks attendance after the identity check and enables only present candidates', async () => {
    onsiteService.setAttendance.mockResolvedValue({ status: 'PRESENT' });
    onsiteService.enableCredentials.mockResolvedValue({ module: 'A', enabled: [{ candidateId: 'c1', nombreCompleto: 'Ana López' }], skipped: [] });
    renderEvent('/company/events/event-1/presencial?etapa=aplicar');

    const bruno = (await screen.findByText('Bruno Díaz')).closest('tr');
    fireEvent.click(within(bruno).getByRole('button', { name: 'Marcar presente' }));
    expect(window.confirm.mock.calls[0][0]).toBe('¿Verificaste la identidad de Bruno Díaz con su documento (cédula 200)?');
    await waitFor(() => expect(onsiteService.setAttendance).toHaveBeenCalledWith('event-1', 'A', 'c2', true));

    fireEvent.click(screen.getByRole('button', { name: 'Habilitar presentes (1)' }));
    await waitFor(() => expect(onsiteService.enableCredentials).toHaveBeenCalledWith('event-1', 'A', ['c1']));
    expect(await screen.findByText('Se habilitó el acceso de 1 candidato(s).')).toBeTruthy();
  });

  test('recovers an interrupted session only for evaluations in progress', async () => {
    window.prompt = vi.fn(() => 'Se cerró el navegador');
    credentialService.reissueCredential.mockResolvedValue(issued([{ credentialId: 'n3', candidateId: 'c3', nombreCompleto: 'Carla Méndez', code: 'ZX9YW-3VU7T' }]));
    renderEvent('/company/events/event-1/presencial?etapa=aplicar');

    const carla = (await screen.findByText('Carla Méndez')).closest('tr');
    expect(within(screen.getByText('Diego Ramírez').closest('tr')).queryByRole('button', { name: /Recuperar/ })).toBeNull();
    // Lost cards are reissued while preparing, not here.
    expect(within(screen.getByText('Bruno Díaz').closest('tr')).queryByRole('button', { name: /Reemitir/ })).toBeNull();

    fireEvent.click(within(carla).getByRole('button', { name: 'Recuperar acceso' }));
    expect(window.prompt.mock.calls[0][0]).toMatch(/solo funcionará en la misma computadora/);
    expect(within(await screen.findByRole('dialog')).getByText('ZX9YW-3VU7T')).toBeTruthy();
  });

  test('filters and searches the roster', async () => {
    renderEvent('/company/events/event-1/presencial?etapa=aplicar');
    await screen.findByText('Ana López');
    fireEvent.change(screen.getByLabelText('Filtrar por asistencia'), { target: { value: 'present' } });
    expect(screen.queryByText('Bruno Díaz')).toBeNull();
    fireEvent.change(screen.getByLabelText('Filtrar por asistencia'), { target: { value: 'all' } });
    fireEvent.change(screen.getByLabelText('Buscar candidato'), { target: { value: '400' } });
    expect(screen.getByText('Diego Ramírez')).toBeTruthy();
    expect(screen.queryByText('Ana López')).toBeNull();
  });

  test('outside the appointment day the actions are disabled with an explanation', async () => {
    onsiteService.getRoster.mockResolvedValue({ module: 'A', isAppointmentDay: false, rows: ROSTER, counts: {} });
    renderEvent('/company/events/event-1/presencial?etapa=aplicar');
    expect(await screen.findByText(/Hoy no es el día de la cita/)).toBeTruthy();
    expect(within(screen.getByText('Bruno Díaz').closest('tr')).getByRole('button', { name: 'Marcar presente' }).disabled).toBe(true);
  });
});
