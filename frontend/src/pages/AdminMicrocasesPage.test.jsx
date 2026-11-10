import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AdminMicrocasesPage } from './AdminMicrocasesPage.jsx';
import * as api from '../services/microcaseApi.js';

vi.mock('../services/microcaseApi.js', () => ({
  listMicrocases: vi.fn(), createMicrocase: vi.fn(), updateMicrocase: vi.fn(),
  activateMicrocase: vi.fn(), deactivateMicrocase: vi.fn(), deleteMicrocase: vi.fn(), previewMicrocase: vi.fn(),
}));

const complete = {
  id: 'case-1', name: 'Decisión en equipo', description: 'Una situación de trabajo', story: 'La historia completa.', active: true, timeLimitMinutes: 12,
  sections: [
    { id: 's1', title: 'Comunicación', order: 1, questions: [{ id: 'q1', text: 'Comparto mis ideas.' }, { id: 'q2', text: 'Escucho a otras personas.' }] },
    { id: 's2', title: 'Responsabilidad', order: 2, questions: [{ id: 'q3', text: 'Cumplo mis compromisos.' }] },
  ],
};
const incomplete = { id: 'case-2', name: 'Caso por completar', story: 'Una historia', active: false, sections: [{ id: 's3', title: 'Integridad', questions: [] }] };
const dialog = () => screen.getByRole('dialog');
const change = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const step = (name) => fireEvent.click(within(dialog()).getByRole('button', { name: new RegExp(name) }));
const card = (name = complete.name) => screen.getByRole('article', { name });
const renderPage = async () => { render(<AdminMicrocasesPage />); await screen.findByRole('article', { name: complete.name }); };

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
});
beforeEach(() => {
  vi.resetAllMocks();
  api.listMicrocases.mockResolvedValue([complete, incomplete]);
  api.createMicrocase.mockImplementation(async (payload) => ({ ...payload, id: 'new-case' }));
  api.updateMicrocase.mockImplementation(async (id, payload) => ({ ...payload, id }));
  api.activateMicrocase.mockResolvedValue({ ...complete, active: true });
  api.deactivateMicrocase.mockResolvedValue({ ...complete, active: false });
  api.deleteMicrocase.mockResolvedValue(complete);
});
afterEach(cleanup);

test('opens on the bank, filters by skill and status, and expands saved content', async () => {
  await renderPage();
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.queryByLabelText('Nombre del microcaso')).toBeNull();
  change('Buscar microcaso', 'comunicacion');
  expect(screen.queryByRole('article', { name: incomplete.name })).toBeNull();
  fireEvent.click(within(card()).getByText('Ver historia y habilidades'));
  expect(within(card()).getByText('La historia completa.')).toBeTruthy();
  expect(within(card()).getByText('Comparto mis ideas.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
  fireEvent.click(screen.getByRole('button', { name: /Por completar 1/ }));
  expect(screen.queryByRole('article', { name: complete.name })).toBeNull();
  expect(within(card(incomplete.name)).getByRole('switch').disabled).toBe(true);
});

test('creates a new inactive microcase through three steps and preserves its questions', async () => {
  await renderPage();
  fireEvent.click(screen.getByRole('button', { name: '+ Nuevo microcaso' }));
  change('Nombre del microcaso', 'Nuevo caso');
  change('Tiempo límite general (minutos)', '20');
  step('Continuar');
  change('Texto de la historia', 'La historia que leerá el participante.');
  step('Continuar');
  change('Nombre de la habilidad 1', 'Criterio');
  change('Texto de la pregunta 1 de habilidad 1', 'Considero las consecuencias.');
  step('Crear microcaso');
  await waitFor(() => expect(api.createMicrocase).toHaveBeenCalledTimes(1));
  expect(api.createMicrocase).toHaveBeenCalledWith(expect.objectContaining({
    name: 'Nuevo caso', story: 'La historia que leerá el participante.', timeLimitMinutes: 20, active: false,
    sections: [expect.objectContaining({ title: 'Criterio', order: 1, questions: [expect.objectContaining({ text: 'Considero las consecuencias.' })] })],
  }));
  expect(await screen.findByRole('article', { name: 'Nuevo caso' })).toBeTruthy();
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('validates required information and returns focus to the invalid field', async () => {
  await renderPage();
  fireEvent.click(screen.getByRole('button', { name: '+ Nuevo microcaso' }));
  step('Habilidades y preguntas');
  step('Crear microcaso');
  expect((await screen.findByRole('alert')).textContent).toContain('Escribe el nombre');
  expect(document.activeElement).toBe(screen.getByLabelText('Nombre del microcaso'));
  change('Nombre del microcaso', 'Nuevo');
  change('Tiempo límite general (minutos)', '1.5');
  step('Habilidades y preguntas');
  step('Crear microcaso');
  expect((await screen.findByRole('alert')).textContent).toContain('número entero');
  expect(api.createMicrocase).not.toHaveBeenCalled();
});

test('editing preserves IDs, reorders skills and restores removed content', async () => {
  await renderPage();
  fireEvent.click(within(card()).getByRole('button', { name: 'Editar' }));
  step('Habilidades y preguntas');
  step('Quitar pregunta 1 de habilidad 1');
  expect(screen.getByLabelText('Texto de la pregunta 1 de habilidad 1').value).toBe('Escucho a otras personas.');
  step('Deshacer');
  expect(screen.getByLabelText('Texto de la pregunta 1 de habilidad 1').value).toBe('Comparto mis ideas.');
  step('Bajar habilidad 1');
  expect(screen.getByLabelText('Nombre de la habilidad 1').value).toBe('Responsabilidad');
  step('Guardar cambios');
  await waitFor(() => expect(api.updateMicrocase).toHaveBeenCalled());
  const [id, payload] = api.updateMicrocase.mock.calls[0];
  expect(id).toBe('case-1');
  expect(payload.sections.map((s) => [s.id, s.order])).toEqual([['s2', 1], ['s1', 2]]);
  expect(payload.sections[1].questions.map((q) => q.id)).toEqual(['q1', 'q2']);
  expect(payload.active).toBe(true);
});

test('prevents accidental draft loss and retains failed saves for retry', async () => {
  api.createMicrocase.mockRejectedValueOnce(new Error('No se pudo guardar'));
  await renderPage();
  fireEvent.click(screen.getByRole('button', { name: '+ Nuevo microcaso' }));
  change('Nombre del microcaso', 'Mi borrador');
  step('Cancelar');
  expect(screen.getByText('Tienes cambios sin guardar.')).toBeTruthy();
  step('Seguir editando');
  step('Historia');
  change('Texto de la historia', 'Mi historia');
  step('Habilidades y preguntas');
  step('Crear microcaso');
  expect((await screen.findByRole('alert')).textContent).toContain('No se pudo guardar');
  step('Información');
  expect(screen.getByLabelText('Nombre del microcaso').value).toBe('Mi borrador');
  step('Cancelar');
  step('Descartar cambios');
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('requires explicit confirmation for deletion and keeps the card on server failure', async () => {
  api.deleteMicrocase.mockRejectedValueOnce(new Error('No se permite eliminar'));
  await renderPage();
  fireEvent.click(within(card()).getByRole('button', { name: 'Eliminar' }));
  expect(api.deleteMicrocase).not.toHaveBeenCalled();
  step('Eliminar microcaso');
  expect((await screen.findByRole('alert')).textContent).toContain('No se permite eliminar');
  expect(card()).toBeTruthy();
  step('Cancelar');
  fireEvent.click(within(card()).getByRole('button', { name: 'Eliminar' }));
  step('Eliminar microcaso');
  await waitFor(() => expect(screen.queryByRole('article', { name: complete.name })).toBeNull());
});

test('deactivates only after confirmation and updates availability', async () => {
  await renderPage();
  fireEvent.click(within(card()).getByRole('switch'));
  expect(api.deactivateMicrocase).not.toHaveBeenCalled();
  step('Desactivar');
  await waitFor(() => expect(api.deactivateMicrocase).toHaveBeenCalledWith('case-1'));
  expect(within(card()).getByRole('switch').getAttribute('aria-checked')).toBe('false');
});

test('previews selected skills without allowing an empty selection or malformed questions', async () => {
  api.previewMicrocase.mockResolvedValueOnce({ sections: [{ id: 's1', title: 'Comunicación', selectedQuestion: null }] });
  api.previewMicrocase.mockResolvedValueOnce({ name: complete.name, story: complete.story, sections: [{ ...complete.sections[0], selectedQuestion: complete.sections[0].questions[0] }] });
  await renderPage();
  fireEvent.click(within(card()).getByRole('button', { name: 'Vista previa' }));
  fireEvent.click(screen.getByLabelText(/Responsabilidad/));
  fireEvent.click(screen.getByLabelText(/Comunicación/));
  expect(within(dialog()).getByRole('button', { name: 'Iniciar vista previa' }).disabled).toBe(true);
  fireEvent.click(screen.getByLabelText(/Comunicación/));
  step('Iniciar vista previa');
  expect((await screen.findByRole('alert')).textContent).toContain('sin una pregunta disponible');
  step('Iniciar vista previa');
  expect(await screen.findByRole('heading', { name: 'Análisis de un microcaso' })).toBeTruthy();
  expect(api.previewMicrocase).toHaveBeenLastCalledWith('case-1', ['s1']);
  expect(screen.getByText(/Simulación: las respuestas no se guardan/)).toBeTruthy();
});

test('shows a retryable load error instead of claiming the bank is empty', async () => {
  api.listMicrocases.mockRejectedValueOnce(new Error('Sin conexión'));
  render(<AdminMicrocasesPage />);
  expect((await screen.findByRole('alert')).textContent).toContain('Sin conexión');
  expect(screen.queryByText('Aún no hay microcasos')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  expect(await screen.findByRole('article', { name: complete.name })).toBeTruthy();
});

test('does not keep a whole-form undo that would overwrite subsequent edits', async () => {
  await renderPage();
  fireEvent.click(within(card()).getByRole('button', { name: 'Editar' }));
  step('Habilidades y preguntas');
  step('Quitar pregunta 1 de habilidad 1');
  change('Nombre de la habilidad 1', 'Nuevo nombre');
  expect(screen.queryByRole('button', { name: 'Deshacer' })).toBeNull();
  expect(screen.getByLabelText('Nombre de la habilidad 1').value).toBe('Nuevo nombre');
});

test('requires complete skills for an active edit but allows saving it as inactive', async () => {
  await renderPage();
  fireEvent.click(within(card()).getByRole('button', { name: 'Editar' }));
  step('Habilidades y preguntas');
  step('Quitar pregunta 1 de habilidad 2');
  step('Guardar cambios');
  expect((await screen.findByRole('alert')).textContent).toContain('Para mantenerlo activo');
  expect(api.updateMicrocase).not.toHaveBeenCalled();
  step('Información');
  fireEvent.click(screen.getByLabelText('Mantener activo'));
  step('Habilidades y preguntas');
  step('Guardar cambios');
  await waitFor(() => expect(api.updateMicrocase).toHaveBeenCalled());
  expect(api.updateMicrocase.mock.calls[0][1].active).toBe(false);
});
