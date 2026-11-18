import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ForgotPasswordPage } from './ForgotPasswordPage.jsx';
import * as authService from '../../services/authService.js';

vi.mock('../../services/authService.js', () => ({ requestPasswordReset: vi.fn() }));

const renderPage = () => render(<MemoryRouter><ForgotPasswordPage /></MemoryRouter>);
const submit = (email) => {
  fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: email } });
  fireEvent.click(screen.getByRole('button', { name: /Enviar instrucciones/ }));
};

beforeEach(() => { vi.resetAllMocks(); });
afterEach(cleanup);

test('requests the recovery e-mail and tells the user to check their inbox', async () => {
  authService.requestPasswordReset.mockResolvedValue();
  renderPage();
  submit('  persona@empresa.com ');
  expect(await screen.findByText('Revisa tu correo')).toBeTruthy();
  expect(authService.requestPasswordReset).toHaveBeenCalledWith('persona@empresa.com');
  expect(screen.getByText('persona@empresa.com')).toBeTruthy();
});

test('administrator usernames are sent to the owner instead', () => {
  renderPage();
  submit('owner@ADMIN.nexoperfil.invalid');
  expect(screen.getByRole('alert').textContent).toContain('contacta al propietario');
  expect(authService.requestPasswordReset).not.toHaveBeenCalled();
});

test('explains when too many requests were made', async () => {
  authService.requestPasswordReset.mockRejectedValue({ request: {}, response: { status: 429 } });
  renderPage();
  submit('persona@empresa.com');
  expect((await screen.findByRole('alert')).textContent).toContain('demasiadas solicitudes');
  expect(screen.queryByText('Revisa tu correo')).toBeNull();
});

test('explains a connection problem', async () => {
  authService.requestPasswordReset.mockRejectedValue({ request: {} });
  renderPage();
  submit('persona@empresa.com');
  expect((await screen.findByRole('alert')).textContent).toContain('No pudimos conectarnos');
});
