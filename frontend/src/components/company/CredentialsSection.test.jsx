import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { CredentialsSection } from './CredentialsSection.jsx';
import * as credentialService from '../../services/credentialService.js';
import { saveFile } from '../../utils/download.js';

vi.mock('../../services/credentialService.js', () => ({
  getCredentials: vi.fn(),
  issueCredentials: vi.fn(),
  revokeCredential: vi.fn(),
  reissueCredential: vi.fn(),
  getAttendanceSheet: vi.fn(),
}));
vi.mock('../../utils/download.js', () => ({
  saveFile: vi.fn(),
  base64ToBlob: vi.fn((base64, type) => ({ base64, type })),
}));

const EVENT = { id: 'event-1', name: 'Concurso Presencial' };
const EXPIRES = '2026-11-06T05:59:59.999Z';
const SESSION = { venue: 'Campus Central', room: 'Aula 204', startsAt: '2026-11-05T14:00:00.000Z', endsAt: '2026-11-05T16:00:00.000Z' };

function summary(rows) {
  return {
    modules: [{
      module: 'A',
      rows,
      counts: {
        total: rows.length, prepared: rows.filter((row) => row.credential?.status === 'GENERATED').length, enabled: 0, used: 0, revoked: 0, expired: 0,
        pending: rows.filter((row) => !row.credential).length,
      },
    }],
  };
}

const ROWS = [
  { candidateId: 'c1', nombreCompleto: 'Ana López', canIssue: true, credential: null },
  { candidateId: 'c2', nombreCompleto: 'Bruno Díaz', canIssue: true, credential: { id: 'cred-2', status: 'GENERATED', expiresAt: EXPIRES } },
  { candidateId: 'c3', nombreCompleto: 'Zoe Ruiz', canIssue: true, credential: null },
  { candidateId: 'c4', nombreCompleto: 'Ya Evaluada', canIssue: false, blockedReason: 'ya completó el Módulo A', credential: null },
];

beforeEach(() => {
  vi.clearAllMocks();
  window.confirm = vi.fn(() => true);
  window.print = vi.fn();
  credentialService.getCredentials.mockResolvedValue(summary(ROWS));
});

test('prepares the pending candidates and shows their codes once, to print before closing', async () => {
  credentialService.issueCredentials.mockResolvedValue({
    module: 'A',
    issued: [
      { credentialId: 'n1', candidateId: 'c1', nombreCompleto: 'Ana López', module: 'A', code: 'K7M2P-9QX4R', expiresAt: EXPIRES, appointment: SESSION },
      { credentialId: 'n3', candidateId: 'c3', nombreCompleto: 'Zoe Ruiz', module: 'A', code: 'HT3NW-8BZ6E', expiresAt: EXPIRES, appointment: SESSION },
    ],
    skipped: [],
    rejected: [],
  });
  render(<CredentialsSection event={EVENT} />);

  expect(await screen.findByText('Ana López')).toBeTruthy();
  expect(screen.getByText(/ya completó el Módulo A/)).toBeTruthy();
  // Only candidates without a code can be selected; the prepared one and the evaluated one cannot.
  expect(screen.getAllByRole('checkbox')).toHaveLength(2);
  expect(screen.queryByText(/K7M2P/)).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Seleccionar pendientes (2)' }));
  fireEvent.click(screen.getByRole('button', { name: 'Preparar accesos (2)' }));
  await waitFor(() => expect(credentialService.issueCredentials).toHaveBeenCalledWith('event-1', 'A', ['c1', 'c3'], 'CARTA'));

  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByText('K7M2P-9QX4R')).toBeTruthy();
  expect(within(dialog).getByText('HT3NW-8BZ6E')).toBeTruthy();
  expect(within(dialog).getByText(/Estos códigos solo se muestran ahora/)).toBeTruthy();

  fireEvent.click(within(dialog).getByRole('button', { name: 'Imprimir lista' }));
  expect(window.print).toHaveBeenCalled();
  const close = within(dialog).getByRole('button', { name: 'Cerrar' });
  expect(close.disabled).toBe(true);
  fireEvent.click(within(dialog).getByLabelText('Ya descargué o imprimí las tarjetas'));
  fireEvent.click(close);

  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.queryByText('K7M2P-9QX4R')).toBeNull();
});

test('reports who already had a code instead of generating another one', async () => {
  credentialService.issueCredentials.mockResolvedValue({
    module: 'A', issued: [], skipped: [{ candidateId: 'c1', nombreCompleto: 'Ana López', status: 'GENERATED' }], rejected: [],
  });
  render(<CredentialsSection event={EVENT} />);
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Preparar el acceso de Ana López' }));
  fireEvent.click(screen.getByRole('button', { name: 'Preparar accesos (1)' }));

  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByText('No se generaron accesos nuevos')).toBeTruthy();
  expect(within(dialog).getByText(/Ya tenían un acceso/)).toBeTruthy();
  expect(within(dialog).getByRole('button', { name: 'Cerrar' }).disabled).toBe(false);
});

test('revokes or reissues a single credential with an optional reason', async () => {
  credentialService.revokeCredential.mockResolvedValue({ id: 'cred-2', status: 'REVOKED' });
  credentialService.reissueCredential.mockResolvedValue({
    module: 'A', issued: [{ credentialId: 'cred-5', candidateId: 'c2', nombreCompleto: 'Bruno Díaz', module: 'A', code: 'PQ7RS-2TUV3', expiresAt: EXPIRES, appointment: SESSION }], skipped: [], rejected: [],
  });
  window.prompt = vi.fn(() => 'Tarjeta extraviada');
  render(<CredentialsSection event={EVENT} />);

  fireEvent.click(await screen.findByRole('button', { name: 'Revocar' }));
  await waitFor(() => expect(credentialService.revokeCredential).toHaveBeenCalledWith('event-1', 'cred-2', 'Tarjeta extraviada'));
  expect(await screen.findByText('Se revocó el acceso de Bruno Díaz.')).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: 'Reemitir' }));
  await waitFor(() => expect(credentialService.reissueCredential).toHaveBeenCalledWith('event-1', 'cred-2', 'Tarjeta extraviada', 'CARTA'));
  expect(within(await screen.findByRole('dialog')).getByText('PQ7RS-2TUV3')).toBeTruthy();

  // Cancelling the prompt does nothing.
  window.prompt = vi.fn(() => null);
  credentialService.revokeCredential.mockClear();
  fireEvent.click(within(screen.getByRole('dialog')).getByLabelText('Ya descargué o imprimí las tarjetas'));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cerrar' }));
  fireEvent.click(screen.getByRole('button', { name: 'Revocar' }));
  expect(credentialService.revokeCredential).not.toHaveBeenCalled();
});

test('downloads the cards PDF that came with the codes, on the chosen paper', async () => {
  credentialService.issueCredentials.mockResolvedValue({
    module: 'A',
    issued: [{ credentialId: 'n1', candidateId: 'c1', nombreCompleto: 'Ana López', module: 'A', code: 'K7M2P-9QX4R', expiresAt: EXPIRES, appointment: SESSION }],
    skipped: [],
    rejected: [],
    cardsPdf: { fileName: 'tarjetas-acceso-concurso-modulo-a.pdf', contentType: 'application/pdf', base64: 'JVBERi0=' },
  });
  render(<CredentialsSection event={EVENT} />);
  fireEvent.change(await screen.findByLabelText('Papel'), { target: { value: 'A4' } });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Preparar el acceso de Ana López' }));
  fireEvent.click(screen.getByRole('button', { name: 'Preparar accesos (1)' }));
  await waitFor(() => expect(credentialService.issueCredentials).toHaveBeenCalledWith('event-1', 'A', ['c1'], 'A4'));

  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Descargar tarjetas (PDF)' }));
  expect(saveFile).toHaveBeenCalledWith({ base64: 'JVBERi0=', type: 'application/pdf' }, 'tarjetas-acceso-concurso-modulo-a.pdf');
});

test('downloads the attendance sheet of the module, which has no codes', async () => {
  const blob = { size: 10 };
  credentialService.getAttendanceSheet.mockResolvedValue({ blob, fileName: 'lista-asistencia-concurso-modulo-a.pdf' });
  render(<CredentialsSection event={EVENT} />);

  fireEvent.click(await screen.findByRole('button', { name: 'Lista de asistencia (PDF)' }));
  await waitFor(() => expect(credentialService.getAttendanceSheet).toHaveBeenCalledWith('event-1', 'A', 'CARTA'));
  await waitFor(() => expect(saveFile).toHaveBeenCalledWith(blob, 'lista-asistencia-concurso-modulo-a.pdf'));
});

test('the dialog stays open when the event data refreshes', async () => {
  credentialService.issueCredentials.mockResolvedValue({
    module: 'A', issued: [{ credentialId: 'n1', candidateId: 'c1', nombreCompleto: 'Ana López', module: 'A', code: 'K7M2P-9QX4R', expiresAt: EXPIRES, appointment: SESSION }], skipped: [], rejected: [],
  });
  const { rerender } = render(<CredentialsSection event={EVENT} candidatesVersion='v1' />);
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Preparar el acceso de Ana López' }));
  fireEvent.click(screen.getByRole('button', { name: 'Preparar accesos (1)' }));
  expect(await screen.findByText('K7M2P-9QX4R')).toBeTruthy();

  rerender(<CredentialsSection event={EVENT} candidatesVersion='v2' />);
  await waitFor(() => expect(credentialService.getCredentials).toHaveBeenCalledTimes(3));
  expect(screen.getByText('K7M2P-9QX4R')).toBeTruthy();
});
