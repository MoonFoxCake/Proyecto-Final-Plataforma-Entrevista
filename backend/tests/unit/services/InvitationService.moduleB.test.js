const InvitationService = require('../../../src/services/InvitationService');
const InMemoryInvitationRepository = require('../../../src/repositories/in-memory/InMemoryInvitationRepository');
const InMemoryCandidateRepository = require('../../../src/repositories/in-memory/InMemoryCandidateRepository');
const { ValidationError } = require('../../../src/utils/errors');

const SNAPSHOT = {
  id: 'macro-1',
  schemaVersion: 2,
  name: 'Caperucita roja',
  description: 'Charles Perrault',
  instructions: 'Lee cada parte con atención.',
  maxCharacters: 50,
  defaultTimeLimit: 0,
  sections: [
    {
      id: 's1',
      order: 1,
      title: 'El encargo',
      narrative: 'Había una vez una niña.',
      narrativeAudio: { audioUrl: 'https://cdn/s1.mp3', audioPath: 'm/s1.mp3', visemes: [{ offsetMs: 0, visemeId: 0 }] },
      questions: [
        { id: 'q1', order: 1, text: '¿Qué haría usted en el lugar de Caperucita?', audioUrl: 'https://cdn/q1.mp3', audioPath: 'm/q1.mp3', visemes: [] },
        { id: 'q2', order: 2, text: '¿Y en el lugar de la madre?', audioUrl: '', audioPath: '', visemes: [] },
      ],
    },
    {
      id: 's2',
      order: 2,
      title: 'El bosque',
      narrative: 'El lobo la encontró en el bosque.',
      questions: [{ id: 'q3', order: 1, text: '¿Y en el lugar del lobo?', audioUrl: '', audioPath: '', visemes: [] }],
    },
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

  async function invite(snapshot = SNAPSHOT) {
    macrocaseService.pickSnapshotForModuleB.mockResolvedValue(snapshot);
    await service.sendModuleB('event-1', 'org-1', [approved.id]);
    return tokenFrom(emailService, emailService.sendInvitation.mock.calls.length - 1);
  }

  /** Runs the whole macrocase answering each question with `answer(questionId)`. */
  async function answerEverything(token, answer = (id) => `Respuesta ${id}`) {
    let stage = await service.advanceMacrocase(token, { type: 'START' });
    while (stage.step !== 'review') {
      if (stage.step === 'narrative') {
        stage = await service.advanceMacrocase(token, { type: 'FINISH_NARRATIVE', sectionId: stage.section.id });
      } else {
        stage = await service.advanceMacrocase(token, { type: 'ANSWER', questionId: stage.question.id, text: answer(stage.question.id) });
      }
    }
    return stage;
  }

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

  test('the access check only reveals an overview, never narratives or questions', async () => {
    const access = await service.validateAccess(await invite());

    expect(access).toMatchObject({ state: 'VALID', module: 'B', candidate: { nombreCompleto: 'María Apta' } });
    expect(access.macrocase).toEqual({
      name: 'Caperucita roja', description: 'Charles Perrault', instructions: 'Lee cada parte con atención.',
      maxCharacters: 50, defaultTimeLimit: 0, totalSections: 2, totalQuestions: 3,
    });
  });

  test('serves one stage at a time: intro, each narrative, then its questions one by one', async () => {
    const token = await invite();

    const intro = await service.getMacrocaseStage(token);
    expect(intro).toMatchObject({ state: 'VALID', step: 'intro', progress: { totalSections: 2, totalQuestions: 3, answered: 0 } });
    expect(intro).not.toHaveProperty('section');

    const narrative = await service.advanceMacrocase(token, { type: 'START' });
    expect(narrative).toMatchObject({
      step: 'narrative',
      section: {
        id: 's1', order: 1, title: 'El encargo', narrative: 'Había una vez una niña.',
        narrativeAudio: { audioUrl: 'https://cdn/s1.mp3', visemes: [{ offsetMs: 0, visemeId: 0 }] },
      },
    });
    expect(narrative.section.narrativeAudio).not.toHaveProperty('audioPath');
    expect(narrative).not.toHaveProperty('question');

    const question = await service.advanceMacrocase(token, { type: 'FINISH_NARRATIVE', sectionId: 's1' });
    expect(question).toMatchObject({
      step: 'question',
      section: { id: 's1', title: 'El encargo' },
      question: { id: 'q1', order: 1, text: SNAPSHOT.sections[0].questions[0].text, audioUrl: 'https://cdn/q1.mp3', visemes: [] },
      progress: { sectionIndex: 0, questionIndex: 0, sectionQuestions: 2 },
      draft: '',
    });
    // Once the questions start, the narrative is not sent any more.
    expect(question.section).not.toHaveProperty('narrative');
    expect(question.question).not.toHaveProperty('audioPath');

    const second = await service.advanceMacrocase(token, { type: 'ANSWER', questionId: 'q1', text: 'Avisaría' });
    expect(second).toMatchObject({ step: 'question', question: { id: 'q2' }, progress: { answered: 1 } });

    const nextSection = await service.advanceMacrocase(token, { type: 'ANSWER', questionId: 'q2', text: 'Iría con ella' });
    expect(nextSection).toMatchObject({ step: 'narrative', section: { id: 's2', order: 2, narrative: 'El lobo la encontró en el bosque.' } });
  });

  test('is forward-only: answered questions cannot be rewritten and stages cannot be skipped', async () => {
    const token = await invite();
    await service.advanceMacrocase(token, { type: 'START' });

    // Skipping the narrative or answering a later question does nothing.
    expect(await service.advanceMacrocase(token, { type: 'ANSWER', questionId: 'q1', text: 'Adelantada' }))
      .toMatchObject({ step: 'narrative', progress: { answered: 0 } });
    await service.advanceMacrocase(token, { type: 'FINISH_NARRATIVE', sectionId: 's1' });
    await service.advanceMacrocase(token, { type: 'ANSWER', questionId: 'q1', text: 'Primera versión' });

    // A second answer to q1 (double click, another tab) does not replace the first.
    const stage = await service.advanceMacrocase(token, { type: 'ANSWER', questionId: 'q1', text: 'Corregida' });
    expect(stage).toMatchObject({ step: 'question', question: { id: 'q2' } });
    // Nor does going back to the first narrative.
    expect(await service.advanceMacrocase(token, { type: 'FINISH_NARRATIVE', sectionId: 's1' })).toMatchObject({ question: { id: 'q2' } });

    const progress = [...invitationRepo.progress.values()][0];
    expect(progress.answers).toEqual([expect.objectContaining({ sectionId: 's1', questionId: 'q1', text: 'Primera versión' })]);
  });

  test('requires a non-empty answer within the character limit', async () => {
    const token = await invite();
    await service.advanceMacrocase(token, { type: 'START' });
    await service.advanceMacrocase(token, { type: 'FINISH_NARRATIVE', sectionId: 's1' });

    await expect(service.advanceMacrocase(token, { type: 'ANSWER', questionId: 'q1', text: '   ' })).rejects.toThrow('Escribe una respuesta');
    await expect(service.advanceMacrocase(token, { type: 'ANSWER', questionId: 'q1', text: 'x'.repeat(51) })).rejects.toThrow('50 caracteres');
    await expect(service.advanceMacrocase(token, { type: 'SAVE_DRAFT', questionId: 'q1', text: 'x'.repeat(51) })).rejects.toThrow('50 caracteres');
    // A rejected answer leaves the candidate on the same question.
    expect(await service.getMacrocaseStage(token)).toMatchObject({ step: 'question', question: { id: 'q1' } });
  });

  test('a reload resumes the same stage with the saved draft', async () => {
    const token = await invite();
    await service.advanceMacrocase(token, { type: 'START' });
    await service.advanceMacrocase(token, { type: 'FINISH_NARRATIVE', sectionId: 's1' });
    await service.advanceMacrocase(token, { type: 'SAVE_DRAFT', questionId: 'q1', text: 'A medio escribir' });

    expect(await service.getMacrocaseStage(token)).toMatchObject({ step: 'question', question: { id: 'q1' }, draft: 'A medio escribir' });

    await service.advanceMacrocase(token, { type: 'ANSWER', questionId: 'q1', text: 'Terminada' });
    expect(await service.getMacrocaseStage(token)).toMatchObject({ question: { id: 'q2' }, draft: '' });
  });

  test('a resent link resumes the same progress instead of starting over', async () => {
    const token = await invite();
    await service.advanceMacrocase(token, { type: 'START' });
    await service.advanceMacrocase(token, { type: 'FINISH_NARRATIVE', sectionId: 's1' });
    await service.advanceMacrocase(token, { type: 'ANSWER', questionId: 'q1', text: 'Avisaría' });

    const newToken = await invite();
    await expect(service.getMacrocaseStage(token)).resolves.toEqual({ state: 'CANCELLED' });
    expect(await service.getMacrocaseStage(newToken)).toMatchObject({ step: 'question', question: { id: 'q2' }, progress: { answered: 1 } });
  });

  test('stores the answers with their sections and questions and completes only the Module B stage', async () => {
    const token = await invite();
    await expect(service.submitEvaluation(token, { answers: [] })).rejects.toThrow('Módulo B');
    await expect(service.submitEvaluation(token, { finalize: true })).rejects.toThrow('todas las preguntas');

    const review = await answerEverything(token, (id) => ` Respuesta ${id} `);
    expect(review.summary).toEqual([
      { sectionId: 's1', order: 1, title: 'El encargo', total: 2, answered: 2, timedOut: 0 },
      { sectionId: 's2', order: 2, title: 'El bosque', total: 1, answered: 1, timedOut: 0 },
    ]);

    const result = await service.submitEvaluation(token, { finalize: true });
    expect(result).toMatchObject({ state: 'COMPLETED', alreadySubmitted: false });
    expect(invitationRepo.submissions).toEqual([expect.objectContaining({
      module: 'B',
      instrumentVersion: 'MACROCASE:macro-1:v2',
      candidateId: approved.id,
      answers: [
        { sectionId: 's1', sectionTitle: 'El encargo', questionId: 'q1', question: SNAPSHOT.sections[0].questions[0].text, text: 'Respuesta q1' },
        { sectionId: 's1', sectionTitle: 'El encargo', questionId: 'q2', question: SNAPSHOT.sections[0].questions[1].text, text: 'Respuesta q2' },
        { sectionId: 's2', sectionTitle: 'El bosque', questionId: 'q3', question: SNAPSHOT.sections[1].questions[0].text, text: 'Respuesta q3' },
      ],
    })]);
    const stored = await candidateRepo.findById(approved.id);
    expect(stored.moduleB).toMatchObject({ status: 'COMPLETED', invitationId: invitationRepo.data[0].id });
    expect(stored.moduleB.submittedAt).toBeInstanceOf(Date);
    expect(stored.reviewStatus).toBe('REVIEWED');

    // After the final submission nothing else can be done with the link.
    await expect(service.validateAccess(token)).resolves.toMatchObject({ state: 'COMPLETED' });
    await expect(service.advanceMacrocase(token, { type: 'START' })).resolves.toMatchObject({ state: 'COMPLETED' });
    await expect(service.submitEvaluation(token, { finalize: true })).resolves.toMatchObject({ state: 'COMPLETED' });
    expect(invitationRepo.submissions).toHaveLength(1);
    await expect(service.sendModuleB('event-1', 'org-1', [approved.id])).rejects.toThrow('María Apta');
  });

  test('runs a macrocase stored before sections existed as a single section', async () => {
    const legacy = {
      id: 'macro-old', name: 'Antiguo', introduction: 'Había una vez…', maxCharacters: 100, defaultTimeLimit: 0,
      questions: [{ id: 'q1', order: 1, text: '¿Qué haría usted?', audioUrl: '', visemes: [] }],
    };
    const token = await invite(legacy);

    expect((await service.advanceMacrocase(token, { type: 'START' })).section).toMatchObject({ id: 'section-1', narrative: 'Había una vez…' });
    await answerEverything(token);
    await service.submitEvaluation(token, { finalize: true });
    expect(invitationRepo.submissions[0].answers).toEqual([
      { sectionId: 'section-1', sectionTitle: '', questionId: 'q1', question: '¿Qué haría usted?', text: 'Respuesta q1' },
    ]);
  });

  describe('time limit per question', () => {
    beforeEach(() => { jest.useFakeTimers({ now: new Date('2026-10-12T15:00:00.000Z') }); });
    afterEach(() => { jest.useRealTimers(); });

    async function atFirstQuestion() {
      const token = await invite({ ...SNAPSHOT, defaultTimeLimit: 30 });
      await service.advanceMacrocase(token, { type: 'START' });
      await service.advanceMacrocase(token, { type: 'FINISH_NARRATIVE', sectionId: 's1' });
      return token;
    }

    test('the countdown start is stored once, so a reload does not give extra time', async () => {
      const token = await atFirstQuestion();
      const started = await service.advanceMacrocase(token, { type: 'START_TIMER', questionId: 'q1' });
      expect(started.timer).toEqual({ limitSeconds: 30, startedAt: new Date('2026-10-12T15:00:00.000Z') });

      jest.advanceTimersByTime(10_000);
      await service.advanceMacrocase(token, { type: 'START_TIMER', questionId: 'q1' });
      expect((await service.getMacrocaseStage(token)).timer.startedAt).toEqual(new Date('2026-10-12T15:00:00.000Z'));
    });

    test('accepts an empty answer only once the time really ran out', async () => {
      const token = await atFirstQuestion();
      await service.advanceMacrocase(token, { type: 'START_TIMER', questionId: 'q1' });

      jest.advanceTimersByTime(5_000);
      await expect(service.advanceMacrocase(token, { type: 'ANSWER', questionId: 'q1', text: '', timedOut: true }))
        .rejects.toThrow('Escribe una respuesta');

      jest.advanceTimersByTime(25_000);
      const next = await service.advanceMacrocase(token, { type: 'ANSWER', questionId: 'q1', text: '', timedOut: true });
      expect(next).toMatchObject({ question: { id: 'q2' }, timer: { startedAt: null } });
      expect([...invitationRepo.progress.values()][0].answers[0]).toMatchObject({ questionId: 'q1', text: '', timedOut: true });
    });

    test('an answer that arrives well after the deadline is flagged as timed out', async () => {
      const token = await atFirstQuestion();
      await service.advanceMacrocase(token, { type: 'START_TIMER', questionId: 'q1' });
      jest.advanceTimersByTime(60_000);
      await service.advanceMacrocase(token, { type: 'ANSWER', questionId: 'q1', text: 'Tarde' });
      expect([...invitationRepo.progress.values()][0].answers[0]).toMatchObject({ text: 'Tarde', timedOut: true });
    });

    test('ignores timedOut when the macrocase has no time limit', async () => {
      const token = await invite();
      await service.advanceMacrocase(token, { type: 'START' });
      await service.advanceMacrocase(token, { type: 'FINISH_NARRATIVE', sectionId: 's1' });
      await expect(service.advanceMacrocase(token, { type: 'ANSWER', questionId: 'q1', text: '', timedOut: true }))
        .rejects.toThrow('Escribe una respuesta');
    });
  });
});
