const crypto = require('crypto');
const InvitationService = require('../../../src/services/InvitationService');
const InMemoryInvitationRepository = require('../../../src/repositories/in-memory/InMemoryInvitationRepository');
const InMemoryCandidateRepository = require('../../../src/repositories/in-memory/InMemoryCandidateRepository');

describe('InvitationService', () => {
  let invitationRepo;
  let candidateRepo;
  let candidate;
  let emailService;
  let service;

  beforeEach(async () => {
    invitationRepo = new InMemoryInvitationRepository();
    candidateRepo = new InMemoryCandidateRepository();
    candidate = await candidateRepo.create({
      eventId: 'event-1',
      orgId: 'org-1',
      nombreCompleto: 'María Demo',
      correo: 'maria@example.com',
      fechaHoraCita: new Date('2026-10-10T15:00:00.000Z'),
      status: 'INVITED_PENDING',
    });
    emailService = { sendInvitation: jest.fn().mockResolvedValue({ id: 'email-1' }) };
    service = new InvitationService({
      invitationRepo,
      candidateService: { listByEvent: jest.fn().mockResolvedValue([candidate]) },
      candidateRepo,
      eventService: { getEvent: jest.fn().mockResolvedValue({ id: 'event-1', orgId: 'org-1', name: 'Evento Demo' }) },
      organizationRepo: { findById: jest.fn().mockResolvedValue({ id: 'org-1', name: 'TechCorp' }) },
      emailService,
      frontendUrl: 'https://demo.example.com',
    });
  });

  test('publishes pending candidates using a random token while storing only its hash', async () => {
    const result = await service.publishForEvent('event-1', 'org-1');

    expect(result).toMatchObject({ total: 1, sent: 1, failed: 0 });
    const invitation = invitationRepo.data[0];
    const accessUrl = new URL(emailService.sendInvitation.mock.calls[0][0].accessUrl);
    const token = accessUrl.searchParams.get('token');
    expect(token).toHaveLength(43);
    expect(invitation.tokenHash).toBe(crypto.createHash('sha256').update(token).digest('hex'));
    expect(invitation).not.toHaveProperty('token');
    expect(invitation.status).toBe('ACTIVE');
    expect(invitation.expiresAt).toBeInstanceOf(Date);
    await expect(candidateRepo.findByEvent('event-1', 'org-1')).resolves.toEqual([
      expect.objectContaining({ status: 'INVITATION_SENT', invitationId: invitation.id }),
    ]);
  });

  test('cancels the invitation and leaves candidate pending when Resend fails', async () => {
    service.frontendUrl = 'https://demo.example.com';
    emailService.sendInvitation.mockRejectedValue(new Error('provider unavailable'));

    const result = await service.publishForEvent('event-1', 'org-1');

    expect(result).toMatchObject({ total: 1, sent: 0, failed: 1 });
    expect(invitationRepo.data[0].status).toBe('CANCELLED');
    const [storedCandidate] = await candidateRepo.findByEvent('event-1', 'org-1');
    expect(storedCandidate.status).toBe('INVITED_PENDING');
  });

  test('does not process candidates whose invitation was already sent', async () => {
    candidate.status = 'INVITATION_SENT';
    const result = await service.publishForEvent('event-1', 'org-1');

    expect(result).toMatchObject({ total: 0, sent: 0, failed: 0 });
    expect(emailService.sendInvitation).not.toHaveBeenCalled();
  });

  test('returns INVALID for an unknown token', async () => {
    await expect(service.validateAccess('a'.repeat(43))).resolves.toEqual({ state: 'INVALID' });
  });

  test('validates an active token and exposes only public context', async () => {
    const token = crypto.randomBytes(32).toString('base64url');
    await candidateRepo.update(candidate.id, { fechaHoraCita: new Date(Date.now() - 60000) });
    await invitationRepo.create({
      candidateId: candidate.id,
      eventId: 'event-1',
      orgId: 'org-1',
      tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 3600000),
    });

    const access = await service.validateAccess(token);

    expect(access.state).toBe('VALID');
    expect(access.candidate).toEqual({ nombreCompleto: 'María Demo' });
    expect(access.event.nombre).toBe('Evento Demo');
    expect(access.organization.nombre).toBe('TechCorp');
    expect(access.candidate).not.toHaveProperty('correo');
    expect(access).not.toHaveProperty('tokenHash');
  });

  test('locks access until the shared event availability', async () => {
    const token = crypto.randomBytes(32).toString('base64url');
    await candidateRepo.update(candidate.id, { fechaHoraCita: new Date(Date.now() + 3600000) });
    await invitationRepo.create({
      candidateId: candidate.id,
      eventId: 'event-1',
      orgId: 'org-1',
      tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 7200000),
    });

    await expect(service.validateAccess(token)).resolves.toMatchObject({ state: 'NOT_YET_AVAILABLE' });
  });

  test('marks an elapsed active invitation as expired', async () => {
    const token = crypto.randomBytes(32).toString('base64url');
    const invitation = await invitationRepo.create({
      candidateId: candidate.id,
      eventId: 'event-1',
      orgId: 'org-1',
      tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(service.validateAccess(token)).resolves.toEqual({ state: 'EXPIRED' });
    expect(invitationRepo.data.find((item) => item.id === invitation.id).status).toBe('EXPIRED');
  });

  test('persists one submission and consumes the invitation idempotently', async () => {
    const token = crypto.randomBytes(32).toString('base64url');
    await candidateRepo.update(candidate.id, { fechaHoraCita: new Date(Date.now() - 60000) });
    await invitationRepo.create({
      candidateId: candidate.id,
      eventId: 'event-1',
      orgId: 'org-1',
      tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 3600000),
    });
    const answers = [1, 2, 3, 4].map((number) => ({ questionId: `demo-a-${number}`, value: number }));

    const first = await service.submitEvaluation(token, answers);
    const second = await service.submitEvaluation(token, answers);

    expect(first).toMatchObject({ state: 'COMPLETED', alreadySubmitted: false });
    expect(second).toMatchObject({ state: 'COMPLETED' });
    expect(invitationRepo.submissions).toHaveLength(1);
    expect(invitationRepo.submissions[0]).toMatchObject({ module: 'A', instrumentVersion: 'DEMO_A_V1', answers });
    expect(invitationRepo.data[0].status).toBe('COMPLETED');
    expect(invitationRepo.data[0].submittedAt).toBeInstanceOf(Date);
    expect((await candidateRepo.findById(candidate.id)).status).toBe('EVALUATION_COMPLETED');
  });
});
