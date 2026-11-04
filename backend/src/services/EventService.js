const { NotFoundError, ForbiddenError } = require('../utils/errors');
const { MODALITIES, MODULES } = require('../utils/constants');
const { toAppointment } = require('../utils/eventModality');

class EventService {
  constructor(eventRepo, organizationRepo) {
    this.eventRepo = eventRepo;
    this.organizationRepo = organizationRepo;
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
    const organization = this.organizationRepo ? await this.organizationRepo.findById(orgId) : null;
    const rawPlan = organization?.subscription?.planId || organization?.subscriptionPlan || 'fase-a';
    const planId = ({ A: 'fase-a', AB: 'fase-a-b', COMPLETE: 'completo' })[rawPlan] || rawPlan;
    const allowedModules = ({ 'fase-a': ['A'], 'fase-a-b': ['A', 'B'], completo: ['A', 'B', 'C'] })[planId];
    if (!allowedModules) throw new ForbiddenError('No se pudo verificar un plan válido para crear el evento.');
    if (data.incluirModuloB && !allowedModules.includes('B')) throw new ForbiddenError('Tu suscripción Fase A no incluye el Módulo B.');
    if (data.incluirModuloC && !allowedModules.includes('C')) throw new ForbiddenError('El Módulo C requiere el Plan completo.');
    if (data.incluirModuloC && !data.incluirModuloB) throw new ForbiddenError('El Módulo C requiere que el evento incluya también el Módulo B.');
    const modules = ['A'];
    if (data.incluirModuloB && allowedModules.includes('B')) modules.push('B');
    if (data.incluirModuloC && allowedModules.includes('C')) modules.push('C');
    const base = {
      orgId,
      name: data.nombre.trim(),
      position: data.puesto.trim(),
      description: data.descripcion?.trim() || '',
      modules,
      plan: planId,
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

  async assignModuleC(eventId, orgId, microcase, sectionIds) {
    await this.getEvent(eventId, orgId);
    const sections = (microcase.sections || []).filter((section) => sectionIds.includes(section.id));
    if (!sections.length || sections.some((section) => !(section.questions || []).length)) throw new (require('../utils/errors').ValidationError)('Selecciona habilidades que tengan preguntas.');
    return this.eventRepo.update(eventId, { modules: [...new Set([...((await this.getEvent(eventId, orgId)).modules || ['A', 'B']), 'C'])], moduleC: { microcase: { id: microcase.id, name: microcase.name, story: microcase.story, timeLimitMinutes: microcase.timeLimitMinutes || 15, sections }, sectionIds, assignedAt: new Date(), status: 'CONFIGURED' } });
  }

  async getEvent(eventId, orgId) {
    const event = await this.eventRepo.findById(eventId);
    const ownerOrgId = event?.orgId ?? event?.recruiterOrgId;
    if (!event || ownerOrgId !== orgId) throw new NotFoundError('Evento no encontrado.');
    return event;
  }
}

module.exports = EventService;
