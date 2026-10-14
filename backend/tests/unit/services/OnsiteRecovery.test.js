const OnsiteAccessService = require('../../../src/services/OnsiteAccessService');
const OnsiteApplicationService = require('../../../src/services/OnsiteApplicationService');
const AccessCredentialService = require('../../../src/services/AccessCredentialService');
const InvitationService = require('../../../src/services/InvitationService');
const AttemptLimiter = require('../../../src/utils/AttemptLimiter');
const InMemoryAccessCredentialRepository = require('../../../src/repositories/in-memory/InMemoryAccessCredentialRepository');
const InMemoryAuditLogRepository = require('../../../src/repositories/in-memory/InMemoryAuditLogRepository');
const InMemoryCandidateRepository = require('../../../src/repositories/in-memory/InMemoryCandidateRepository');
const InMemoryInvitationRepository = require('../../../src/repositories/in-memory/InMemoryInvitationRepository');

const PEPPER = 'p'.repeat(32);
const SESSION_A = {
  venue: 'Campus Central', room: 'Aula 204', startsAt: new Date('2026-11-05T14:00:00.000Z'), endsAt: new Date('2026-11-05T16:00:00.000Z'),
};
const SESSION_B = {
  venue: 'Campus Norte', room: 'Sala 3', startsAt: new Date('2026-11-20T15:00:00.000Z'), endsAt: new Date('2026-11-20T17:00:00.000Z'),
};
const MACROCASE = {
  id: 'm1',
  schemaVersion: 2,
  name: 'Caso',
  maxCharacters: 500,
  defaultTimeLimit: 0,
  sections: [{
    id: 's1',
    order: 1,
    title: 'Parte 1',
    narrative: 'Había una vez…',
    questions: [{ id: 'q1', order: 1, text: '¿Uno?' }, { id: 'q2', order: 2, text: '¿Dos?' }],
  }],
};
const LAB_PC = { ip: '10.0.0.1', clientId: 'lab-pc-07' };
const OTHER_PC = { ip: '10.0.0.1', clientId: 'lab-pc-12' };

/**
 * Incident recovery (Phase 8): a supervisor revokes or reissues a code and
 * the candidate continues on the same computer (D7: no switching), without
 * losing saved answers and without a second evaluation.
 */
describe('onsite incident recovery', () => {
  let repos;
  let event;
  let clock;
  let credentials;
  let applicator;
  let invitations;
  let access;
  let ana;

  beforeEach(async () => {
    repos = {
      candidateRepo: new InMemoryCandidateRepository(),
      credentialRepo: new InMemoryAccessCredentialRepository(),
      invitationRepo: new InMemoryInvitationRepository(),
      auditRepo: new InMemoryAuditLogRepository(),
    };
    ana = await repos.candidateRepo.create({
      eventId: 'event-1', orgId: 'org-1', nombreCompleto: 'Ana López', cedula: '100',
      status: 'EVALUATION_COMPLETED', submittedAt: new Date('2026-11-05T15:00:00.000Z'), reviewStatus: 'REVIEWED',
      citation: { status: 'SENT' }, moduleB: { status: 'CITED', citation: { status: 'SENT', appointment: SESSION_B } },
    });
    event = {
      id: 'event-1', orgId: 'org-1', name: 'Concurso', modality: 'onsite', modules: ['A', 'B'], onsite: SESSION_A,
      status: 'PUBLISHED', evaluationsPublishedAt: new Date(), moduleB: { macrocase: MACROCASE },
    };
    clock = { now: new Date('2026-11-18T12:00:00.000Z') };
    const now = () => clock.now;
    const eventService = { getEvent: jest.fn(async () => event) };
    credentials = new AccessCredentialService({ ...repos, credentialRepo: repos.credentialRepo, eventService, pepper: PEPPER, now });
    applicator = new OnsiteApplicationService({ ...repos, eventService, now });
    invitations = new InvitationService({
      ...repos,
      candidateService: {},
      eventService,
      organizationRepo: { findById: jest.fn().mockResolvedValue({ name: 'TechCorp' }) },
      emailService: {},
      now,
    });
    access = new OnsiteAccessService({
      ...repos,
      eventService,
      invitationService: invitations,
      limiter: new AttemptLimiter({ rules: { client: { max: 5, windowMs: 300_000 }, ip: { max: 40, windowMs: 600_000 } }, now: () => clock.now.getTime() }),
      pepper: PEPPER,
      now,
      sleep: async () => {},
    });
  });

  const issueB = async () => (await credentials.issueBatch('event-1', 'org-1', { module: 'B', candidateIds: [ana.id] }, 'preparer')).issued[0];
  const checkIn = async () => {
    await applicator.setAttendance('event-1', 'org-1', { module: 'B', candidateId: ana.id, present: true }, 'applicator');
    return applicator.enable('event-1', 'org-1', { module: 'B', candidateIds: [ana.id] }, 'applicator');
  };
  const credentialOf = (id) => repos.credentialRepo.data.find((item) => item.id === id);

  async function startAndAnswerFirstQuestion() {
    const card = await issueB();
    clock.now = new Date('2026-11-20T15:05:00.000Z');
    await checkIn();
    const session = await access.login(card.code, LAB_PC);
    await invitations.advanceMacrocase(session.token, { type: 'START' });
    await invitations.advanceMacrocase(session.token, { type: 'FINISH_NARRATIVE', sectionId: 's1' });
    await invitations.advanceMacrocase(session.token, { type: 'ANSWER', questionId: 'q1', text: 'Primera respuesta' });
    await invitations.advanceMacrocase(session.token, { type: 'SAVE_DRAFT', questionId: 'q2', text: 'A medio escribir' });
    return { card, token: session.token };
  }

  test('an interrupted session is recovered on the same computer, keeping the saved answers', async () => {
    const { card, token: oldToken } = await startAndAnswerFirstQuestion();

    // The tab was closed. The supervisor reissues the code (no reprint needed: it is shown on screen).
    const { issued: [replacement] } = await credentials.reissue('event-1', 'org-1', card.credentialId, 'supervisor', 'Se cerró el navegador');
    expect(credentialOf(card.credentialId)).toMatchObject({ status: 'REVOKED', revokedBy: 'supervisor', replacedById: replacement.credentialId });
    expect(credentialOf(replacement.credentialId)).toMatchObject({ status: 'GENERATED', requiredClientId: 'lab-pc-07', replacesId: card.credentialId });
    // The old session cannot be used any more (no concurrent sessions).
    await expect(invitations.getMacrocaseStage(oldToken)).resolves.toEqual({ state: 'CANCELLED' });

    // Still marked present: the applicator only has to enable the new code.
    expect((await applicator.enable('event-1', 'org-1', { module: 'B', candidateIds: [ana.id] }, 'applicator')).enabled).toHaveLength(1);
    const resumed = await access.login(replacement.code, LAB_PC);
    expect(resumed.state).toBe('VALID');

    await expect(invitations.getMacrocaseStage(resumed.token)).resolves.toMatchObject({
      step: 'question', question: { id: 'q2' }, draft: 'A medio escribir', progress: { answered: 1 },
    });
    await invitations.advanceMacrocase(resumed.token, { type: 'ANSWER', questionId: 'q2', text: 'Segunda respuesta' });
    await expect(invitations.submitEvaluation(resumed.token, { finalize: true })).resolves.toMatchObject({ state: 'COMPLETED' });

    // One evaluation, one submission, with both answers.
    expect(repos.invitationRepo.submissions).toHaveLength(1);
    expect(repos.invitationRepo.submissions[0].answers.map((answer) => answer.text)).toEqual(['Primera respuesta', 'Segunda respuesta']);
    await expect(invitations.submitEvaluation(oldToken, { finalize: true })).resolves.toEqual({ state: 'CANCELLED' });
  });

  test('the replacement code does not work from another computer (D7)', async () => {
    const { card } = await startAndAnswerFirstQuestion();
    const { issued: [replacement] } = await credentials.reissue('event-1', 'org-1', card.credentialId, 'supervisor', 'Se cerró el navegador');
    await checkIn();

    await expect(access.login(replacement.code, OTHER_PC)).resolves.toEqual({ state: 'OTHER_COMPUTER' });
    await expect(access.login(replacement.code, { ip: '10.0.0.1' })).resolves.toEqual({ state: 'OTHER_COMPUTER' });
    // Not consumed: it still works on the right computer.
    expect(credentialOf(replacement.credentialId).status).toBe('ENABLED');
    await expect(access.login(replacement.code, LAB_PC)).resolves.toMatchObject({ state: 'VALID' });
    expect(repos.auditRepo.data.filter((entry) => entry.action === 'ONSITE_LOGIN_OTHER_COMPUTER')).toHaveLength(2);
  });

  test('revoking a code in use ends its session at once', async () => {
    const { card, token } = await startAndAnswerFirstQuestion();
    const revoked = await credentials.revoke('event-1', 'org-1', card.credentialId, 'supervisor', 'Uso indebido');

    expect(revoked).toMatchObject({ status: 'REVOKED', revokedBy: 'supervisor', revokeReason: 'Uso indebido' });
    await expect(invitations.advanceMacrocase(token, { type: 'ANSWER', questionId: 'q2', text: 'x' })).resolves.toEqual({ state: 'CANCELLED' });
    expect(repos.invitationRepo.data.find((item) => item.channel === 'onsite')).toMatchObject({ status: 'CANCELLED', cancelledBy: 'supervisor', cancelReason: 'Uso indebido' });
  });

  test('a lost card is replaced without binding it to any computer (it was never used)', async () => {
    const card = await issueB();
    const { issued: [replacement] } = await credentials.reissue('event-1', 'org-1', card.credentialId, 'supervisor', 'Tarjeta extraviada');
    expect(credentialOf(replacement.credentialId).requiredClientId).toBeUndefined();

    clock.now = new Date('2026-11-20T15:05:00.000Z');
    await checkIn();
    await expect(access.login(card.code, OTHER_PC)).resolves.toEqual({ state: 'REVOKED' });
    await expect(access.login(replacement.code, OTHER_PC)).resolves.toMatchObject({ state: 'VALID' });
  });

  test('every recovery step is recorded, without codes', async () => {
    const { card } = await startAndAnswerFirstQuestion();
    const { issued: [replacement] } = await credentials.reissue('event-1', 'org-1', card.credentialId, 'supervisor', 'Se cerró el navegador');
    await checkIn();
    await access.login(replacement.code, LAB_PC);

    const actions = repos.auditRepo.data.map((entry) => entry.action);
    expect(actions).toEqual(expect.arrayContaining(['CREDENTIAL_REVOKED', 'CREDENTIAL_REISSUED', 'ONSITE_SESSION_CANCELLED']));
    expect(repos.auditRepo.data.filter((entry) => entry.action === 'ONSITE_SESSION_STARTED').at(-1)).toMatchObject({
      credentialId: replacement.credentialId, recovery: true, replacesId: card.credentialId,
    });
    expect(repos.auditRepo.data.find((entry) => entry.action === 'ONSITE_SESSION_CANCELLED')).toMatchObject({ actorUid: 'supervisor', reason: 'Se cerró el navegador' });
    expect(JSON.stringify(repos.auditRepo.data)).not.toContain(replacement.code);
  });

  test('after the final submission nothing can be reissued or revoked', async () => {
    const { card, token } = await startAndAnswerFirstQuestion();
    await invitations.advanceMacrocase(token, { type: 'ANSWER', questionId: 'q2', text: 'Fin' });
    await invitations.submitEvaluation(token, { finalize: true });

    await expect(credentials.reissue('event-1', 'org-1', card.credentialId, 'supervisor')).rejects.toThrow('ya completó el Módulo B');
    await expect(credentials.revoke('event-1', 'org-1', card.credentialId, 'supervisor')).rejects.toThrow('ya completó el Módulo B');
  });
});
