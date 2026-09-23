import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RegisterPage } from './RegisterPage.jsx';
import { register } from '../../services/authService.js';

vi.mock('../../services/authService.js', () => ({ register: vi.fn() }));

test('registers an organization and company responsible instead of a candidate profile', async () => {
  register.mockResolvedValue({ user: { role: 'company' }, organization: { id: 'org-1' } });
  render(<MemoryRouter><RegisterPage /></MemoryRouter>);

  fireEvent.change(screen.getByLabelText('Razón social'), { target: { value: 'TechCorp S.A.' } });
  fireEvent.change(screen.getByLabelText('Sector o industria'), { target: { value: 'Tecnología' } });
  fireEvent.change(screen.getByLabelText('Tamaño de empresa'), { target: { value: '51-200' } });
  fireEvent.change(screen.getByLabelText('Teléfono empresarial'), { target: { value: '+502 2200 0000' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));

  fireEvent.change(screen.getByLabelText('Nombre del responsable'), { target: { value: 'María González' } });
  fireEvent.change(screen.getByLabelText('Cargo'), { target: { value: 'Gerente de RRHH' } });
  fireEvent.change(screen.getByLabelText('Correo corporativo'), { target: { value: 'rrhh@techcorp.example' } });
  fireEvent.change(screen.getByLabelText('Teléfono de contacto'), { target: { value: '+502 5555 0000' } });
  fireEvent.change(screen.getByLabelText('Ciudad'), { target: { value: 'Guatemala' } });
  fireEvent.change(screen.getByLabelText('País'), { target: { value: 'Guatemala' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));

  fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'Segura123' } });
  fireEvent.change(screen.getByLabelText('Confirmar contraseña'), { target: { value: 'Segura123' } });
  fireEvent.click(screen.getByLabelText(/Acepto los/));
  fireEvent.click(screen.getByRole('button', { name: /Crear cuenta empresarial/ }));

  await waitFor(() => expect(register).toHaveBeenCalledWith(expect.objectContaining({
    companyName: 'TechCorp S.A.', industry: 'Tecnología', companySize: '51-200',
    displayName: 'María González', contactRole: 'Gerente de RRHH', email: 'rrhh@techcorp.example', acceptTerms: true,
  })));
  expect(register.mock.calls[0][0]).not.toHaveProperty('academicLevel');
  expect(await screen.findByText('¡Cuenta creada!')).toBeTruthy();
});
