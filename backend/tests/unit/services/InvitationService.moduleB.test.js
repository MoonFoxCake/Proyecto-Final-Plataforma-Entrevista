const InvitationService = require('../../../src/services/InvitationService');
const InMemoryInvitationRepository = require('../../../src/repositories/in-memory/InMemoryInvitationRepository');
const InMemoryCandidateRepository = require('../../../src/repositories/in-memory/InMemoryCandidateRepository');
const { ValidationError } = require('../../../src/utils/errors');

const SNAPSHOT = {
  id: 'macro-1',
  name: 'Caperucita roja',
  description: 'Charles Perrault',
  introduction: 'Había una vez…',
  maxCharacters: 50,
  defaultTimeLimit: 30,
  questions: [
    { id: 'q1', order: 1, text: '¿Qué haría usted en el lugar de Caperucita?', audioUrl: 'https://cdn/q1.mp3', audioPath: 'm/q1.mp3', visemes: [{ offsetMs: 0, visemeId: 0 }] },
    { id: 'q2', order: 2, text: '¿Y en el lugar del lobo?', audioUrl: '', audioPath: '', visemes: [] },
  ],
};

const tokenFrom = (emailService, call = 0) => new URL(emailService.sendInvitation.mock.calls[call][0].accessUrl).searchParams.get('token');

describe('InvitationService · Module B (second stage)', () => {
  let invitationRepo;
  let candidateRepo;
  let event;
  let emailService;
  let macrocaseService;
  let service;
  let approved;
  let notReviewed;

  beforeEach(async () => {
    invitationRepo = new InMemoryInvitationRepository();
    candidateRepo = new InMemoryCandidateRepository();
    const base = { eventId: 'event-1', orgId: 'org-1', fechaHoraCita: new Date('2026-10-01T15:00:00.000Z') };
    approved = await candidateRepo.create({
      ...base, nombreCompleto: 'María Apta', correo: 'maria@example.com',
      status: 'EVALUATION_COMPLETED', submittedAt: new Date(), reviewStatus: 'REVIEWED',
    });
    notReviewed = await candidateRepo.create({
      ...base, nombreCompleto: 'Carlos Pendiente', correo: 'carlos@example.com',
      status: 'EVALUATION_COMPLETED', submittedAt: new Date(), reviewStatus: 'PENDING_REVIEW',
    });
    event = { id: 'event-1', orgId: 'org-1', name: 'Evento Demo', status: 'PUBLISHED', evaluationsPublishedAt: new Date() };
    emailService = { sendInvitation: jest.fn().mockResolvedValue({ id: 'email-1' }) };
    macrocaseService = { pickSnapshotForModuleB: jest.fn().mockResolvedValue(SNAPSHOT) };
    service = new InvitationService({
      invitationRepo,
      candidateService: { listByEvent: jest.fn() },
      candidateRepo,
      eventService: {
        getEvent: jest.fn(async () => event),
        assignModuleB: jest.fn(async (_eventId, _orgId, macrocase) => {
          event = { ...event, moduleB: { macrocase, assignedAt: new Date() } };
          return event;
        }),
      },
      organizationRepo: { findById: jest.fn().mockResolvedValue({ id: 'org-1', name: 'TechCorp' }) },
      emailService,
      frontendUrl: 'https://demo.example.com',
      macrocaseService,
    });
  });

  test('is only available once Module A results are published', async () => {
    event = { ...event, status: 'ACTIVE', evaluationsPublishedAt: null };
    await expect(service.sendModuleB('event-1', 'org-1', [approved.id])).rejects.toBeInstanceOf(ValidationError);
    expect(emailService.sendInvitation).not.toHaveBeenCalled();
  });

  test('refuses candidates whose Module A profile was not reviewed', async () => {
    await expect(service.sendModuleB('event-1', 'org-1', [approved.id, notReviewed.id]))
      .rejects.toThrow('Carlos Pendiente');
    await expect(service.sendModuleB('event-1', 'org-1', ['otro-evento'])).rejects.toBeInstanceOf(ValidationError);
    expect(emailService.sendInvitation).not.toHaveBeenCalled();
  });

  test('sends a Module B link to the selected candidates and copies the macrocase into the event once', async () => {
    const before = Date.now();
    const result = await service.sendModuleB('event-1', 'org-1', [approved.id, approved.id]);

    expect(result).toMatchObject({ total: 1, sent: 1, failed: 0 });
    expect(macrocaseService.pickSnapshotForModuleB).toHaveBeenCalledTimes(1);
    expect(event.moduleB.macrocase).toBe(SNAPSHOT);
    const [invitation] = invitationRepo.data;
    expect(invitation).toMatchObject({ module: 'B', status: 'ACTIVE', candidateId: approved.id });
    expect(invitation.availableAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(invitation.expiresAt.getTime() - invitation.availableAt.getTime()).toBe(3 * 24 * 60 * 60 * 1000);
    expect(emailService.sendInvitation).toHaveBeenCalledWith(expect.objectContaining({ module: 'B', expiresAt: invitation.expiresAt }));

    const stored = await candidateRepo.findById(approved.id);
    expect(stored.moduleB).toMatchObject({ status: 'INVITATION_SENT', invitationId: invitation.id });
    expect(stored.status).toBe('EVALUATION_COMPLETED'); // Module A untouched

    // Resending replaces the previous Module B link and keeps the same macrocase copy.
    await service.sendModuleB('event-1', 'org-1', [approved.id]);
    expect(macrocaseService.pickSnapshotForModuleB).toHaveBeenCalledTimes(1);
    expect(invitationRepo.data.map((item) => item.status)).toEqual(['CANCELLED', 'ACTIVE']);
  });

  test('gives the candidate the macrocase without internal storage fields', async () => {
    await service.sendModuleB('event-1', 'org-1', [approved.id]);

    const access = await service.validateAccess(tokenFrom(emailService));

    expect(access).toMatchObject({ state: 'VALID', module: 'B', candidate: { nombreCompleto: 'María Apta' } });
    expect(access.macrocase.questions).toEqual([
      { id: 'q1', order: 1, text: SNAPSHOT.questions[0].text, audioUrl: 'https://cdn/q1.mp3', visemes: [{ offsetMs: 0, visemeId: 0 }] },
      { id: 'q2', order: 2, text: SNAPSHOT.questions[1].text, audioUrl: '', visemes: [] },
    ]);
    expect(access.macrocase).not.toHaveProperty('id');
  });

  test('stores the written answers with their questions and completes only the Module B stage', async () => {
    await service.sendModuleB('event-1', 'org-1', [approved.id]);
    const token = tokenFrom(emailService);

    await expect(service.submitEvaluation(token, { answers: [] })).rejects.toThrow('Módulo B');
    await expect(service.submitEvaluation(token, { macrocaseAnswers: [{ questionId: 'q1', text: 'Sí' }] }))
      .rejects.toThrow('cada pregunta');
    await expect(service.submitEvaluation(token, {
      macrocaseAnswers: [{ questionId: 'q1', text: 'x'.repeat(51) }, { questionId: 'q2', text: 'No' }],
    })).rejects.toThrow('50 caracteres');

    const result = await service.submitEvaluation(token, {
      macrocaseAnswers: [{ questionId: 'q2', text: ' Correría al bosque ' }, { questionId: 'q1', text: 'Avisaría a mi madre' }],
    });

    expect(result).toMatchObject({ state: 'COMPLETED', alreadySubmitted: false });
    expect(invitationRepo.submissions).toEqual([expect.objectContaining({
      module: 'B',
      instrumentVersion: 'MACROCASE:macro-1',
      candidateId: approved.id,
      answers: [
        { questionId: 'q1', question: SNAPSHOT.questions[0].text, text: 'Avisaría a mi madre' },
        { questionId: 'q2', question: SNAPSHOT.questions[1].text, text: 'Correría al bosque' },
      ],
    })]);
    const stored = await candidateRepo.findById(approved.id);
    expect(stored.moduleB).toMatchObject({ status: 'COMPLETED', invitationId: invitationRepo.data[0].id });
    expect(stored.moduleB.submittedAt).toBeInstanceOf(Date);
    expect(stored.reviewStatus).toBe('REVIEWED');

    await expect(service.validateAccess(token)).resolves.toMatchObject({ state: 'COMPLETED' });
    await expect(service.sendModuleB('event-1', 'org-1', [approved.id])).rejects.toThrow('María Apta');
  });

  test('accepts an empty answer only when its time ran out', async () => {
    await service.sendModuleB('event-1', 'org-1', [approved.id]);
    const token = tokenFrom(emailService);
    expect((await service.validateAccess(token)).macrocase.defaultTimeLimit).toBe(30);

    await expect(service.submitEvaluation(token, {
      macrocaseAnswers: [{ questionId: 'q1', text: '' }, { questionId: 'q2', text: 'No' }],
    })).rejects.toThrow('cada pregunta');

    await service.submitEvaluation(token, {
      macrocaseAnswers: [{ questionId: 'q1', text: '', timedOut: true }, { questionId: 'q2', text: 'Iría por otro camino', timedOut: true }],
    });
    expect(invitationRepo.submissions[0].answers).toEqual([
      { questionId: 'q1', question: SNAPSHOT.questions[0].text, text: '', timedOut: true },
      { questionId: 'q2', question: SNAPSHOT.questions[1].text, text: 'Iría por otro camino', timedOut: true },
    ]);
  });

  test('ignores timedOut when the macrocase has no time limit', async () => {
    macrocaseService.pickSnapshotForModuleB.mockResolvedValue({ ...SNAPSHOT, defaultTimeLimit: 0 });
    await service.sendModuleB('event-1', 'org-1', [approved.id]);
    const token = tokenFrom(emailService);
    expect((await service.validateAccess(token)).macrocase.defaultTimeLimit).toBe(0);

    await expect(service.submitEvaluation(token, {
      macrocaseAnswers: [{ questionId: 'q1', text: '', timedOut: true }, { questionId: 'q2', text: 'No' }],
    })).rejects.toThrow('cada pregunta');
  });
});
