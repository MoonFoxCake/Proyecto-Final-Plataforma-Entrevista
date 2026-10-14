const OnsiteAccessService = require('../../../src/services/OnsiteAccessService');
const OnsiteApplicationService = require('../../../src/services/OnsiteApplicationService');
const AccessCredentialService = require('../../../src/services/AccessCredentialService');
const InvitationService = require('../../../src/services/InvitationService');
const AttemptLimiter = require('../../../src/utils/AttemptLimiter');
const InMemoryAccessCredentialRepository = require('../../../src/repositories/in-memory/InMemoryAccessCredentialRepository');
const InMemoryAuditLogRepository = require('../../../src/repositories/in-memory/InMemoryAuditLogRepository');
const InMemoryCandidateRepository = require('../../../src/repositories/in-memory/InMemoryCandidateRepository');
const InMemoryInvitationRepository = require('../../../src/repositories/in-memory/InMemoryInvitationRepository');
const { NotFoundError } = require('../../../src/utils/errors');

const PEPPER = 'p'.repeat(32);
const SESSION = {
  venue: 'Campus Central', room: 'Aula 204', startsAt: new Date('2026-11-05T14:00:00.000Z'), endsAt: new Date('2026-11-05T16:00:00.000Z'),
};
const LIKERT = [1, 2, 3, 4].map((number) => ({ questionId: `demo-a-${number}`, value: number }));

describe('OnsiteAccessService', () => {
  let candidateRepo;
  let credentialRepo;
  let invitationRepo;
  let auditRepo;
  let event;
  let clock;
  let credentials;
  let applicator;
  let invitations;
  let limiter;
  let service;
  let ana;
  let bruno;
  let codes;

  beforeEach(async () => {
    candidateRepo = new InMemoryCandidateRepository();
    credentialRepo = new InMemoryAccessCredentialRepository();
    invitationRepo = new InMemoryInvitationRepository();
    auditRepo = new InMemoryAuditLogRepository();
    const cited = { eventId: 'event-1', orgId: 'org-1', status: 'CITED', citation: { status: 'SENT' }, fechaHoraCita: SESSION.startsAt };
    ana = await candidateRepo.create({ ...cited, nombreCompleto: 'Ana López', cedula: '100', correo: 'ana@example.com' });
    bruno = await candidateRepo.create({ ...cited, nombreCompleto: 'Bruno Díaz', cedula: '200', correo: 'bruno@example.com' });
    event = {
      id: 'event-1', orgId: 'org-1', name: 'Concurso Presencial', position: 'Analista', modality: 'onsite', modules: ['A', 'B'], onsite: SESSION, availableFrom: SESSION.startsAt,
    };
    clock = { now: new Date('2026-11-01T12:00:00.000Z') };
    const eventService = {
      getEvent: jest.fn(async (_eventId, orgId) => {
        if (orgId !== event.orgId) throw new NotFoundError('Evento no encontrado.');
        return event;
      }),
    };
    credentials = new AccessCredentialService({
      credentialRepo, auditRepo, candidateRepo, eventService, pepper: PEPPER, now: () => clock.now,
    });
    applicator = new OnsiteApplicationService({
      eventService, candidateRepo, credentialRepo, auditRepo, now: () => clock.now,
    });
    invitations = new InvitationService({
      invitationRepo,
      candidateService: { listByEvent: jest.fn() },
      candidateRepo,
      eventService,
      organizationRepo: { findById: jest.fn().mockResolvedValue({ id: 'org-1', name: 'TechCorp' }) },
      emailService: {},
      frontendUrl: undefined,
      now: () => clock.now,
    });
    limiter = new AttemptLimiter({ rules: { client: { max: 3, windowMs: 300_000 }, ip: { max: 10, windowMs: 600_000 } }, now: () => clock.now.getTime() });
    service = new OnsiteAccessService({
      credentialRepo, invitationRepo, candidateRepo, eventService, invitationService: invitations, auditRepo, limiter, pepper: PEPPER,
      now: () => clock.now, sleep: jest.fn(async () => {}),
    });

    // Codes prepared before the appointment; the day comes.
    const { issued } = await credentials.issueBatch('event-1', 'org-1', { module: 'A', candidateIds: [ana.id, bruno.id] }, 'preparer');
    codes = Object.fromEntries(issued.map((item) => [item.candidateId, item.code]));
    clock.now = new Date('2026-11-05T14:30:00.000Z');
  });

  const client = { ip: '10.0.0.1', clientId: 'browser-1' };
  const checkIn = async (candidate) => {
    await applicator.setAttendance('event-1', 'org-1', { module: 'A', candidateId: candidate.id, present: true }, 'applicator');
    await applicator.enable('event-1', 'org-1', { module: 'A', candidateIds: [candidate.id] }, 'applicator');
  };

  test('an enabled code opens an individual session and is consumed, without finishing the evaluation', async () => {
    await checkIn(ana);
    const result = await service.login(codes[ana.id].toLowerCase().replace('-', ' '), client);

    expect(result).toMatchObject({
      state: 'VALID', module: 'A', candidate: { nombreCompleto: 'Ana López' }, event: { nombre: 'Concurso Presencial' }, token: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
    });
    // No personal data beyond the name.
    expect(JSON.stringify(result)).not.toMatch(/100|ana@example\.com/);

    const credential = credentialRepo.data.find((item) => item.candidateId === ana.id);
    expect(credential).toMatchObject({ status: 'USED', usedAt: clock.now });
    expect(invitationRepo.data).toEqual([expect.objectContaining({
      candidateId: ana.id, module: 'A', channel: 'onsite', credentialId: credential.id, status: 'ACTIVE', expiresAt: credential.expiresAt,
    })]);
    expect(invitationRepo.data[0]).not.toHaveProperty('token');
    expect((await candidateRepo.findById(ana.id)).status).toBe('CITED');
    expect(auditRepo.data.at(-1)).toMatchObject({ action: 'ONSITE_SESSION_STARTED', candidateId: ana.id, credentialId: credential.id });
  });

  test('the session runs the evaluation and is closed by the final submission', async () => {
    await checkIn(ana);
    const { token } = await service.login(codes[ana.id], client);

    await expect(invitations.submitEvaluation(token, { answers: LIKERT })).resolves.toMatchObject({ state: 'COMPLETED', alreadySubmitted: false });
    expect((await candidateRepo.findById(ana.id)).status).toBe('EVALUATION_COMPLETED');
    expect(invitationRepo.submissions).toEqual([expect.objectContaining({ candidateId: ana.id, module: 'A', answers: LIKERT })]);
    // The session is over.
    await expect(invitations.validateAccess(token)).resolves.toMatchObject({ state: 'COMPLETED' });
  });

  test('a code that was not enabled does not open anything', async () => {
    await expect(service.login(codes[bruno.id], client)).resolves.toEqual({ state: 'NOT_ENABLED' });
    expect(invitationRepo.data).toEqual([]);
  });

  test('a code works only once', async () => {
    await checkIn(ana);
    await service.login(codes[ana.id], client);
    await expect(service.login(codes[ana.id], { ip: '10.0.0.2', clientId: 'browser-2' })).resolves.toEqual({ state: 'USED' });
    expect(invitationRepo.data).toHaveLength(1);
  });

  test('two simultaneous logins with the same code: only one gets a session', async () => {
    await checkIn(ana);
    const results = await Promise.all([service.login(codes[ana.id], client), service.login(codes[ana.id], client)]);
    expect(results.map((result) => result.state).sort()).toEqual(['USED', 'VALID']);
    expect(invitationRepo.data.filter((item) => item.status === 'ACTIVE')).toHaveLength(1);
  });

  test('revoked and expired codes are refused with their reason', async () => {
    await checkIn(ana);
    await checkIn(bruno);
    const roster = await applicator.roster('event-1', 'org-1', 'A');
    await credentials.revoke('event-1', 'org-1', roster.rows.find((row) => row.candidateId === bruno.id).credential.id, 'supervisor');
    await expect(service.login(codes[bruno.id], client)).resolves.toEqual({ state: 'REVOKED' });

    clock.now = new Date('2026-11-06T06:00:00.000Z');
    await expect(service.login(codes[ana.id], client)).resolves.toEqual({ state: 'EXPIRED' });
  });

  test('an evaluation already completed cannot be opened again', async () => {
    await checkIn(ana);
    await candidateRepo.update(ana.id, { status: 'EVALUATION_COMPLETED', submittedAt: clock.now });
    await expect(service.login(codes[ana.id], client)).resolves.toEqual({ state: 'COMPLETED' });
    expect(credentialRepo.data.find((item) => item.candidateId === ana.id).status).toBe('ENABLED');
  });

  test('wrong codes are answered slowly and, after a few, the browser must wait', async () => {
    for (const wrong of ['', 'hola', 'K7M2P-9QX4R']) {
      await expect(service.login(wrong, client)).resolves.toEqual({ state: 'INVALID' });
    }
    expect(service.sleep).toHaveBeenCalledTimes(3);

    // Even the right code waits now, from this browser.
    await checkIn(ana);
    const blocked = await service.login(codes[ana.id], client);
    expect(blocked).toEqual({ state: 'TOO_MANY_ATTEMPTS', retryAfterSeconds: 300 });
    // Another computer in the room is not affected.
    await expect(service.login(codes[ana.id], { ip: '10.0.0.1', clientId: 'browser-2' })).resolves.toMatchObject({ state: 'VALID' });
  });

  test('the IP limit applies across browsers', async () => {
    for (let index = 0; index < 10; index += 1) {
      await service.login('AAAAA-AAAAA', { ip: '10.0.0.9', clientId: `browser-${index}` });
    }
    await expect(service.login('AAAAA-AAAAA', { ip: '10.0.0.9', clientId: 'browser-new' })).resolves.toMatchObject({ state: 'TOO_MANY_ATTEMPTS' });
  });

  test('correct codes that cannot be used now do not count as failed attempts', async () => {
    for (let index = 0; index < 5; index += 1) await service.login(codes[bruno.id], client);
    expect(limiter.retryAfter([`client:${client.clientId}`])).toBe(0);
  });

  test('Module B: the session opens the macrocase of the event', async () => {
    const sessionB = { venue: 'Campus Norte', room: 'Sala 3', startsAt: new Date('2026-11-20T15:00:00.000Z'), endsAt: new Date('2026-11-20T17:00:00.000Z') };
    event = {
      ...event,
      status: 'PUBLISHED',
      evaluationsPublishedAt: new Date(),
      moduleB: { macrocase: { id: 'm1', name: 'Caso', introduction: 'Había una vez…', questions: [{ id: 'q1', order: 1, text: '¿Qué haría?' }] } },
    };
    await candidateRepo.update(ana.id, {
      status: 'EVALUATION_COMPLETED', submittedAt: new Date(), moduleB: { status: 'CITED', citation: { status: 'SENT', appointment: sessionB } },
    });
    clock.now = new Date('2026-11-18T12:00:00.000Z');
    const { issued: [{ code }] } = await credentials.issueBatch('event-1', 'org-1', { module: 'B', candidateIds: [ana.id] }, 'preparer');
    clock.now = new Date('2026-11-20T15:10:00.000Z');
    await applicator.setAttendance('event-1', 'org-1', { module: 'B', candidateId: ana.id, present: true }, 'applicator');
    await applicator.enable('event-1', 'org-1', { module: 'B', candidateIds: [ana.id] }, 'applicator');

    const result = await service.login(code, client);
    expect(result).toMatchObject({ state: 'VALID', module: 'B', macrocase: { name: 'Caso', totalQuestions: 1 } });
    await expect(invitations.advanceMacrocase(result.token, { type: 'START' })).resolves.toMatchObject({ step: 'narrative' });
  });

  test('without the server secret it fails clearly', async () => {
    service.pepper = undefined;
    await expect(service.login(codes[ana.id], client)).rejects.toThrow('ACCESS_CODE_PEPPER');
  });
});
