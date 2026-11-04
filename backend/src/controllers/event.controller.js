class EventController {
  constructor(eventService, candidateService, invitationService, microcaseService, resultDeliveryService) {
    this.eventService = eventService;
    this.candidateService = candidateService;
    this.invitationService = invitationService;
    this.microcaseService = microcaseService;
    this.resultDeliveryService = resultDeliveryService;
  }

  list = async (req, res, next) => {
    try {
      res.json({ data: await this.eventService.listEvents(req.user.orgId) });
    } catch (error) {
      next(error);
    }
  };

  create = async (req, res, next) => {
    try {
      const event = await this.eventService.createEvent(req.user.orgId, req.body);
      res.status(201).json({ data: event });
    } catch (error) {
      next(error);
    }
  };

  get = async (req, res, next) => {
    try {
      res.json({ data: await this.eventService.getEvent(req.params.eventId, req.user.orgId) });
    } catch (error) {
      next(error);
    }
  };

  listCandidates = async (req, res, next) => {
    try {
      const candidates = await this.candidateService.listByEvent(req.params.eventId, req.user.orgId);
      res.json({ data: candidates });
    } catch (error) {
      next(error);
    }
  };

  createCandidate = async (req, res, next) => {
    try {
      const candidate = await this.candidateService.createForEvent(
        req.params.eventId,
        req.user.orgId,
        req.body
      );
      res.status(201).json({ data: candidate });
    } catch (error) {
      next(error);
    }
  };

  sendModuleB = async (req, res, next) => {
    try {
      const result = await this.invitationService.sendModuleB(
        req.params.eventId,
        req.user.orgId,
        req.body.candidateIds,
        req.body.citacion
      );
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  };



  downloadResult = async (req, res, next) => {
    try { res.json({ data: await this.resultDeliveryService.getDownloadUrl(req.params.eventId, req.params.module, req.user.orgId) }); }
    catch (error) { next(error); }
  };

  configureModuleC = async (req, res, next) => {
    try {
      await this.invitationService.requireModuleCSubscription(req.user.orgId);
      const item = await this.microcaseService.get(req.body.microcaseId);
      if (!item.active) throw new (require('../utils/errors').ValidationError)('El microcaso seleccionado no está activo.');
      const sectionIds = Array.isArray(req.body.sectionIds) ? req.body.sectionIds : [];
      const selected = item.sections.filter((section) => sectionIds.includes(section.id));
      if (!selected.length || selected.some((section) => !section.questions?.length)) throw new (require('../utils/errors').ValidationError)('Selecciona al menos una habilidad con preguntas.');
      const event = await this.eventService.assignModuleC(req.params.eventId, req.user.orgId, item, sectionIds);
      res.json({ data: event });
    } catch (error) { next(error); }
  };

  sendModuleC = async (req, res, next) => {
    try {
      const result = await this.invitationService.sendModuleC(req.params.eventId, req.user.orgId, req.body.candidateIds, req.body.sectionIds, req.body.citacion);
      res.json({ data: result });
    } catch (error) { next(error); }
  };

  refreshCitations = async (req, res, next) => {
    try {
      const result = await this.invitationService.refreshCitationStatus(req.params.eventId, req.user.orgId);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  };

  publishInvitations = async (req, res, next) => {
    try {
      const result = await this.invitationService.publishForEvent(req.params.eventId, req.user.orgId);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  };
}

module.exports = EventController;
