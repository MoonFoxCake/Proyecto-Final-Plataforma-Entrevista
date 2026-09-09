class InvitationController {
  constructor(invitationService) {
    this.invitationService = invitationService;
  }

  validateAccess = async (req, res, next) => {
    try {
      const result = await this.invitationService.validateAccess(req.query.token);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  };

  submit = async (req, res, next) => {
    try {
      const result = await this.invitationService.submitEvaluation(req.body.token, req.body.answers);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  };
}

module.exports = InvitationController;
