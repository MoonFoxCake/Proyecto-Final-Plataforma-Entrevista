const { CANDIDATE_STATUSES } = require('../utils/constants');
const { ValidationError } = require('../utils/errors');

class CandidateService {
  constructor(candidateRepo, eventService) {
    this.candidateRepo = candidateRepo;
    this.eventService = eventService;
  }

  async listByEvent(eventId, orgId) {
    const event = await this.eventService.getEvent(eventId, orgId);
    const candidates = await this.candidateRepo.findByEvent(eventId, orgId);
    return candidates.map((candidate) => ({
      ...this.toCompanyCandidate(candidate),
      profileAvailable: Boolean(event.evaluationsPublishedAt && candidate.reviewStatus === 'REVIEWED'),
    }));
  }

  async createForEvent(eventId, orgId, data) {
    const event = await this.eventService.getEvent(eventId, orgId);
    if (event.evaluationsPublishedAt || event.status === 'PUBLISHED') {
      throw new ValidationError('No se pueden agregar candidatos a un proceso publicado.');
    }

    const cedula = data.cedula.trim();
    if (await this.candidateRepo.findByCedulaAndEvent(eventId, cedula)) {
      throw new ValidationError('Ya existe un candidato con esa cédula en el evento.');
    }

    const fechaHoraCita = event.availableFrom ?? event.fechaHoraCita ?? event.eventDate ?? event.date;
    if (!fechaHoraCita) {
      throw new ValidationError('El evento no tiene una fecha de habilitación configurada.');
    }

    const candidates = await this.candidateRepo.findByEvent(eventId, orgId);
    const created = await this.candidateRepo.create({
      eventId,
      orgId,
      anonymousCode: `P-${String(candidates.length + 1).padStart(3, '0')}`,
      nombreCompleto: data.nombreCompleto.trim(),
      cedula,
      correo: data.correo.trim().toLowerCase(),
      fechaHoraCita,
      status: CANDIDATE_STATUSES.INVITED_PENDING,
    });
    return this.toCompanyCandidate(created);
  }

  toCompanyCandidate(candidate) {
    const { anonymousCode, reviewObservations, reviewedBy, ...companyCandidate } = candidate;
    return companyCandidate;
  }
}

module.exports = CandidateService;
