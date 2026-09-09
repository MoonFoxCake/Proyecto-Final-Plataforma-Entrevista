const { NotFoundError } = require('../utils/errors');

class EventService {
  constructor(eventRepo) {
    this.eventRepo = eventRepo;
  }

  async listEvents(orgId) {
    return this.eventRepo.findByOrganization(orgId);
  }

  async createEvent(orgId, data) {
    return this.eventRepo.create({
      orgId,
      name: data.nombre.trim(),
      position: data.puesto.trim(),
      description: data.descripcion?.trim() || '',
      availableFrom: new Date(data.fechaHoraHabilitacion),
      plan: 'A',
      status: 'ACTIVE',
    });
  }

  async getEvent(eventId, orgId) {
    const event = await this.eventRepo.findById(eventId);
    const ownerOrgId = event?.orgId ?? event?.recruiterOrgId;
    if (!event || ownerOrgId !== orgId) throw new NotFoundError('Evento no encontrado.');
    return event;
  }
}

module.exports = EventService;
