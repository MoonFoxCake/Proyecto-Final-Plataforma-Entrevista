const { NotFoundError, ForbiddenError, ValidationError } = require('../utils/errors');
const { MODALITIES, MODULES } = require('../utils/constants');
const { modulesOf, toAppointment } = require('../utils/eventModality');

class EventService {
  /**
   * @param {object} eventRepo
   * @param {object} organizationRepo
   * @param {object} [questionBankService]
   * @param {{ macrocaseService?: object, microcaseService?: object, random?: () => number }} [deps]
   */
  constructor(eventRepo, organizationRepo, questionBankService, { macrocaseService, microcaseService, random = Math.random } = {}) {
    this.eventRepo = eventRepo;
    this.questionBankService = questionBankService;
    this.organizationRepo = organizationRepo;
    this.macrocaseService = macrocaseService;
    this.microcaseService = microcaseService;
    this.random = random;
  }

  /** The instruments can be large and are not needed to list processes. */
  async listEvents(orgId) {
    const events = await this.eventRepo.findByOrganization(orgId);
    return events.map(({ moduleA, moduleB, moduleC, ...event }) => event);
  }

  /**
   * What the company sees of a process: which case it has and the skills it
   * can choose, never the case's texts or questions.
   */
  toCompanyView({ moduleA, moduleB, moduleC, ...event }) {
    return {
      ...event,
      ...(moduleB?.macrocase ? { moduleB: { macrocase: { name: moduleB.macrocase.name } } } : {}),
      ...(moduleC?.microcase ? {
        moduleC: {
          microcase: {
            name: moduleC.microcase.name,
            sections: (moduleC.microcase.sections || []).map(({ id, title }) => ({ id, title })),
          },
          sectionIds: moduleC.sectionIds || [],
          status: moduleC.status,
          lockedAt: moduleC.lockedAt || null,
        },
      } : {}),
    };
  }

  /**
   * `virtual`: the evaluation opens for everyone at `fechaHoraHabilitacion`
   * and candidates get a link. `presencial`: candidates are cited to a venue
   * and time (`event.onsite`); `availableFrom` is the start of that session,
   * so everything that reads the appointment time keeps working.
   *
   * The instruments are drawn here, at random among the active ones, and
   * copied into the process: every candidate gets the same case, and later
   * edits in the banks do not change a running process.
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
    const instrument = this.questionBankService ? await this.questionBankService.pickSnapshot() : null;
    const macrocase = modules.includes(MODULES.B) && this.macrocaseService ? await this.macrocaseService.pickSnapshotForModuleB() : null;
    const microcase = modules.includes(MODULES.C) && this.microcaseService ? await this.microcaseService.pickSnapshot() : null;
    const assignedAt = new Date();
    const base = {
      ...(instrument ? { moduleA: { instrument, assignedAt: assignedAt.toISOString() } } : {}),
      ...(macrocase ? { moduleB: { macrocase, assignedAt } } : {}),
      ...(microcase ? { moduleC: { microcase, assignedAt, status: 'ASSIGNED' } } : {}),
      orgId,
      name: data.nombre.trim(),
      position: data.puesto.trim(),
      description: data.descripcion?.trim() || '',
      modules,
      plan: planId,
      status: 'ACTIVE',
      // Each phase opens only after the previous phase's PDF was delivered.
      requiresPhaseReports: true,
    };

    if (data.modalidad === 'presencial') {
      const onsite = toAppointment(data.presencial);
      return this.eventRepo.create({ ...base, modality: MODALITIES.ONSITE, availableFrom: onsite.startsAt, onsite });
    }
    return this.eventRepo.create({
      ...base,
      modality: MODALITIES.ONLINE,
      availableFrom: new Date(data.fechaHoraHabilitacion),
      // The Module A links stop working at this moment.
      availableUntil: new Date(data.fechaHoraCierre),
    });
  }

  /** Stores the macrocase copy this event's Module B uses. */
  async assignModuleB(eventId, orgId, macrocase) {
    await this.getEvent(eventId, orgId);
    return this.eventRepo.update(eventId, {
      moduleB: { macrocase, assignedAt: new Date() },
    });
  }

  /** Processes created before the draw moved to creation get their microcase here. */
  async ensureModuleC(eventId, orgId) {
    const event = await this.getEvent(eventId, orgId);
    if (!modulesOf(event).includes(MODULES.C)) throw new ValidationError('Este proceso no incluye el Módulo C.');
    if (event.moduleC?.microcase) return event;
    const microcase = await this.microcaseService.pickSnapshot();
    return this.eventRepo.update(eventId, { moduleC: { microcase, assignedAt: new Date(), status: 'ASSIGNED' } });
  }

  /**
   * The company decides which skills of the process's microcase to evaluate.
   * One question per skill is drawn here and is the same for every candidate.
   * After the first invitation the choice can no longer change.
   */
  async configureModuleC(eventId, orgId, sectionIds) {
    const event = await this.ensureModuleC(eventId, orgId);
    const requested = [...new Set(Array.isArray(sectionIds) ? sectionIds : [])];
    const sections = (event.moduleC.microcase.sections || []).filter((section) => requested.includes(section.id));
    if (!sections.length || sections.length !== requested.length || sections.some((section) => !(section.questions || []).length)) {
      throw new ValidationError('Selecciona al menos una habilidad con preguntas.');
    }
    if (event.moduleC.lockedAt) {
      const same = requested.length === (event.moduleC.sectionIds || []).length
        && requested.every((id) => event.moduleC.sectionIds.includes(id));
      if (!same) throw new ValidationError('Las habilidades ya se fijaron al enviar las primeras invitaciones.');
      return event;
    }
    const questions = sections.map((section) => {
      const question = section.questions[Math.floor(this.random() * section.questions.length) % section.questions.length];
      return { sectionId: section.id, sectionTitle: section.title, questionId: question.id, question: question.text };
    });
    return this.eventRepo.update(eventId, { moduleC: { ...event.moduleC, sectionIds: requested, questions, configuredAt: new Date(), status: 'CONFIGURED' } });
  }

  async getEvent(eventId, orgId) {
    const event = await this.eventRepo.findById(eventId);
    const ownerOrgId = event?.orgId ?? event?.recruiterOrgId;
    if (!event || ownerOrgId !== orgId) throw new NotFoundError('Evento no encontrado.');
    return event;
  }
}

module.exports = EventService;
