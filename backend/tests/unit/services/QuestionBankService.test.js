const QuestionBankService = require('../../../src/services/QuestionBankService');
const Repo = require('../../../src/repositories/in-memory/InMemoryQuestionGroupRepository');
const EventRepo = require('../../../src/repositories/in-memory/InMemoryEventRepository');
const EventService = require('../../../src/services/EventService');
const InvitationService = require('../../../src/services/InvitationService');
const ReviewService = require('../../../src/services/ReviewService');
const InvitationRepo = require('../../../src/repositories/in-memory/InMemoryInvitationRepository');
const CandidateRepo = require('../../../src/repositories/in-memory/InMemoryCandidateRepository');
const { instrumentOf } = require('../../../src/utils/moduleA');

describe('Question bank and process snapshots', () => {
  let bank, repo;
  const content = { name: 'Instrumento A', description: 'Prueba', questions: [{ id: 'custom-1', text: 'Comunico mis ideas.', dimension: 'Comunicación' }] };
  beforeEach(() => { repo = new Repo(); bank = new QuestionBankService(repo, { random: () => 0.99 }); });
  const deactivateInitial = async () => bank.setActive('initial-a', { active: false, baseVersion: 1 });
  test('initializes the original instrument once and never reactivates it', async () => {
    expect(await bank.list()).toHaveLength(1);
    await deactivateInitial();
    await bank.list();
    expect((await bank.get('initial-a')).active).toBe(false);
    await expect(bank.pickSnapshot()).rejects.toThrow('Activa al menos un grupo');
  });
  test('retains immutable versions and rejects concurrent stale edits', async () => {
    const group = await bank.create(content);
    expect(group).toMatchObject({ version: 1, active: false });
    const next = await bank.update(group.id, { ...content, name: 'Instrumento editado', baseVersion: 1 });
    expect(next.version).toBe(2);
    expect((await bank.history(group.id)).map((version) => version.name)).toEqual(['Instrumento editado', 'Instrumento A']);
    await expect(bank.update(group.id, { ...content, baseVersion: 1 })).rejects.toMatchObject({ statusCode: 409 });
    await expect(bank.setActive(group.id, { active: true, baseVersion: 1 })).rejects.toMatchObject({ statusCode: 409 });
    expect((await bank.history(group.id))).toHaveLength(2);
  });
  test('assigns a complete immutable group once at process creation for both modalities', async () => {
    const group = await bank.create(content);
    await deactivateInitial();
    await bank.setActive(group.id, { active: true, baseVersion: 1 });
    const events = new EventRepo();
    const service = new EventService(events, null, bank);
    const input = { nombre: 'Proceso', puesto: 'Analista', fechaHoraHabilitacion: '2026-01-01T10:00:00Z', fechaHoraCierre: '2026-01-03T10:00:00Z' };
    const first = await service.createEvent('org-1', input);
    expect(first.moduleA.instrument).toMatchObject({ groupId: group.id, version: 1, questions: content.questions });
    await bank.update(group.id, { ...content, baseVersion: 1, questions: [{ id: 'custom-1', text: 'Texto nuevo.' }] });
    const second = await service.createEvent('org-1', input);
    expect(second.moduleA.instrument.version).toBe(2);
    const onsite = await service.createEvent('org-1', { nombre: 'Presencial', puesto: 'Analista', modalidad: 'presencial', presencial: { sede: 'Campus', ubicacion: 'Aula 1', fechaHoraInicio: '2026-11-10T12:00:00Z', fechaHoraFin: '2026-11-10T15:00:00Z' } });
    expect(onsite.moduleA.instrument).toEqual(second.moduleA.instrument);
    expect(instrumentOf(await events.findById(first.id)).questions[0].text).toBe('Comunico mis ideas.');
    await bank.setActive(group.id, { active: false, baseVersion: 2 });
    expect(instrumentOf(first).version).toBe(1);
    await expect(service.createEvent('org-1', input)).rejects.toThrow('Activa al menos un grupo');
  });
  test('accepts only the assigned questions, preserves text for reviews, and serves the same version to all participants', async () => {
    const group = await bank.create(content);
    await deactivateInitial(); await bank.setActive(group.id, { active: true, baseVersion: 1 });
    const events = new EventRepo();
    const eventService = new EventService(events, null, bank);
    const event = await eventService.createEvent('org-1', { nombre: 'Proceso', puesto: 'Analista', fechaHoraHabilitacion: '2020-01-01T10:00:00Z', fechaHoraCierre: '2099-01-03T10:00:00Z' });
    const candidates = new CandidateRepo(); const invitations = new InvitationRepo();
    const org = { findById: async () => ({ companyName: 'Empresa' }) };
    const service = new InvitationService({ eventService, candidateRepo: candidates, invitationRepo: invitations, organizationRepo: org });
    const candidate = await candidates.create({ eventId: event.id, orgId: 'org-1', anonymousCode: 'P-001' });
    // Exercise the submission contract after resolving an already-authenticated access.
    service.resolveAccess = jest.fn(async () => ({ result: { state: 'VALID' }, invitation: { candidateId: candidate.id, module: 'A' }, event, candidate }));
    invitations.completeWithSubmission = jest.fn(async (_hash, submission) => {
      invitations.submissions.push({ ...submission, candidateId: candidate.id, eventId: event.id, submittedAt: new Date() });
      return { state: 'COMPLETED', submittedAt: new Date() };
    });
    await expect(service.submitEvaluation('token', { answers: [{ questionId: 'demo-a-1', value: 3 }] })).rejects.toThrow('preguntas asignadas');
    await expect(service.submitEvaluation('token', { answers: [{ questionId: 'custom-1', value: 6 }] })).rejects.toThrow('valores de 1 a 5');
    await service.submitEvaluation('token', { answers: [{ questionId: 'custom-1', value: 4 }] });
    expect(invitations.submissions[0]).toMatchObject({ instrumentVersion: `QUESTION_GROUP:${group.id}:v1`, answers: [{ questionId: 'custom-1', value: 4, text: 'Comunico mis ideas.', dimension: 'Comunicación', number: 1 }] });
    await bank.update(group.id, { ...content, baseVersion: 1, questions: [{ id: 'custom-1', text: 'Cambiado.' }] });
    const review = new ReviewService({ eventRepo: events, candidateRepo: candidates, invitationRepo: invitations, organizationRepo: org });
    const result = await review.getParticipant(event.id, 'P-001');
    expect(result.answers[0]).toMatchObject({ text: 'Comunico mis ideas.', value: 4 });
    expect(result.process.questionnaire.version).toBe(1);
  });
  test('validates empty groups, duplicate question IDs, oversized content and explicit base versions', async () => {
    await expect(bank.create({ ...content, questions: [] })).rejects.toThrow('entre 1 y 100');
    await expect(bank.create({ ...content, questions: [content.questions[0], content.questions[0]] })).rejects.toThrow('únicos');
    await expect(bank.create({ ...content, questions: [{ text: 'x'.repeat(1001) }] })).rejects.toThrow('1000 caracteres');
    await expect(bank.update('initial-a', content)).rejects.toThrow('versión base');
  });
  test('legacy processes always retain their original instrument', () => {
    expect(instrumentOf({ id: 'legacy' })).toMatchObject({ instrumentVersion: 'DEMO_A_V1', questions: expect.arrayContaining([expect.objectContaining({ id: 'demo-a-1' })]) });
  });
  test('chooses among active groups and exposes the same snapshot to initial and later invitees', async () => {
    const group = await bank.create(content);
    await deactivateInitial(); await bank.setActive(group.id, { active: true, baseVersion: 1 });
    const alternative = await bank.create({ ...content, name: 'Alternativa', questions: [{ id: 'alt', text: 'Una afirmación alternativa.' }] });
    await bank.setActive(alternative.id, { active: true, baseVersion: 1 });
    expect((await bank.pickSnapshot()).groupId).toBe(alternative.id);
    bank.random = () => 0;
    expect((await bank.pickSnapshot()).groupId).toBe(group.id);
    const events = new EventRepo(); const candidates = new CandidateRepo(); const invitations = new InvitationRepo();
    const eventService = new EventService(events, null, bank);
    const event = await eventService.createEvent('org-1', { nombre: 'Proceso', puesto: 'Analista', fechaHoraHabilitacion: new Date(Date.now() - 60000).toISOString(), fechaHoraCierre: new Date(Date.now() + 7 * 864e5).toISOString() });
    const email = { sendInvitation: jest.fn(async () => ({ id: 'email-1' })) };
    const service = new InvitationService({ eventService, candidateRepo: candidates, invitationRepo: invitations,
      candidateService: { listByEvent: (id, org) => candidates.findByEvent(id, org) },
      organizationRepo: { findById: async () => ({ name: 'Empresa' }) }, emailService: email, frontendUrl: 'https://example.com' });
    for (let index = 0; index < 2; index++) await candidates.create({ eventId: event.id, orgId: 'org-1', nombreCompleto: `Candidato ${index}`, correo: `c${index}@example.com`, status: 'INVITED_PENDING' });
    await service.publishForEvent(event.id, 'org-1');
    await bank.update(group.id, { ...content, baseVersion: 1, questions: [{ id: 'changed', text: 'Instrumento futuro.' }] });
    await bank.setActive(group.id, { active: false, baseVersion: 2 });
    await candidates.create({ eventId: event.id, orgId: 'org-1', nombreCompleto: 'Tercer candidato', correo: 'c3@example.com', status: 'INVITED_PENDING' });
    await service.publishForEvent(event.id, 'org-1');
    const tokens = email.sendInvitation.mock.calls.map(([delivery]) => new URL(delivery.accessUrl).searchParams.get('token'));
    expect(tokens).toHaveLength(3);
    for (const token of tokens) {
      const access = await service.validateAccess(token);
      expect(access.questionnaire).toEqual(event.moduleA.instrument);
      expect(access.questionnaire.version).toBe(1);
    }
  });
});
