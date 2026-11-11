import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AdminMacrocasesPage } from './AdminMacrocasesPage.jsx';
import * as api from '../services/macrocaseApi.js';

vi.mock('../services/macrocaseApi.js', () => ({
  getMacroCases: vi.fn(), createMacroCase: vi.fn(), updateMacroCase: vi.fn(), activateMacroCase: vi.fn(),
  deactivateMacroCase: vi.fn(), deleteMacroCase: vi.fn(), uploadMacroCaseAudio: vi.fn(),
}));

const item = {
  id: 'macro-1', name: 'Decisión ética', description: 'Un dilema', active: true, instructions: 'Reflexiona antes de responder.', maxCharacters: 500, defaultTimeLimit: 180,
  sections: [{ id: 's1', order: 1, title: 'El encargo', narrative: 'Una historia completa.', narrativeAudio: { audioUrl: '/voice.mp3', audioSource: 'tts', ttsText: 'Una historia completa.' }, questions: [{ id: 'q1', text: '¿Qué harías?', audioSource: 'tts', ttsError: 'Voice unavailable', options: ['Avisar', 'Esperar', 'Callar', 'Renunciar'].map((text, index) => ({ id: `q1o${index + 1}`, order: index + 1, text })) }] }],
};
const blank = { ...item, id: 'macro-2', name: 'Sin contenido', active: false, sections: [] };
const dialog = () => screen.getByRole('dialog');
const step = (name) => fireEvent.click(within(dialog()).getByRole('button', { name: new RegExp(name) }));
const change = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const card = (name = item.name) => screen.getByRole('article', { name });

beforeAll(() => { HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); }; });
beforeEach(() => {
  vi.resetAllMocks();
  api.getMacroCases.mockResolvedValue([item, blank]);
  api.createMacroCase.mockImplementation(async (payload) => ({ ...payload, id: 'new-macro', active: false }));
  api.updateMacroCase.mockImplementation(async (id, payload) => ({ ...payload, id }));
  api.deactivateMacroCase.mockResolvedValue({ ...item, active: false });
  api.deleteMacroCase.mockResolvedValue(item);
});
afterEach(cleanup);
const renderPage = async () => {
  render(<MemoryRouter><AdminMacrocasesPage /></MemoryRouter>);
  await screen.findByRole('article', { name: item.name });
};
function fillNew() {
  fireEvent.click(screen.getByRole('button', { name: '+ Nuevo macrocaso' }));
  change('Nombre', 'Nuevo caso');
  step('Secciones y preguntas');
  change('Texto narrativo de la sección 1', 'Mi nueva historia.');
  change('Texto de la pregunta 1 de la sección 1', '¿Cómo actuarías?');
  ['A', 'B', 'C', 'D'].forEach((letter) => change(`Opción ${letter} de la pregunta 1 de la sección 1`, `Respuesta ${letter}`));
}

test('uses accent-insensitive search, content and voice filters, and existing preview links', async () => {
  await renderPage();
  change('Buscar macrocaso', 'decision etica');
  expect(screen.queryByRole('article', { name: blank.name })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /Error de voz 1/ }));
  expect(card()).toBeTruthy();
  expect(within(card()).getByRole('link', { name: 'Vista previa' }).getAttribute('href')).toBe('/admin/macrocases/macro-1/preview');
  change('Buscar macrocaso', '');
  fireEvent.click(screen.getByRole('button', { name: /Por completar 1/ }));
  expect(card(blank.name)).toBeTruthy();
  expect(screen.queryByRole('article', { name: item.name })).toBeNull();
  expect(within(card(blank.name)).getByRole('switch', { name: /Activar/ }).disabled).toBe(true);
});

test('creates through three steps and preserves response settings and section content', async () => {
  await renderPage();
  fillNew();
  step('Respuestas');
  expect(screen.queryByLabelText('Máximo de caracteres por respuesta')).toBeNull();
  expect(within(dialog()).getByText('Marca con X · 4 opciones')).toBeTruthy();
  change(/Tiempo por pregunta/, '0');
  step('Secciones y preguntas');
  step('Crear macrocaso');
  await waitFor(() => expect(api.createMacroCase).toHaveBeenCalledTimes(1));
  expect(api.createMacroCase).toHaveBeenCalledWith(expect.objectContaining({
    name: 'Nuevo caso', responseType: 'choice', defaultTimeLimit: 0,
    sections: [expect.objectContaining({ narrative: 'Mi nueva historia.', questions: [expect.objectContaining({ text: '¿Cómo actuarías?', options: ['A', 'B', 'C', 'D'].map((letter) => expect.objectContaining({ text: `Respuesta ${letter}` })) })] })],
  }));
  expect(await screen.findByRole('article', { name: 'Nuevo caso' })).toBeTruthy();
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('validates numeric values and focuses the correct earlier step without submitting', async () => {
  await renderPage();
  fillNew();
  step('Respuestas');
  change('Tiempo por pregunta (segundos)', '1.5');
  step('Secciones y preguntas');
  step('Crear macrocaso');
  expect((await screen.findByRole('alert')).textContent).toContain('número entero');
  expect(document.activeElement).toBe(screen.getByLabelText('Tiempo por pregunta (segundos)'));
  expect(api.createMacroCase).not.toHaveBeenCalled();
});

test('requires exactly four different options per question', async () => {
  await renderPage();
  fillNew();
  change('Opción C de la pregunta 1 de la sección 1', '');
  step('Crear macrocaso');
  expect((await screen.findByRole('alert')).textContent).toContain('necesita sus 4 opciones');
  expect(document.activeElement).toBe(screen.getByLabelText('Opción C de la pregunta 1 de la sección 1'));
  change('Opción C de la pregunta 1 de la sección 1', 'respuesta a');
  step('Crear macrocaso');
  expect((await screen.findByRole('alert')).textContent).toContain('opciones repetidas');
  expect(api.createMacroCase).not.toHaveBeenCalled();
});

test('protects unsaved changes and restores deleted questions without losing IDs or voices', async () => {
  await renderPage();
  fireEvent.click(within(card()).getByRole('button', { name: 'Editar' }));
  step('Secciones y preguntas');
  step('Quitar pregunta 1 de sección 1');
  step('Deshacer');
  expect(screen.getByLabelText('Texto de la pregunta 1 de la sección 1').value).toBe('¿Qué harías?');
  change('Texto de la pregunta 1 de la sección 1', '¿Qué decisión tomarías?');
  step('Cancelar');
  expect(screen.getByText('Tienes cambios sin guardar.')).toBeTruthy();
  step('Seguir editando');
  step('Guardar cambios');
  await waitFor(() => expect(api.updateMacroCase).toHaveBeenCalled());
  const [id, payload] = api.updateMacroCase.mock.calls[0];
  expect(id).toBe('macro-1');
  expect(payload.sections[0]).toMatchObject({ id: 's1', questions: [{ id: 'q1', text: '¿Qué decisión tomarías?', options: [{ id: 'q1o1', text: 'Avisar' }, { id: 'q1o2', text: 'Esperar' }, { id: 'q1o3', text: 'Callar' }, { id: 'q1o4', text: 'Renunciar' }] }] });
  // Server-owned audio metadata is intentionally retained by the backend, not overwritten by the form.
  expect(payload.sections[0]).not.toHaveProperty('narrativeAudio');
});

test('requires explicit confirmation for delete and deactivate, and retains errors for retry', async () => {
  api.deleteMacroCase.mockRejectedValueOnce(new Error('No se pudo eliminar'));
  await renderPage();
  fireEvent.click(within(card()).getByRole('button', { name: 'Eliminar' }));
  expect(api.deleteMacroCase).not.toHaveBeenCalled();
  step('Eliminar macrocaso');
  expect((await screen.findByRole('alert')).textContent).toContain('No se pudo eliminar');
  step('Cancelar');
  fireEvent.click(within(card()).getByRole('switch', { name: /Desactivar/ }));
  expect(api.deactivateMacroCase).not.toHaveBeenCalled();
  step('Desactivar');
  await waitFor(() => expect(api.deactivateMacroCase).toHaveBeenCalledWith(item.id));
  expect(within(card()).getByRole('switch', { name: /Activar/ })).toBeTruthy();
});

test('retries a failed audio upload by updating the created case, without duplicating it', async () => {
  api.uploadMacroCaseAudio.mockRejectedValueOnce(new Error('Falló el audio'));
  api.uploadMacroCaseAudio.mockResolvedValueOnce({ ...item, name: 'Nuevo caso', id: 'new-macro' });
  await renderPage();
  fillNew();
  const upload = within(dialog()).getAllByLabelText('Subir audio propio')[0];
  fireEvent.change(upload, { target: { files: [new File(['audio'], 'narracion.mp3', { type: 'audio/mpeg' })] } });
  step('Crear macrocaso');
  expect((await screen.findByRole('alert')).textContent).toContain('Puedes reintentar sin crear otro macrocaso');
  expect(api.createMacroCase).toHaveBeenCalledTimes(1);
  step('Crear macrocaso');
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(api.createMacroCase).toHaveBeenCalledTimes(1);
  expect(api.updateMacroCase).toHaveBeenCalledWith('new-macro', expect.any(Object));
  expect(api.uploadMacroCaseAudio).toHaveBeenCalledTimes(2);
});

test('shows load failures with retry instead of an empty bank', async () => {
  api.getMacroCases.mockRejectedValueOnce(new Error('Sin conexión'));
  render(<MemoryRouter><AdminMacrocasesPage /></MemoryRouter>);
  expect((await screen.findByRole('alert')).textContent).toContain('Sin conexión');
  expect(screen.queryByText('Aún no hay macrocasos')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  expect(await screen.findByRole('article', { name: item.name })).toBeTruthy();
});

test('makes all cases reachable through pagination and resets the page on search', async () => {
  api.getMacroCases.mockResolvedValue(Array.from({ length: 8 }, (_, index) => ({ ...item, id: `m${index}`, name: `Caso ${index}` })));
  render(<MemoryRouter><AdminMacrocasesPage /></MemoryRouter>);
  await screen.findByRole('article', { name: 'Caso 0' });
  expect(screen.getAllByRole('article')).toHaveLength(6);
  fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
  expect(screen.getAllByRole('article')).toHaveLength(2);
  change('Buscar macrocaso', 'Caso 0');
  expect(screen.getAllByRole('article')).toHaveLength(1);
  expect(screen.queryByRole('navigation', { name: 'Páginas de macrocasos' })).toBeNull();
});
