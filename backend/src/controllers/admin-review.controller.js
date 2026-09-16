class AdminReviewController {
  constructor(reviewService) {
    this.reviewService = reviewService;
  }

  list = async (req, res, next) => {
    try { res.json({ data: await this.reviewService.listProcesses() }); } catch (error) { next(error); }
  };

  getProcess = async (req, res, next) => {
    try { res.json({ data: await this.reviewService.getProcess(req.params.eventId) }); } catch (error) { next(error); }
  };

  getParticipant = async (req, res, next) => {
    try { res.json({ data: await this.reviewService.getParticipant(req.params.eventId, req.params.anonymousId) }); } catch (error) { next(error); }
  };

  saveReview = async (req, res, next) => {
    try {
      res.json({ data: await this.reviewService.saveReview(req.params.eventId, req.params.anonymousId, req.body, req.user.uid) });
    } catch (error) { next(error); }
  };

  publish = async (req, res, next) => {
    try { res.json({ data: await this.reviewService.publish(req.params.eventId, req.user.uid) }); } catch (error) { next(error); }
  };
}

module.exports = AdminReviewController;
