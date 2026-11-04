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

  test('the roster lists the cited candidates alphabetically with attendance, access and evaluation', async () => {
    const roster = await service.roster('event-1', 'org-1', 'A');

    expect(roster.rows.map((row) => [row.nombreCompleto, row.cedula, row.credential?.status ?? null, row.evaluation])).toEqual([
      ['Ana López', '100', 'GENERATED', 'PENDING'],
      ['Bruno Díaz', '200', 'GENERATED', 'PENDING'],
      ['Carla Méndez', '300', null, 'PENDING'],
    ]);
    expect(roster).toMatchObject({ isAppointmentDay: true, counts: { cited: 3, present: 0, withCode: 2, inProgress: 0, completed: 0 } });
    expect(JSON.stringify(roster)).not.toContain('codeHash');
  });

  test('marking present records who verified the candidate, and can be undone', async () => {
    const record = await mark(ana);
    expect(record).toEqual({ status: 'PRESENT', markedAt: ON_THE_DAY, markedBy: 'applicator-1' });
    expect((await candidateRepo.findById(ana.id)).attendance).toEqual({ A: record });

    await mark(ana, false);
    expect((await candidateRepo.findById(ana.id)).attendance).toEqual({});
    expect(auditRepo.data.filter((entry) => entry.action.startsWith('ATTENDANCE')).map((entry) => [entry.action, entry.actorUid])).toEqual([
      ['ATTENDANCE_MARKED', 'applicator-1'], ['ATTENDANCE_UNMARKED', 'applicator-1'],
    ]);
  });

  test('codes are not enabled by hand: the roster shows when each one works', async () => {
    clock.now = new Date('2026-11-05T13:30:00.000Z');
    let roster = await service.roster('event-1', 'org-1', 'A');
    const window = { opensAt: SESSION.startsAt, closesAt: new Date('2026-11-05T14:30:00.000Z'), minutes: 30 };
    expect(roster.accessWindow).toEqual({ ...window, state: 'PENDING' });
    expect(roster.rows[0].accessWindow).toEqual({ ...window, state: 'PENDING' });

    clock.now = new Date('2026-11-05T14:05:00.000Z');
    roster = await service.roster('event-1', 'org-1', 'A');
    expect(roster.accessWindow.state).toBe('OPEN');

    clock.now = ON_THE_DAY;
    roster = await service.roster('event-1', 'org-1', 'A');
    expect(roster.accessWindow.state).toBe('CLOSED');
    // Nobody had to touch the codes.
    expect(roster.rows.map((row) => row.credential?.status ?? null)).toEqual(['GENERATED', 'GENERATED', null]);
  });

  test('attendance is only a record: it changes nothing in the codes', async () => {
    await mark(ana);
    const roster = await service.roster('event-1', 'org-1', 'A');
    expect(roster.rows.find((row) => row.candidateId === ana.id)).toMatchObject({ attendance: { status: 'PRESENT' }, credential: { status: 'GENERATED' } });
    expect(roster.counts).toMatchObject({ present: 1, withCode: 2 });
  });

  test('attendance cannot be removed once the candidate used the code', async () => {
    await mark(ana);
    const roster = await service.roster('event-1', 'org-1', 'A');
    await credentialRepo.update(roster.rows.find((row) => row.candidateId === ana.id).credential.id, () => ({ status: 'USED', usedAt: ON_THE_DAY }));
    await expect(mark(ana, false)).rejects.toThrow('ya utilizó su acceso');
  });

  test('attendance only happens on the appointment day', async () => {
    clock.now = new Date('2026-11-04T15:00:00.000Z');
    await expect(mark(ana)).rejects.toThrow('solo se registra el día de la cita');
    expect((await service.roster('event-1', 'org-1', 'A')).isAppointmentDay).toBe(false);
  });

  test('shows evaluations in progress and completed', async () => {
    const before = await service.roster('event-1', 'org-1', 'A');
    await credentialRepo.update(before.rows.find((row) => row.candidateId === ana.id).credential.id, () => ({ status: 'USED', usedAt: ON_THE_DAY }));
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
    });

    test('candidates of another event cannot be marked', async () => {
      const outsider = await candidateRepo.create({ eventId: 'event-2', orgId: 'org-1', nombreCompleto: 'Otro Evento' });
      await expect(mark(outsider)).rejects.toBeInstanceOf(NotFoundError);
    });

    test('only onsite events and their modules', async () => {
      event = { ...event, modules: ['A'] };
      await expect(service.roster('event-1', 'org-1', 'B')).rejects.toBeInstanceOf(ValidationError);
      event = { ...event, modality: 'online' };
      await expect(service.roster('event-1', 'org-1', 'A')).rejects.toThrow('presenciales');
    });
  });
});
