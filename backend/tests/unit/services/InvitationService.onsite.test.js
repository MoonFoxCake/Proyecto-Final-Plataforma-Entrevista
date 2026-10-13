const crypto = require('crypto');
const InvitationService = require('../../../src/services/InvitationService');
const InMemoryInvitationRepository = require('../../../src/repositories/in-memory/InMemoryInvitationRepository');
const InMemoryCandidateRepository = require('../../../src/repositories/in-memory/InMemoryCandidateRepository');
const { ValidationError } = require('../../../src/utils/errors');

const SESSION = {
  venue: 'Campus Central',
  room: 'Edificio T2, aula 204',
  startsAt: new Date('2026-11-05T14:00:00.000Z'),
  endsAt: new Date('2026-11-05T16:00:00.000Z'),
  instructions: 'Llegar 15 minutos antes.',
};
const MODULE_B_CITATION = {
  sede: 'Campus Norte', ubicacion: 'Sala 3', fechaHoraInicio: '2026-11-20T15:00:00.000Z', fechaHoraFin: '2026-11-20T17:00:00.000Z',
};

describe('InvitationService · onsite events', () => {
  let invitationRepo;
  let candidateRepo;
  let event;
  let emailService;
  let service;
  let maria;
  let carlos;

  beforeEach(async () => {
    invitationRepo = new InMemoryInvitationRepository();
    candidateRepo = new InMemoryCandidateRepository();
    const base = { eventId: 'event-1', orgId: 'org-1', fechaHoraCita: SESSION.startsAt, status: 'INVITED_PENDING' };
    maria = await candidateRepo.create({ ...base, nombreCompleto: 'María Demo', correo: 'maria@example.com' });
    carlos = await candidateRepo.create({ ...base, nombreCompleto: 'Carlos Demo', correo: 'carlos@example.com' });
    event = {
      id: 'event-1', orgId: 'org-1', name: 'Concurso Presencial', modality: 'onsite', modules: ['A', 'B'], onsite: SESSION, availableFrom: SESSION.startsAt,
    };
    emailService = {
      sendInvitation: jest.fn(),
      sendCitation: jest.fn(async ({ candidate }) => ({ id: `email-${candidate.nombreCompleto}` })),
      getEmailStatus: jest.fn(async (id) => ({ lastEvent: id.includes('María') ? 'delivered' : 'bounced' })),
    };
    service = new InvitationService({
      invitationRepo,
      candidateService: { listByEvent: jest.fn(async () => candidateRepo.findByEvent('event-1', 'org-1')) },
      candidateRepo,
      eventService: {
        getEvent: jest.fn(async () => event),
        assignModuleB: jest.fn(async (_eventId, _orgId, macrocase) => { event = { ...event, moduleB: { macrocase } }; return event; }),
      },
      organizationRepo: { findById: jest.fn().mockResolvedValue({ id: 'org-1', name: 'TechCorp' }) },
      emailService,
      // No FRONTEND_URL: onsite citations do not need one, they carry no link.
      frontendUrl: undefined,
      macrocaseService: { pickSnapshotForModuleB: jest.fn().mockResolvedValue({ id: 'macro-1', sections: [] }) },
      sleep: jest.fn(async () => {}),
    });
  });

  test('cites every pending candidate to the venue without creating any access', async () => {
    const result = await service.publishForEvent('event-1', 'org-1');

    expect(result).toMatchObject({ total: 2, sent: 2, failed: 0 });
    expect(emailService.sendInvitation).not.toHaveBeenCalled();
    expect(emailService.sendCitation).toHaveBeenCalledWith(expect.objectContaining({ module: 'A', appointment: SESSION }));
    expect(emailService.sendCitation.mock.calls[0][0]).not.toHaveProperty('accessUrl');
    // No invitation, so no token exists that could open the evaluation.
    expect(invitationRepo.data).toEqual([]);

    const stored = await candidateRepo.findById(maria.id);
    expect(stored.status).toBe('CITED');
    expect(stored.citation).toMatchObject({ status: 'SENT', providerId: 'email-María Demo', appointment: SESSION });
    expect(stored.citation.sentAt).toBeInstanceOf(Date);
    expect(stored).not.toHaveProperty('invitationId');
  });

  test('a failed citation stays pending with the reason, and the next send retries only it', async () => {
    emailService.sendCitation.mockImplementationOnce(async () => { throw new Error('Resend caído'); });

    expect(await service.publishForEvent('event-1', 'org-1')).toMatchObject({ total: 2, sent: 1, failed: 1 });
    const failed = await candidateRepo.findById(maria.id);
    expect(failed).toMatchObject({ status: 'INVITED_PENDING', citation: { status: 'FAILED', error: 'Resend caído' } });

    emailService.sendCitation.mockClear();
    expect(await service.publishForEvent('event-1', 'org-1')).toMatchObject({ total: 1, sent: 1 });
    expect(emailService.sendCitation).toHaveBeenCalledTimes(1);
    expect((await candidateRepo.findById(maria.id)).citation.status).toBe('SENT');
  });

  test('refreshes the delivery status of each citation, one request at a time', async () => {
    await service.publishForEvent('event-1', 'org-1');

    expect(await service.refreshCitationStatus('event-1', 'org-1')).toEqual({ checked: 2, failed: 0 });
    expect((await candidateRepo.findById(maria.id)).citation.delivery).toMatchObject({ status: 'delivered' });
    expect((await candidateRepo.findById(carlos.id)).citation.delivery).toMatchObject({ status: 'bounced' });
    // The evaluation status is not touched by the delivery status.
    expect((await candidateRepo.findById(carlos.id)).status).toBe('CITED');
    expect(service.sleep).toHaveBeenCalledTimes(1);
  });

  test('a provider error while checking is counted and keeps the citation as it was', async () => {
    await service.publishForEvent('event-1', 'org-1');
    emailService.getEmailStatus.mockRejectedValueOnce(new Error('timeout'));

    expect(await service.refreshCitationStatus('event-1', 'org-1')).toEqual({ checked: 1, failed: 1 });
    expect((await candidateRepo.findById(maria.id)).citation).not.toHaveProperty('delivery');
  });

  test('online events have no citations to check', async () => {
    event = { ...event, modality: 'online' };
    await expect(service.refreshCitationStatus('event-1', 'org-1')).rejects.toBeInstanceOf(ValidationError);
  });

  test('a link never opens the evaluation of an onsite event', async () => {
    const token = crypto.randomBytes(32).toString('base64url');
    await invitationRepo.create({
      candidateId: maria.id, eventId: 'event-1', orgId: 'org-1', module: 'A',
      tokenHash: crypto.createHash('sha256').update(token).digest('hex'), status: 'ACTIVE', expiresAt: new Date(Date.now() + 3600000),
    });
    await expect(service.validateAccess(token)).resolves.toEqual({ state: 'INVALID' });
  });

  describe('Module B', () => {
    beforeEach(async () => {
      event = { ...event, status: 'PUBLISHED', evaluationsPublishedAt: new Date() };
      await candidateRepo.update(maria.id, { status: 'EVALUATION_COMPLETED', submittedAt: new Date(), reviewStatus: 'REVIEWED' });
    });

    test('cites the selected candidates to the Module B session given by the company', async () => {
      const result = await service.sendModuleB('event-1', 'org-1', [maria.id], MODULE_B_CITATION);

      expect(result).toMatchObject({ sent: 1, failed: 0 });
      expect(emailService.sendCitation).toHaveBeenCalledWith(expect.objectContaining({
        module: 'B',
        appointment: { venue: 'Campus Norte', room: 'Sala 3', startsAt: new Date('2026-11-20T15:00:00.000Z'), endsAt: new Date('2026-11-20T17:00:00.000Z'), instructions: '' },
      }));
      expect(invitationRepo.data).toEqual([]);
      const stored = await candidateRepo.findById(maria.id);
      expect(stored.moduleB).toMatchObject({ status: 'CITED', citation: { status: 'SENT', appointment: { venue: 'Campus Norte' } } });
      expect(stored.status).toBe('EVALUATION_COMPLETED'); // Module A untouched
      expect(event.moduleB.macrocase.id).toBe('macro-1');
    });

    test('needs the Module B session', async () => {
      await expect(service.sendModuleB('event-1', 'org-1', [maria.id])).rejects.toThrow('sede');
    });

    test('is not available when the event does not include it', async () => {
      event = { ...event, modules: ['A'] };
      await expect(service.sendModuleB('event-1', 'org-1', [maria.id], MODULE_B_CITATION)).rejects.toThrow('no incluye el Módulo B');
    });

    test('an online event does not take a citation', async () => {
      event = { ...event, modality: 'online' };
      service.frontendUrl = 'https://demo.example.com';
      await expect(service.sendModuleB('event-1', 'org-1', [maria.id], MODULE_B_CITATION)).rejects.toThrow('presenciales');
    });
  });
});
