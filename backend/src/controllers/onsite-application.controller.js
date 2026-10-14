class OnsiteApplicationController {
  constructor(onsiteApplicationService) {
    this.onsiteApplicationService = onsiteApplicationService;
  }

  roster = async (req, res, next) => {
    try {
      res.set('Cache-Control', 'no-store');
      res.json({ data: await this.onsiteApplicationService.roster(req.params.eventId, req.user.orgId, req.query.modulo) });
    } catch (error) {
      next(error);
    }
  };

  attendance = async (req, res, next) => {
    try {
      const result = await this.onsiteApplicationService.setAttendance(
        req.params.eventId,
        req.user.orgId,
        { module: req.body.modulo, candidateId: req.body.candidateId, present: req.body.presente },
        req.user.uid
      );
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  };
}

module.exports = OnsiteApplicationController;
