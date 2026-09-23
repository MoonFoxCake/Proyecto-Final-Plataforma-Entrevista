class EventController {
  constructor(eventService, candidateService, invitationService) {
    this.eventService = eventService;
    this.candidateService = candidateService;
    this.invitationService = invitationService;
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
