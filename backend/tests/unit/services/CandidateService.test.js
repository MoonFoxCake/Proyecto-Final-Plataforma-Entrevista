const CandidateService = require('../../../src/services/CandidateService');
const InMemoryCandidateRepository = require('../../../src/repositories/in-memory/InMemoryCandidateRepository');
const { ValidationError } = require('../../../src/utils/errors');

describe('CandidateService', () => {
  let repo;
  let service;
  let eventService;

  beforeEach(() => {
    repo = new InMemoryCandidateRepository();
    eventService = {
      getEvent: jest.fn().mockResolvedValue({
        id: 'event-1',
        orgId: 'org-1',
        availableFrom: new Date('2026-09-10T15:00:00.000Z'),
      }),
    };
    service = new CandidateService(repo, eventService);
  });

  test('creates an event candidate without an authentication password', async () => {
    const candidate = await service.createForEvent('event-1', 'org-1', {
      nombreCompleto: ' María Demo ',
      cedula: ' 123456 ',
      correo: 'MARIA@EXAMPLE.COM',
      fechaHoraCita: '2026-09-10T15:00:00.000Z',
    });

    expect(eventService.getEvent).toHaveBeenCalledWith('event-1', 'org-1');
    expect(candidate).toMatchObject({
      eventId: 'event-1',
      orgId: 'org-1',
      nombreCompleto: 'María Demo',
      cedula: '123456',
      correo: 'maria@example.com',
      status: 'INVITED_PENDING',
    });
    expect(candidate).not.toHaveProperty('password');
    expect(candidate.fechaHoraCita).toEqual(new Date('2026-09-10T15:00:00.000Z'));
  });

  test('rejects a duplicate cedula inside the same event', async () => {
    const data = {
      nombreCompleto: 'María Demo',
      cedula: '123456',
      correo: 'maria@example.com',
      fechaHoraCita: '2026-09-10T15:00:00.000Z',
    };
    await service.createForEvent('event-1', 'org-1', data);

    await expect(service.createForEvent('event-1', 'org-1', data)).rejects.toThrow(ValidationError);
  });

  test('lists candidates only after validating access to the event', async () => {
    await repo.create({ eventId: 'event-1', orgId: 'org-1', nombreCompleto: 'María' });
    await repo.create({ eventId: 'event-1', orgId: 'org-2', nombreCompleto: 'Otro tenant' });

    const candidates = await service.listByEvent('event-1', 'org-1');

    expect(candidates).toHaveLength(1);
    expect(candidates[0].nombreCompleto).toBe('María');
  });

  test('rejects registration when the event has no shared availability', async () => {
    eventService.getEvent.mockResolvedValue({ id: 'event-1', orgId: 'org-1' });

    await expect(service.createForEvent('event-1', 'org-1', {
      nombreCompleto: 'María Demo',
      cedula: '123456',
      correo: 'maria@example.com',
    })).rejects.toThrow('El evento no tiene una fecha de habilitación configurada.');
  });
});
