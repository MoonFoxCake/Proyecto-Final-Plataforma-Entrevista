const EventService = require('../../../src/services/EventService');
const { NotFoundError } = require('../../../src/utils/errors');

describe('EventService', () => {
  test('creates a Plan A event with organization-wide availability', async () => {
    const eventRepo = {
      create: jest.fn(async (data) => ({ id: 'event-1', ...data })),
    };
    const service = new EventService(eventRepo);

    const event = await service.createEvent('org-1', {
      nombre: 'Concurso Demo',
      puesto: 'Analista',
      descripcion: 'Evaluación de demostración',
      fechaHoraHabilitacion: '2026-10-10T15:00:00.000Z',
    });

    expect(event).toMatchObject({
      id: 'event-1',
      orgId: 'org-1',
      name: 'Concurso Demo',
      position: 'Analista',
      plan: 'A',
      status: 'ACTIVE',
    });
    expect(event.availableFrom).toEqual(new Date('2026-10-10T15:00:00.000Z'));
    expect(event).toMatchObject({ modality: 'online', modules: ['A', 'B'] });
  });

  test('creates an onsite event with its venue and session, starting the evaluation at the session start', async () => {
    const eventRepo = { create: jest.fn(async (data) => ({ id: 'event-2', ...data })) };
    const service = new EventService(eventRepo);

    const event = await service.createEvent('org-1', {
      nombre: 'Concurso Presencial',
      puesto: 'Analista',
      modalidad: 'presencial',
      incluirModuloB: false,
      presencial: {
        sede: ' Campus Central ',
        ubicacion: ' Edificio T2, aula 204 ',
        fechaHoraInicio: '2026-11-05T14:00:00.000Z',
        fechaHoraFin: '2026-11-05T16:00:00.000Z',
        indicaciones: ' Llegar 15 minutos antes. ',
      },
    });

    expect(event).toMatchObject({
      modality: 'onsite',
      modules: ['A'],
      availableFrom: new Date('2026-11-05T14:00:00.000Z'),
      onsite: {
        venue: 'Campus Central',
        room: 'Edificio T2, aula 204',
        startsAt: new Date('2026-11-05T14:00:00.000Z'),
        endsAt: new Date('2026-11-05T16:00:00.000Z'),
        instructions: 'Llegar 15 minutos antes.',
      },
    });
  });

  test('lists only events returned for the organization', async () => {
    const eventRepo = {
      findByOrganization: jest.fn().mockResolvedValue([{ id: 'event-1', orgId: 'org-1' }]),
    };
    const service = new EventService(eventRepo);

    await expect(service.listEvents('org-1')).resolves.toHaveLength(1);
    expect(eventRepo.findByOrganization).toHaveBeenCalledWith('org-1');
  });

  test('does not expose an event belonging to another organization', async () => {
    const eventRepo = {
      findById: jest.fn().mockResolvedValue({ id: 'event-1', orgId: 'org-2' }),
    };
    const service = new EventService(eventRepo);

    await expect(service.getEvent('event-1', 'org-1')).rejects.toThrow(NotFoundError);
  });

  test('accepts recruiterOrgId from legacy process documents', async () => {
    const eventRepo = {
      findById: jest.fn().mockResolvedValue({ id: 'process-1', recruiterOrgId: 'org-1' }),
    };
    const service = new EventService(eventRepo);

    await expect(service.getEvent('process-1', 'org-1')).resolves.toMatchObject({ id: 'process-1' });
  });
});
