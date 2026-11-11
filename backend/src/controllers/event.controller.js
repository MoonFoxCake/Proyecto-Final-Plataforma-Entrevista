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
      res.status(201).json({ data: this.eventService.toCompanyView(event) });
    } catch (error) {
      next(error);
    }
  };

  get = async (req, res, next) => {
    try {
      res.json({ data: this.eventService.toCompanyView(await this.eventService.getEvent(req.params.eventId, req.user.orgId)) });
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
        req.body.citacion,
        req.body.ventana
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

  assignModuleC = async (req, res, next) => {
    try {
      await this.invitationService.requireModuleCSubscription(req.user.orgId);
      res.json({ data: this.eventService.toCompanyView(await this.eventService.ensureModuleC(req.params.eventId, req.user.orgId)) });
    } catch (error) { next(error); }
  };

  configureModuleC = async (req, res, next) => {
    try {
      await this.invitationService.requireModuleCSubscription(req.user.orgId);
      const event = await this.eventService.configureModuleC(req.params.eventId, req.user.orgId, req.body.sectionIds);
      res.json({ data: this.eventService.toCompanyView(event) });
    } catch (error) { next(error); }
  };

  sendModuleC = async (req, res, next) => {
    try {
      const result = await this.invitationService.sendModuleC(req.params.eventId, req.user.orgId, req.body.candidateIds, req.body.citacion, req.body.ventana);
      res.json({ data: result });
    } catch (error) { next(error); }
  };

  resendModuleA = async (req, res, next) => {
    try { res.json({ data: await this.invitationService.resendModuleA(req.params.eventId, req.user.orgId, req.params.candidateId) }); }
    catch (error) { next(error); }
  };

  withdrawCandidate = async (req, res, next) => {
    try { res.json({ data: await this.invitationService.withdrawCandidate(req.params.eventId, req.user.orgId, req.params.candidateId, req.body.modulo, req.user.uid) }); }
    catch (error) { next(error); }
  };

  closePhase = async (req, res, next) => {
    try { res.json({ data: await this.invitationService.closePhase(req.params.eventId, req.user.orgId, req.params.module, req.user.uid) }); }
    catch (error) { next(error); }
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
