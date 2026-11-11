const ReviewService = require('../../../src/services/ReviewService');
const InMemoryEventRepository = require('../../../src/repositories/in-memory/InMemoryEventRepository');
const InMemoryCandidateRepository = require('../../../src/repositories/in-memory/InMemoryCandidateRepository');
const InMemoryInvitationRepository = require('../../../src/repositories/in-memory/InMemoryInvitationRepository');
const InMemoryOrganizationRepository = require('../../../src/repositories/in-memory/InMemoryOrganizationRepository');

describe('ReviewService', () => {
  let eventRepo;
  let candidateRepo;
  let invitationRepo;
  let service;
  let event;
  let candidate;

  beforeEach(async () => {
    eventRepo = new InMemoryEventRepository();
    candidateRepo = new InMemoryCandidateRepository();
    invitationRepo = new InMemoryInvitationRepository();
    const organizationRepo = new InMemoryOrganizationRepository();
    await organizationRepo.create({ id: 'org-1', companyName: 'TechCorp' });
    event = await eventRepo.create({ orgId: 'org-1', name: 'Programa Trainee', position: 'Desarrollador', status: 'ACTIVE' });
    candidate = await candidateRepo.create({
      eventId: event.id, orgId: 'org-1', anonymousCode: 'P-001', nombreCompleto: 'Identidad Privada',
      correo: 'privado@example.com', cedula: '123', status: 'EVALUATION_COMPLETED', submittedAt: new Date(),
    });
    invitationRepo.submissions.push({
      id: 'submission-1', candidateId: candidate.id, eventId: event.id, module: 'A', submittedAt: new Date(),
      answers: [{ questionId: 'demo-a-1', value: 4 }],
    });
    service = new ReviewService({ eventRepo, candidateRepo, invitationRepo, organizationRepo });
  });

  test('returns only anonymous participant data to administrators', async () => {
    const process = await service.getProcess(event.id);
    expect(process.participants).toEqual([expect.objectContaining({ anonymousId: 'P-001', status: 'PENDING_REVIEW' })]);
    const serialized = JSON.stringify(process);
    expect(serialized).not.toContain('Identidad Privada');
    expect(serialized).not.toContain('privado@example.com');
    expect(process.participants[0]).not.toHaveProperty('cedula');
  });

  test('includes stable organization IDs for current and legacy processes', async () => {
    const legacy = await eventRepo.create({ recruiterOrgId: 'org-1', name: 'Proceso anterior' });
    const processes = await service.listProcesses();
    expect(processes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: event.id, orgId: 'org-1', company: 'TechCorp' }),
      expect.objectContaining({ id: legacy.id, orgId: 'org-1', company: 'TechCorp' }),
    ]));
  });

  test('exposes individual Likert responses with question context', async () => {
    const participant = await service.getParticipant(event.id, 'P-001');
    expect(participant).toMatchObject({ anonymousId: 'P-001', module: 'A', status: 'PENDING_REVIEW' });
    expect(participant.answers[0]).toMatchObject({ questionId: 'demo-a-1', dimension: 'HBE', value: 4, label: 'De acuerdo' });
    expect(participant).not.toHaveProperty('nombreCompleto');
  });

  test('adds the written Module B answers next to the Module A ones', async () => {
    expect((await service.getParticipant(event.id, 'P-001')).moduleB).toBeNull();

    await eventRepo.update(event.id, { moduleB: { macrocase: { id: 'macro-1', name: 'Caperucita roja' } } });
    await candidateRepo.update(candidate.id, { moduleB: { status: 'COMPLETED', invitedAt: new Date() } });
    invitationRepo.submissions.push({
      id: 'submission-2', candidateId: candidate.id, eventId: event.id, module: 'B', submittedAt: new Date(),
      answers: [{ questionId: 'q1', question: '¿Qué haría usted?', text: 'Avisaría a mi madre.' }],
    });

    const participant = await service.getParticipant(event.id, 'P-001');
    expect(participant.module).toBe('A');
    expect(participant.answers).toHaveLength(1);
    expect(participant.moduleB).toMatchObject({
      status: 'COMPLETED',
      macrocaseName: 'Caperucita roja',
      answers: [{ questionId: 'q1', number: 1, question: '¿Qué haría usted?', text: 'Avisaría a mi madre.' }],
    });
    expect((await service.getProcess(event.id)).participants[0].moduleBStatus).toBe('COMPLETED');
    // Answers saved before sections existed come out as one untitled section.
    expect(participant.moduleB.sections).toEqual([
      { sectionId: 'section-1', number: 1, title: '', answers: [expect.objectContaining({ questionId: 'q1', number: 1 })] },
    ]);
  });

  test('the ethical review stays anonymous for onsite candidates (no name, ID, attendance or access data)', async () => {
    await candidateRepo.update(candidate.id, {
      nombreCompleto: 'María Identificable',
      cedula: '1234567890101',
      correo: 'maria@example.com',
      citation: { status: 'SENT', providerId: 'email-1', appointment: { venue: 'Campus' } },
      attendance: { A: { status: 'PRESENT', markedBy: 'applicator-1' } },
    });

    const process = JSON.stringify(await service.getProcess(event.id));
    const participant = JSON.stringify(await service.getParticipant(event.id, 'P-001'));
    for (const output of [process, participant]) {
      expect(output).not.toMatch(/María Identificable|1234567890101|maria@example\.com|applicator-1|attendance|citation|Campus/);
    }
  });

  test('groups the Module B answers by macrocase section', async () => {
    await eventRepo.update(event.id, { moduleB: { macrocase: { id: 'macro-1', name: 'Caperucita roja' } } });
    await candidateRepo.update(candidate.id, { moduleB: { status: 'COMPLETED', invitedAt: new Date() } });
    invitationRepo.submissions.push({
      id: 'submission-2', candidateId: candidate.id, eventId: event.id, module: 'B', submittedAt: new Date(),
      instrumentVersion: 'MACROCASE:macro-1:v2',
      answers: [
        { sectionId: 's1', sectionTitle: 'El encargo', questionId: 'q1', question: '¿Uno?', text: 'A' },
        { sectionId: 's1', sectionTitle: 'El encargo', questionId: 'q2', question: '¿Dos?', text: 'B' },
        { sectionId: 's2', sectionTitle: 'El bosque', questionId: 'q3', question: '¿Tres?', text: '', timedOut: true },
      ],
    });

    const { moduleB } = await service.getParticipant(event.id, 'P-001');
    expect(moduleB.instrumentVersion).toBe('MACROCASE:macro-1:v2');
    expect(moduleB.sections.map((section) => [section.number, section.title, section.answers.map((answer) => answer.number)])).toEqual([
      [1, 'El encargo', [1, 2]],
      [2, 'El bosque', [3]],
    ]);
    expect(moduleB.sections[1].answers[0]).toMatchObject({ text: '', timedOut: true });
  });

  test('shows numeric Likert choices and unanswered timeouts alongside legacy written answers', () => {
    const detail = service.moduleBDetail({ moduleB: { macrocase: { name: 'Caso Likert' } } }, { moduleB: { status: 'COMPLETED' } }, {
      answers: [
        { questionId: 'q1', sectionId: 's1', question: 'Comunicaría el riesgo.', value: 5 },
        { questionId: 'q2', sectionId: 's1', question: 'Pediría ayuda.', value: null, timedOut: true },
        { questionId: 'q3', sectionId: 's1', question: 'Respuesta anterior', text: 'Texto histórico.' },
      ],
    });
    expect(detail.answers[0]).toMatchObject({ value: 5, label: 'Totalmente de acuerdo' });
    expect(detail.sections[0].answers[0]).toMatchObject({ value: 5, label: 'Totalmente de acuerdo' });
    expect(detail.answers[1]).toMatchObject({ value: null, label: null, timedOut: true });
    expect(detail.answers[2]).toMatchObject({ text: 'Texto histórico.' });
  });

  test('shows the four options of a multiple-choice answer with the one marked', () => {
    const detail = service.moduleBDetail({ moduleB: { macrocase: { name: 'Caso' } } }, { moduleB: { status: 'COMPLETED' } }, {
      answers: [{ questionId: 'q1', sectionId: 's1', question: '¿Qué harías?', value: 'o2', answerLabel: 'Esperar', options: ['Avisar', 'Esperar', 'Denunciar', 'Ignorar'] }],
    });
    expect(detail.answers[0]).toMatchObject({ value: 'o2', label: 'Esperar', options: ['Avisar', 'Esperar', 'Denunciar', 'Ignorar'] });
  });

  test('saves observations and marks the participant as reviewed', async () => {
    const reviewed = await service.saveReview(event.id, 'P-001', { observations: 'Revisión manual.', reviewed: true }, 'admin-1');
    expect(reviewed).toMatchObject({ status: 'REVIEWED', observations: 'Revisión manual.' });
  });

  test('tells where the result of each phase stands, and which PDFs were delivered', async () => {
    await eventRepo.update(event.id, { modules: ['A', 'B'], moduleB: { macrocase: { id: 'macro-1', name: 'Caso ingeniería' } } });
    let process = await service.getProcess(event.id);
    expect(process.reports).toEqual({ A: 'PENDING', B: 'NOT_STARTED' });
    expect(process.macrocaseName).toBe('Caso ingeniería');

    const deliveredAt = new Date();
    await eventRepo.update(event.id, { moduleResults: { A: { fileName: 'fase-a.pdf', path: 'x', deliveredAt, status: 'DELIVERED' } } });
    await candidateRepo.update(candidate.id, { moduleB: { status: 'INVITATION_SENT' } });
    process = await service.getProcess(event.id);
    expect(process.reports).toEqual({ A: 'DELIVERED', B: 'IN_PROGRESS' });
    expect(process.results).toEqual({ A: { fileName: 'fase-a.pdf', deliveredAt } });
    expect(JSON.stringify(process)).not.toContain('"path"');
  });
});
