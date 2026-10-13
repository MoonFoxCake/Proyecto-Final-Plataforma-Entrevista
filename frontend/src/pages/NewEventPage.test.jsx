import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NewEventPage } from './NewEventPage.jsx';
import { createEvent } from '../services/eventService.js';

vi.mock('../services/eventService.js', () => ({ createEvent: vi.fn() }));
vi.mock('../components/company/CompanySidebar.jsx', () => ({ CompanySidebar: () => <nav /> }));

const fill = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

function renderPage() {
  render(<MemoryRouter><NewEventPage /></MemoryRouter>);
  fill('Nombre del concurso', 'Concurso Presencial 2026');
  fill('Puesto', 'Analista');
}

beforeEach(() => {
  createEvent.mockReset();
  createEvent.mockResolvedValue({ id: 'event-1' });
});

test('creates an onsite event with venue, session and only Module A', async () => {
  renderPage();
  fireEvent.click(screen.getByLabelText(/Presencial/));
  expect(screen.queryByLabelText('Fecha y hora de habilitación')).toBeNull();

  fill('Sede', 'Campus Central');
  fill('Ubicación específica', 'Aula 204');
  fill('Fecha', '2026-11-05');
  fill('Hora de inicio', '08:00');
  fill('Hora de fin', '10:00');
  fill('Indicaciones para los candidatos (opcional)', 'Llegar 15 minutos antes.');
  fireEvent.click(screen.getByLabelText(/Módulo B · Macrocaso/));
  fireEvent.click(screen.getByRole('button', { name: 'Crear evento' }));

  await waitFor(() => expect(createEvent).toHaveBeenCalledTimes(1));
  expect(createEvent).toHaveBeenCalledWith({
    nombre: 'Concurso Presencial 2026',
    puesto: 'Analista',
    descripcion: undefined,
    incluirModuloB: false,
    modalidad: 'presencial',
    presencial: {
      sede: 'Campus Central',
      ubicacion: 'Aula 204',
      fechaHoraInicio: new Date('2026-11-05T08:00').toISOString(),
      fechaHoraFin: new Date('2026-11-05T10:00').toISOString(),
      indicaciones: 'Llegar 15 minutos antes.',
    },
  });
});

test('does not send an onsite event without location or with a backwards schedule', async () => {
  renderPage();
  fireEvent.click(screen.getByLabelText(/Presencial/));
  fill('Sede', 'Campus Central');
  fill('Fecha', '2026-11-05');
  fill('Hora de inicio', '10:00');
  fill('Hora de fin', '09:00');
  fireEvent.click(screen.getByRole('button', { name: 'Crear evento' }));
  expect((await screen.findByRole('alert')).textContent).toMatch(/ubicación/);

  fill('Ubicación específica', 'Aula 204');
  fireEvent.click(screen.getByRole('button', { name: 'Crear evento' }));
  expect((await screen.findByRole('alert')).textContent).toMatch(/posterior/);
  expect(createEvent).not.toHaveBeenCalled();
});

test('a virtual event keeps the original availability date and includes Module B', async () => {
  renderPage();
  fill('Fecha y hora de habilitación', '2026-10-10T09:00');
  fireEvent.click(screen.getByRole('button', { name: 'Crear evento' }));

  await waitFor(() => expect(createEvent).toHaveBeenCalledWith(expect.objectContaining({
    modalidad: 'virtual',
    incluirModuloB: true,
    fechaHoraHabilitacion: new Date('2026-10-10T09:00').toISOString(),
  })));
});
