import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AdminQuestionBankPage } from './AdminQuestionBankPage.jsx';
import { AdminSidebar } from '../components/admin/AdminSidebar.jsx';
import { LikertQuestionnaire } from '../components/evaluation/LikertQuestionnaire.jsx';
import * as api from '../services/questionBankApi.js';
import { submitEvaluation } from '../services/invitationService.js';
vi.mock('../services/questionBankApi.js', () => ({ listQuestionGroups: vi.fn(), createQuestionGroup: vi.fn(), updateQuestionGroup: vi.fn(), setQuestionGroupActive: vi.fn(), getQuestionGroupVersions: vi.fn() }));
vi.mock('../services/invitationService.js', () => ({ submitEvaluation: vi.fn() }));
vi.mock('../services/authService.js', () => ({ logout: vi.fn() }));
const group = { id: 'g1', name: 'Ética y comunicación', description: 'Instrumento', active: true, version: 2, questions: [{ id: 'q1', text: 'Comunico mis ideas.', dimension: 'Comunicación' }], updatedAt: '2026-11-10T12:00:00Z' };
const dialog = () => screen.getByRole('dialog');
const step = (name) => fireEvent.click(within(dialog()).getByRole('button', { name: new RegExp(name) }));
const change = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
beforeAll(() => { HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); }; });
beforeEach(() => {
  vi.resetAllMocks();
  api.listQuestionGroups.mockResolvedValue([group]);
  api.createQuestionGroup.mockImplementation(async (input) => ({ ...input, id: 'new', version: 1, active: false }));
  api.updateQuestionGroup.mockImplementation(async (id, input) => ({ ...group, ...input, id, version: 3 }));
  api.setQuestionGroupActive.mockResolvedValue({ ...group, active: false });
  api.getQuestionGroupVersions.mockResolvedValue([group, { ...group, version: 1, questions: [{ id: 'old', text: 'Pregunta histórica.', dimension: '' }] }]);
  submitEvaluation.mockResolvedValue({ state: 'COMPLETED' });
});
afterEach(cleanup);
const renderPage = async () => { render(<AdminQuestionBankPage />); await screen.findByRole('article', { name: group.name }); };

test('places the new admin navigation between companies and macrocases', () => {
  render(<MemoryRouter><AdminSidebar activeSection="question-bank" onSelect={() => {}} /></MemoryRouter>);
  const labels = within(screen.getByRole('navigation')).getAllByRole('button').map((button) => button.textContent);
  expect(labels.indexOf('▤Banco de Preguntas')).toBe(labels.indexOf('▥Empresas') + 1);
  expect(labels.indexOf('◇Banco de Macrocasos')).toBe(labels.indexOf('▤Banco de Preguntas') + 1);
});
test('creates an inactive question group through the shared three-step editor', async () => {
  await renderPage();
  fireEvent.click(screen.getByRole('button', { name: '+ Nuevo grupo' }));
  change('Nombre del grupo', 'Nuevo instrumento');
  step('Preguntas');
  change('Texto de la pregunta 1', 'Asumo mis compromisos.');
  change('Habilidad o dimensión 1 (opcional)', 'Responsabilidad');
  step('Revisión');
  step('Crear grupo');
  await waitFor(() => expect(api.createQuestionGroup).toHaveBeenCalled());
  expect(api.createQuestionGroup).toHaveBeenCalledWith(expect.objectContaining({ name: 'Nuevo instrumento', questions: [expect.objectContaining({ text: 'Asumo mis compromisos.', dimension: 'Responsabilidad' })] }));
  expect(await screen.findByRole('article', { name: 'Nuevo instrumento' })).toBeTruthy();
});
test('edits by creating a new version with the original question IDs and base version', async () => {
  await renderPage();
  fireEvent.click(screen.getByRole('button', { name: 'Editar / nueva versión' }));
  step('Preguntas');
  change('Texto de la pregunta 1', 'Escucho antes de responder.');
  step('Revisión');
  step('Crear versión');
  await waitFor(() => expect(api.updateQuestionGroup).toHaveBeenCalled());
  expect(api.updateQuestionGroup).toHaveBeenCalledWith('g1', expect.objectContaining({ baseVersion: 2, questions: [expect.objectContaining({ id: 'q1', text: 'Escucho antes de responder.' })] }));
});
test('retains failed edits and requires confirmation before discarding', async () => {
  api.updateQuestionGroup.mockRejectedValueOnce({ response: { data: { error: { message: 'El grupo cambió. Actualiza el banco.' } } } });
  await renderPage();
  fireEvent.click(screen.getByRole('button', { name: 'Editar / nueva versión' }));
  change('Nombre del grupo', 'Edición sin guardar');
  step('Revisión'); step('Crear versión');
  expect((await screen.findByRole('alert')).textContent).toContain('El grupo cambió');
  step('Cancelar'); step('Seguir editando'); step('Información');
  expect(screen.getByLabelText('Nombre del grupo').value).toBe('Edición sin guardar');
});
test('keeps historical versions available for preview without submitting answers', async () => {
  await renderPage();
  fireEvent.click(screen.getByRole('button', { name: 'Historial' }));
  await screen.findByRole('button', { name: 'Simular versión 1' });
  step('Simular versión 1');
  expect(screen.getByRole('heading', { name: 'Pregunta histórica.' })).toBeTruthy();
  fireEvent.click(screen.getByRole('radio', { name: 'De acuerdo', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: /Finalizar evaluación/ }));
  fireEvent.click(screen.getByRole('button', { name: /Enviar evaluación/ }));
  await screen.findByRole('heading', { name: 'Vista previa completada' });
  expect(submitEvaluation).not.toHaveBeenCalled();
});
test('requires confirmation to deactivate and combines search with status filters', async () => {
  await renderPage();
  change('Buscar grupo', 'etica');
  fireEvent.click(screen.getByRole('switch'));
  expect(api.setQuestionGroupActive).not.toHaveBeenCalled();
  step('Desactivar');
  await waitFor(() => expect(api.setQuestionGroupActive).toHaveBeenCalledWith(group, false));
  expect(screen.getByText(/No hay grupos activos/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Activos 0/ }));
  expect(screen.queryByRole('article')).toBeNull();
});
test('the live questionnaire submits only the server-assigned dynamic questions', async () => {
  render(<LikertQuestionnaire token="real-token" questionnaire={group} />);
  expect(screen.getByRole('heading', { name: 'Comunico mis ideas.' })).toBeTruthy();
  fireEvent.click(screen.getByRole('radio', { name: 'Neutral' }));
  fireEvent.click(screen.getByRole('button', { name: /Finalizar evaluación/ }));
  fireEvent.click(screen.getByRole('button', { name: /Enviar evaluación/ }));
  await waitFor(() => expect(submitEvaluation).toHaveBeenCalledWith('real-token', [{ questionId: 'q1', value: 3 }]));
});
