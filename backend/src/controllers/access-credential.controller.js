/**
 * Responses that carry access codes must not be stored by the browser or
 * any proxy: the codes are shown once and printed.
 */
const noStore = (res) => res.set('Cache-Control', 'no-store');

class AccessCredentialController {
  constructor(accessCredentialService) {
    this.accessCredentialService = accessCredentialService;
  }

  summary = async (req, res, next) => {
    try {
      res.json({ data: await this.accessCredentialService.summary(req.params.eventId, req.user.orgId) });
    } catch (error) {
      next(error);
    }
  };

  issue = async (req, res, next) => {
    try {
      const result = await this.accessCredentialService.issueBatch(
        req.params.eventId,
        req.user.orgId,
        { module: req.body.modulo, candidateIds: req.body.candidateIds, paper: req.body.papel },
        req.user.uid
      );
      noStore(res).status(201).json({ data: result });
    } catch (error) {
      next(error);
    }
  };

  reissue = async (req, res, next) => {
    try {
      const result = await this.accessCredentialService.reissue(
        req.params.eventId,
        req.user.orgId,
        req.params.credentialId,
        req.user.uid,
        req.body.motivo,
        req.body.papel
      );
      noStore(res).status(201).json({ data: result });
    } catch (error) {
      next(error);
    }
  };

  /** Attendance sheet PDF. Personal data, so it is not cached either. */
  attendance = async (req, res, next) => {
    try {
      const { fileName, pdf } = await this.accessCredentialService.attendanceSheet(
        req.params.eventId,
        req.user.orgId,
        req.query.modulo,
        req.query.papel
      );
      noStore(res)
        .type('application/pdf')
        .set('Content-Disposition', `attachment; filename="${fileName}"`)
        .send(pdf);
    } catch (error) {
      next(error);
    }
  };

  revoke = async (req, res, next) => {
    try {
      const result = await this.accessCredentialService.revoke(
        req.params.eventId,
        req.user.orgId,
        req.params.credentialId,
        req.user.uid,
        req.body.motivo
      );
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  };
}

module.exports = AccessCredentialController;
