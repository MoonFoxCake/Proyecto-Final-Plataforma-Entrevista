const { CANDIDATE_STATUSES } = require('../utils/constants');
const { ValidationError } = require('../utils/errors');

class CandidateService {
  constructor(candidateRepo, eventService) {
    this.candidateRepo = candidateRepo;
    this.eventService = eventService;
  }

  async listByEvent(eventId, orgId) {
    await this.eventService.getEvent(eventId, orgId);
    return this.candidateRepo.findByEvent(eventId, orgId);
  }

  async createForEvent(eventId, orgId, data) {
    const event = await this.eventService.getEvent(eventId, orgId);

    const cedula = data.cedula.trim();
    if (await this.candidateRepo.findByCedulaAndEvent(eventId, cedula)) {
      throw new ValidationError('Ya existe un candidato con esa cédula en el evento.');
    }

    const fechaHoraCita = event.availableFrom ?? event.fechaHoraCita ?? event.eventDate ?? event.date;
    if (!fechaHoraCita) {
      throw new ValidationError('El evento no tiene una fecha de habilitación configurada.');
    }

    return this.candidateRepo.create({
      eventId,
      orgId,
      nombreCompleto: data.nombreCompleto.trim(),
      cedula,
      correo: data.correo.trim().toLowerCase(),
      fechaHoraCita,
      status: CANDIDATE_STATUSES.INVITED_PENDING,
    });
  }
}

module.exports = CandidateService;
