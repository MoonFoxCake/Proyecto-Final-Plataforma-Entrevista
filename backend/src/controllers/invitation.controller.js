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

  macrocaseStage = async (req, res, next) => {
    try {
      res.json({ data: await this.invitationService.getMacrocaseStage(req.body.token) });
    } catch (error) {
      next(error);
    }
  };

  advanceMacrocase = async (req, res, next) => {
    try {
      res.json({ data: await this.invitationService.advanceMacrocase(req.body.token, req.body.action) });
    } catch (error) {
      next(error);
    }
  };

  submit = async (req, res, next) => {
    try {
      const result = await this.invitationService.submitEvaluation(req.body.token, req.body);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  };
}

module.exports = InvitationController;
