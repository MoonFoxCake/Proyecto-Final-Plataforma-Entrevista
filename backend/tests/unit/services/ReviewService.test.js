const ReviewService = require('../../../src/services/ReviewService');
const InMemoryEventRepository = require('../../../src/repositories/in-memory/InMemoryEventRepository');
const InMemoryCandidateRepository = require('../../../src/repositories/in-memory/InMemoryCandidateRepository');
const InMemoryInvitationRepository = require('../../../src/repositories/in-memory/InMemoryInvitationRepository');
const InMemoryOrganizationRepository = require('../../../src/repositories/in-memory/InMemoryOrganizationRepository');

describe('ReviewService', () => {
  let eventRepo;
  let candidateRepo;
  let invitationRepo;
  let service;
  let event;
  let candidate;

  beforeEach(async () => {
    eventRepo = new InMemoryEventRepository();
    candidateRepo = new InMemoryCandidateRepository();
    invitationRepo = new InMemoryInvitationRepository();
    const organizationRepo = new InMemoryOrganizationRepository();
    await organizationRepo.create({ id: 'org-1', companyName: 'TechCorp' });
    event = await eventRepo.create({ orgId: 'org-1', name: 'Programa Trainee', position: 'Desarrollador', status: 'ACTIVE' });
    candidate = await candidateRepo.create({
      eventId: event.id, orgId: 'org-1', anonymousCode: 'P-001', nombreCompleto: 'Identidad Privada',
      correo: 'privado@example.com', cedula: '123', status: 'EVALUATION_COMPLETED', submittedAt: new Date(),
    });
    invitationRepo.submissions.push({
      id: 'submission-1', candidateId: candidate.id, eventId: event.id, module: 'A', submittedAt: new Date(),
      answers: [{ questionId: 'demo-a-1', value: 4 }],
    });
    service = new ReviewService({ eventRepo, candidateRepo, invitationRepo, organizationRepo });
  });

  test('returns only anonymous participant data to administrators', async () => {
    const process = await service.getProcess(event.id);
    expect(process.participants).toEqual([expect.objectContaining({ anonymousId: 'P-001', status: 'PENDING_REVIEW' })]);
    const serialized = JSON.stringify(process);
    expect(serialized).not.toContain('Identidad Privada');
    expect(serialized).not.toContain('privado@example.com');
    expect(process.participants[0]).not.toHaveProperty('cedula');
  });

  test('exposes individual Likert responses with question context', async () => {
    const participant = await service.getParticipant(event.id, 'P-001');
    expect(participant).toMatchObject({ anonymousId: 'P-001', module: 'A', status: 'PENDING_REVIEW' });
    expect(participant.answers[0]).toMatchObject({ questionId: 'demo-a-1', dimension: 'HBE', value: 4, label: 'De acuerdo' });
    expect(participant).not.toHaveProperty('nombreCompleto');
  });

  test('blocks publication until every response is reviewed', async () => {
    await expect(service.publish(event.id, 'admin-1')).rejects.toThrow('Debes revisar a todos los participantes antes de publicar.');
  });

  test('saves observations, marks reviewed and publishes the process', async () => {
    const reviewed = await service.saveReview(event.id, 'P-001', { observations: 'Revisión manual.', reviewed: true }, 'admin-1');
    expect(reviewed).toMatchObject({ status: 'REVIEWED', observations: 'Revisión manual.' });
    const published = await service.publish(event.id, 'admin-1');
    expect(published.status).toBe('PUBLISHED');
    expect(published.evaluationsPublishedAt).toBeInstanceOf(Date);
    expect((await candidateRepo.findById(candidate.id)).profilePublishedAt).toBeInstanceOf(Date);
  });
});
