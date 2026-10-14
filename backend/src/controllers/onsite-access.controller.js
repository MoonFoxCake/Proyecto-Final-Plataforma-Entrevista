// Random id the candidate's browser keeps, to limit attempts per computer
// in a room where every computer may share one public IP.
const CLIENT_ID = /^[A-Za-z0-9-]{8,64}$/;

class OnsiteAccessController {
  constructor(onsiteAccessService) {
    this.onsiteAccessService = onsiteAccessService;
  }

  /** The response may carry a session token: never cached, never logged. */
  login = async (req, res, next) => {
    try {
      const clientId = req.get('X-Onsite-Client');
      const result = await this.onsiteAccessService.login(req.body.codigo, {
        ip: req.ip,
        clientId: CLIENT_ID.test(clientId || '') ? clientId : undefined,
      });
      res.set('Cache-Control', 'no-store');
      if (result.state === 'TOO_MANY_ATTEMPTS') {
        res.set('Retry-After', String(result.retryAfterSeconds)).status(429);
      }
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  };
}

module.exports = OnsiteAccessController;
