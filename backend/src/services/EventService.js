const { NotFoundError } = require('../utils/errors');
const { MODALITIES, MODULES } = require('../utils/constants');
const { toAppointment } = require('../utils/eventModality');

class EventService {
  constructor(eventRepo) {
    this.eventRepo = eventRepo;
  }

  async listEvents(orgId) {
    return this.eventRepo.findByOrganization(orgId);
  }

  /**
   * `virtual`: the evaluation opens for everyone at `fechaHoraHabilitacion`
   * and candidates get a link. `presencial`: candidates are cited to a venue
   * and time (`event.onsite`); `availableFrom` is the start of that session,
   * so everything that reads the appointment time keeps working.
   */
  async createEvent(orgId, data) {
    const base = {
      orgId,
      name: data.nombre.trim(),
      position: data.puesto.trim(),
      description: data.descripcion?.trim() || '',
      modules: data.incluirModuloB === false ? [MODULES.A] : [MODULES.A, MODULES.B],
      plan: 'A',
      status: 'ACTIVE',
    };

    if (data.modalidad === 'presencial') {
      const onsite = toAppointment(data.presencial);
      return this.eventRepo.create({ ...base, modality: MODALITIES.ONSITE, availableFrom: onsite.startsAt, onsite });
    }
    return this.eventRepo.create({
      ...base,
      modality: MODALITIES.ONLINE,
      availableFrom: new Date(data.fechaHoraHabilitacion),
    });
  }

  /** Stores the macrocase copy this event's Module B uses. */
  async assignModuleB(eventId, orgId, macrocase) {
    await this.getEvent(eventId, orgId);
    return this.eventRepo.update(eventId, {
      moduleB: { macrocase, assignedAt: new Date() },
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
