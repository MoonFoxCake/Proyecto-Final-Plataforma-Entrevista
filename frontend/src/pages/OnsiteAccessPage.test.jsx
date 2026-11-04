import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { OnsiteAccessPage } from './OnsiteAccessPage.jsx';
import { loginWithCode, savedSession, saveSession, clearSession } from '../services/onsiteAccessService.js';
import { validateInvitationAccess } from '../services/invitationService.js';

vi.mock('../services/onsiteAccessService.js', () => ({
  loginWithCode: vi.fn(),
  savedSession: vi.fn(),
  saveSession: vi.fn(),
  clearSession: vi.fn(),
}));
vi.mock('../services/invitationService.js', () => ({ validateInvitationAccess: vi.fn() }));
// The questionnaires have their own tests: here they only report completion.
vi.mock('../components/evaluation/LikertQuestionnaire.jsx', () => ({
  LikertQuestionnaire: ({ token, onCompleted, onClosed }) => (
    <>
      <button type='button' onClick={onCompleted}>Enviar cuestionario ({token})</button>
      <button type='button' onClick={() => onClosed('CANCELLED')}>Sesión cancelada</button>
    </>
  ),
}));
vi.mock('../components/evaluation/macrocase/MacrocaseEvaluation.jsx', () => ({
  MacrocaseEvaluation: ({ onCompleted }) => <button type='button' onClick={onCompleted}>Enviar macrocaso</button>,
}));

const TOKEN = 't'.repeat(43);
const ACCESS = {
  state: 'VALID',
  module: 'A',
  token: TOKEN,
  candidate: { nombreCompleto: 'María López' },
  organization: { nombre: 'TechCorp' },
  event: { nombre: 'Concurso Presencial', puesto: 'Analista' },
};

const typeCode = (value) => fireEvent.change(screen.getByLabelText('Código de acceso'), { target: { value } });

beforeEach(() => {
  vi.clearAllMocks();
  savedSession.mockReturnValue(null);
});

test('asks only for the code, formats it while typing and runs the evaluation of that session', async () => {
  loginWithCode.mockResolvedValue(ACCESS);
  render(<OnsiteAccessPage />);

  expect(await screen.findByRole('heading', { name: 'Ingresa tu código de acceso' })).toBeTruthy();
  expect(screen.getAllByRole('textbox')).toHaveLength(1);
  const submit = screen.getByRole('button', { name: 'Ingresar' });
  typeCode('k7m2p 9qx');
  expect(screen.getByLabelText('Código de acceso').value).toBe('K7M2P-9QX');
  expect(submit.disabled).toBe(true);
  typeCode('k7m2p9qx4r');
  expect(screen.getByLabelText('Código de acceso').value).toBe('K7M2P-9QX4R');
  fireEvent.click(submit);

  expect(await screen.findByRole('heading', { name: 'Hola, María López.' })).toBeTruthy();
  expect(loginWithCode).toHaveBeenCalledWith('K7M2P-9QX4R');
  expect(saveSession).toHaveBeenCalledWith(TOKEN);
  // The token never goes into the address bar.
  expect(window.location.search).not.toContain(TOKEN);

  fireEvent.click(screen.getByRole('button', { name: 'Comenzar evaluación →' }));
  fireEvent.click(screen.getByRole('button', { name: `Enviar cuestionario (${TOKEN})` }));

  expect(await screen.findByRole('heading', { name: 'Evaluación enviada' })).toBeTruthy();
  expect(clearSession).toHaveBeenCalled();
  expect(screen.queryByText(/María López/)).toBeNull();
});

test.each(['A', 'B'])('the welcome screen never tells the candidate the module (%s)', async (module) => {
  loginWithCode.mockResolvedValue({ ...ACCESS, module });
  render(<OnsiteAccessPage />);
  typeCode('K7M2P9QX4R');
  fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }));

  expect(await screen.findByRole('heading', { name: 'Hola, María López.' })).toBeTruthy();
  expect(screen.getByText('Evaluación presencial')).toBeTruthy();
  expect(document.body.textContent).not.toMatch(/m[oó]dulo|cuestionario|macrocaso/i);
});

test('after the submission the computer returns by itself to a neutral code screen', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  loginWithCode.mockResolvedValue({ ...ACCESS, module: 'B' });
  render(<OnsiteAccessPage />);
  typeCode('K7M2P9QX4R');
  fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Comenzar evaluación →' }));
  fireEvent.click(screen.getByRole('button', { name: 'Enviar macrocaso' }));
  expect(await screen.findByText(/volverá a la pantalla de inicio en 10 s/)).toBeTruthy();

  // The countdown ticks once per second (each tick schedules the next).
  for (let second = 0; second <= 10; second += 1) {
    await act(async () => { vi.advanceTimersByTime(1000); });
  }
  expect(await screen.findByRole('heading', { name: 'Ingresa tu código de acceso' })).toBeTruthy();
  expect(screen.getByLabelText('Código de acceso').value).toBe('');
  vi.useRealTimers();
});

test.each([
  ['INVALID', 'El código no es correcto'],
  ['NOT_YET', 'aún no está activo'],
  ['WINDOW_CLOSED', 'El horario para comenzar la evaluación ya terminó'],
  ['USED', 'ya se utilizó'],
  ['REVOKED', 'fue anulado'],
  ['EXPIRED', 'ya venció'],
  ['COMPLETED', 'ya fue completada'],
  ['OTHER_COMPUTER', 'en la misma computadora donde la comenzaste'],
])('explains a %s code without revealing anything about the candidate', async (state, text) => {
  loginWithCode.mockResolvedValue({ state });
  render(<OnsiteAccessPage />);
  typeCode('K7M2P9QX4R');
  fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }));
  expect((await screen.findByRole('alert')).textContent).toContain(text);
  expect(saveSession).not.toHaveBeenCalled();
});

test('too many attempts: tells how long to wait', async () => {
  loginWithCode.mockResolvedValue({ state: 'TOO_MANY_ATTEMPTS', retryAfterSeconds: 240 });
  render(<OnsiteAccessPage />);
  typeCode('K7M2P9QX4R');
  fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }));
  expect((await screen.findByRole('alert')).textContent).toMatch(/Espera 4 minutos/);
});

test('if a supervisor closes the session midway, the computer shows a neutral notice and forgets it', async () => {
  loginWithCode.mockResolvedValue(ACCESS);
  render(<OnsiteAccessPage />);
  typeCode('K7M2P9QX4R');
  fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Comenzar evaluación →' }));
  fireEvent.click(screen.getByRole('button', { name: 'Sesión cancelada' }));

  expect(await screen.findByRole('heading', { name: 'La sesión se cerró' })).toBeTruthy();
  expect(screen.getByText(/Tus respuestas guardadas se conservan/)).toBeTruthy();
  expect(screen.queryByText(/María López/)).toBeNull();
  expect(clearSession).toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Volver al inicio ahora' }));
  expect(await screen.findByRole('heading', { name: 'Ingresa tu código de acceso' })).toBeTruthy();
});

test('a reload resumes the open session of this tab', async () => {
  savedSession.mockReturnValue(TOKEN);
  validateInvitationAccess.mockResolvedValue({ ...ACCESS, token: undefined });
  render(<OnsiteAccessPage />);

  expect(await screen.findByRole('heading', { name: 'Hola, María López.' })).toBeTruthy();
  expect(validateInvitationAccess).toHaveBeenCalledWith(TOKEN);
});

test('a closed session is forgotten and the code screen is shown', async () => {
  savedSession.mockReturnValue(TOKEN);
  validateInvitationAccess.mockResolvedValue({ state: 'COMPLETED' });
  render(<OnsiteAccessPage />);

  expect(await screen.findByRole('heading', { name: 'Ingresa tu código de acceso' })).toBeTruthy();
  await waitFor(() => expect(clearSession).toHaveBeenCalled());
});
