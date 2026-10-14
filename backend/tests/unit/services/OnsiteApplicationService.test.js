const OnsiteApplicationService = require('../../../src/services/OnsiteApplicationService');
const AccessCredentialService = require('../../../src/services/AccessCredentialService');
const InMemoryAccessCredentialRepository = require('../../../src/repositories/in-memory/InMemoryAccessCredentialRepository');
const InMemoryAuditLogRepository = require('../../../src/repositories/in-memory/InMemoryAuditLogRepository');
const InMemoryCandidateRepository = require('../../../src/repositories/in-memory/InMemoryCandidateRepository');
const { NotFoundError, ValidationError } = require('../../../src/utils/errors');

const SESSION = {
  venue: 'Campus Central', room: 'Aula 204', startsAt: new Date('2026-11-05T14:00:00.000Z'), endsAt: new Date('2026-11-05T16:00:00.000Z'),
};
// 9:00 a. m. in Guatemala, on the appointment day.
const ON_THE_DAY = new Date('2026-11-05T15:00:00.000Z');

describe('OnsiteApplicationService', () => {
  let candidateRepo;
  let credentialRepo;
  let auditRepo;
  let event;
  let clock;
  let service;
  let credentials;
  let ana;
  let bruno;
  let carla;

  beforeEach(async () => {
    candidateRepo = new InMemoryCandidateRepository();
    credentialRepo = new InMemoryAccessCredentialRepository();
    auditRepo = new InMemoryAuditLogRepository();
    const cited = { eventId: 'event-1', orgId: 'org-1', status: 'CITED', citation: { status: 'SENT' } };
    carla = await candidateRepo.create({ ...cited, nombreCompleto: 'Carla Méndez', cedula: '300' });
    ana = await candidateRepo.create({ ...cited, nombreCompleto: 'Ana López', cedula: '100' });
    bruno = await candidateRepo.create({ ...cited, nombreCompleto: 'Bruno Díaz', cedula: '200' });
    await candidateRepo.create({ eventId: 'event-1', orgId: 'org-1', status: 'INVITED_PENDING', nombreCompleto: 'Sin Citar', cedula: '400' });
    event = { id: 'event-1', orgId: 'org-1', name: 'Concurso', modality: 'onsite', modules: ['A', 'B'], onsite: SESSION };
    clock = { now: new Date('2026-11-01T12:00:00.000Z') };
    const eventService = {
      getEvent: jest.fn(async (_eventId, orgId) => {
        if (orgId !== event.orgId) throw new NotFoundError('Evento no encontrado.');
        return event;
      }),
    };
    // Codes prepared days before the appointment.
    credentials = new AccessCredentialService({
      credentialRepo, auditRepo, candidateRepo, eventService, pepper: 'p'.repeat(32), now: () => clock.now,
    });
    await credentials.issueBatch('event-1', 'org-1', { module: 'A', candidateIds: [ana.id, bruno.id] }, 'preparer');
    service = new OnsiteApplicationService({
      eventService, candidateRepo, credentialRepo, auditRepo, now: () => clock.now,
    });
    clock.now = ON_THE_DAY;
  });

  const mark = (candidate, present = true, actor = 'applicator-1') => service.setAttendance('event-1', 'org-1', { module: 'A', candidateId: candidate.id, present }, actor);
  const enable = (ids, actor = 'applicator-1') => service.enable('event-1', 'org-1', { module: 'A', candidateIds: ids }, actor);

  test('the roster lists the cited candidates alphabetically with attendance, access and evaluation', async () => {
    const roster = await service.roster('event-1', 'org-1', 'A');

    expect(roster.rows.map((row) => [row.nombreCompleto, row.cedula, row.credential?.status ?? null, row.evaluation])).toEqual([
      ['Ana López', '100', 'GENERATED', 'PENDING'],
      ['Bruno Díaz', '200', 'GENERATED', 'PENDING'],
      ['Carla Méndez', '300', null, 'PENDING'],
    ]);
    expect(roster).toMatchObject({ isAppointmentDay: true, counts: { cited: 3, present: 0, withCode: 2, enabled: 0, readyToEnable: 0 } });
    expect(JSON.stringify(roster)).not.toContain('codeHash');
  });

  test('marking present records who verified the candidate, and can be undone before enabling', async () => {
    const record = await mark(ana);
    expect(record).toEqual({ status: 'PRESENT', markedAt: ON_THE_DAY, markedBy: 'applicator-1' });
    expect((await candidateRepo.findById(ana.id)).attendance).toEqual({ A: record });

    await mark(ana, false);
    expect((await candidateRepo.findById(ana.id)).attendance).toEqual({});
    expect(auditRepo.data.filter((entry) => entry.action.startsWith('ATTENDANCE')).map((entry) => [entry.action, entry.actorUid])).toEqual([
      ['ATTENDANCE_MARKED', 'applicator-1'], ['ATTENDANCE_UNMARKED', 'applicator-1'],
    ]);
  });

  test('enables a present candidate code and records who did it', async () => {
    await mark(ana);
    const result = await enable([ana.id], 'applicator-2');

    expect(result.enabled).toEqual([expect.objectContaining({ candidateId: ana.id })]);
    const credential = await credentialRepo.findById(result.enabled[0].credentialId);
    expect(credential).toMatchObject({ status: 'ENABLED', enabledBy: 'applicator-2', enabledAt: ON_THE_DAY });
    expect(auditRepo.data.at(-1)).toMatchObject({ action: 'CREDENTIAL_ENABLED', actorUid: 'applicator-2', candidateId: ana.id, credentialId: credential.id });
  });

  test('a mass enabling never enables an absent candidate', async () => {
    await mark(ana);
    const result = await enable([ana.id, bruno.id, carla.id]);

    expect(result.enabled.map((item) => item.nombreCompleto)).toEqual(['Ana López']);
    expect(result.skipped).toEqual([
      { candidateId: bruno.id, nombreCompleto: 'Bruno Díaz', reason: 'no está marcado como presente' },
      { candidateId: carla.id, nombreCompleto: 'Carla Méndez', reason: 'no está marcado como presente' },
    ]);
    const roster = await service.roster('event-1', 'org-1', 'A');
    expect(roster.rows.find((row) => row.candidateId === bruno.id).credential.status).toBe('GENERATED');
  });

  test('reports why a present candidate cannot be enabled', async () => {
    await mark(carla);
    await mark(ana);
    await enable([ana.id]);
    const result = await enable([ana.id, carla.id]);
    expect(result.enabled).toEqual([]);
    expect(result.skipped.map((item) => item.reason)).toEqual(['su acceso ya está habilitado', 'no tiene un acceso preparado']);
  });

  test('a revoked code cannot be enabled until it is reissued', async () => {
    await mark(bruno);
    const roster = await service.roster('event-1', 'org-1', 'A');
    const credentialId = roster.rows.find((row) => row.candidateId === bruno.id).credential.id;
    await credentials.revoke('event-1', 'org-1', credentialId, 'supervisor', 'Extraviada');
    expect((await enable([bruno.id])).skipped[0].reason).toBe('su acceso fue revocado; reemítelo');

    await credentials.issueBatch('event-1', 'org-1', { module: 'A', candidateIds: [bruno.id] }, 'supervisor');
    expect((await enable([bruno.id])).enabled).toHaveLength(1);
  });

  test('attendance cannot be removed once the code was enabled', async () => {
    await mark(ana);
    await enable([ana.id]);
    await expect(mark(ana, false)).rejects.toThrow('ya fue habilitado');
  });

  test('attendance and enabling only happen on the appointment day', async () => {
    clock.now = new Date('2026-11-04T15:00:00.000Z');
    await expect(mark(ana)).rejects.toThrow('solo se registran el día de la cita');
    expect((await service.roster('event-1', 'org-1', 'A')).isAppointmentDay).toBe(false);

    clock.now = ON_THE_DAY;
    await mark(ana);
    clock.now = new Date('2026-11-06T15:00:00.000Z');
    expect((await enable([ana.id])).skipped[0].reason).toBe('hoy no es el día de su cita');
  });

  test('shows evaluations in progress and completed', async () => {
    await mark(ana);
    const { enabled: [{ credentialId }] } = await enable([ana.id]);
    await credentialRepo.update(credentialId, () => ({ status: 'USED', usedAt: ON_THE_DAY }));
    await candidateRepo.update(bruno.id, { status: 'EVALUATION_COMPLETED', submittedAt: ON_THE_DAY });

    const roster = await service.roster('event-1', 'org-1', 'A');
    expect(roster.rows.map((row) => row.evaluation)).toEqual(['IN_PROGRESS', 'COMPLETED', 'PENDING']);
    expect(roster.counts).toMatchObject({ inProgress: 1, completed: 1 });
  });

  test('Module B uses each candidate own Module B session and citation', async () => {
    const sessionB = { venue: 'Campus Norte', room: 'Sala 3', startsAt: new Date('2026-11-20T15:00:00.000Z'), endsAt: new Date('2026-11-20T17:00:00.000Z') };
    await candidateRepo.update(ana.id, { moduleB: { status: 'CITED', citation: { status: 'SENT', appointment: sessionB } } });
    clock.now = new Date('2026-11-20T15:30:00.000Z');

    const roster = await service.roster('event-1', 'org-1', 'B');
    expect(roster.rows.map((row) => [row.nombreCompleto, row.appointmentAt])).toEqual([['Ana López', sessionB.startsAt]]);
    await expect(service.setAttendance('event-1', 'org-1', { module: 'B', candidateId: ana.id, present: true }, 'a')).resolves.toMatchObject({ status: 'PRESENT' });
    // Module A attendance is separate.
    expect((await candidateRepo.findById(ana.id)).attendance).toEqual({ B: expect.objectContaining({ status: 'PRESENT' }) });
  });

  describe('permissions', () => {
    test('another organization cannot see or act on the event', async () => {
      await expect(service.roster('event-1', 'org-2', 'A')).rejects.toBeInstanceOf(NotFoundError);
      await expect(service.setAttendance('event-1', 'org-2', { module: 'A', candidateId: ana.id, present: true }, 'x')).rejects.toBeInstanceOf(NotFoundError);
      await expect(service.enable('event-1', 'org-2', { module: 'A', candidateIds: [ana.id] }, 'x')).rejects.toBeInstanceOf(NotFoundError);
    });

    test('candidates of another event cannot be marked or enabled', async () => {
      const outsider = await candidateRepo.create({ eventId: 'event-2', orgId: 'org-1', nombreCompleto: 'Otro Evento' });
      await expect(mark(outsider)).rejects.toBeInstanceOf(NotFoundError);
      await expect(enable([outsider.id])).rejects.toThrow('no pertenecen a este evento');
    });

    test('only onsite events and their modules', async () => {
      event = { ...event, modules: ['A'] };
      await expect(service.roster('event-1', 'org-1', 'B')).rejects.toBeInstanceOf(ValidationError);
      event = { ...event, modality: 'online' };
      await expect(service.roster('event-1', 'org-1', 'A')).rejects.toThrow('presenciales');
    });
  });
});
