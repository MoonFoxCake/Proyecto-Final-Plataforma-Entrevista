/**
 * HTTP layer for authentication/user-management endpoints. No business
 * logic here — delegates to {@link AuthService}.
 */
class AuthController {
  /**
   * @param {import('../services/AuthService')} authService
   * @param {import('../services/PasswordResetService').PasswordResetService} [passwordResetService]
   */
  constructor(authService, passwordResetService) {
    this.service = authService;
    this.passwordResetService = passwordResetService;
  }

  /** Same answer whether the account exists or not; 429 when asked too often. */
  requestPasswordReset = async (req, res, next) => {
    try {
      const result = await this.passwordResetService.request(req.body.email, { ip: req.ip });
      res.set('Cache-Control', 'no-store');
      if (result.state === 'TOO_MANY_REQUESTS') {
        res.set('Retry-After', String(result.retryAfterSeconds)).status(429);
        return res.json({ error: { message: 'Demasiadas solicitudes. Espera unos minutos e inténtalo de nuevo.', statusCode: 429 } });
      }
      return res.status(202).json({ data: { sent: true } });
    } catch (error) {
      return next(error);
    }
  };

  /** @type {import('express').RequestHandler} */
  register = async (req, res, next) => {
    try {
      const result = await this.service.registerCompany(req.body);
      res.status(201).json({ data: result });
    } catch (error) {
      next(error);
    }
  };

  /** @type {import('express').RequestHandler} */
  createCompanyUser = async (req, res, next) => {
    try {
      const result = await this.service.createCompanyUser(req.body);
      res.status(201).json({ data: result });
    } catch (error) {
      next(error);
    }
  };

  /** @type {import('express').RequestHandler} */
  getProfile = async (req, res, next) => {
    try {
      const user = await this.service.getProfile(req.user.uid);
      res.json({ data: user });
    } catch (error) {
      next(error);
    }
  };

  /** @type {import('express').RequestHandler} */
  getSubscription = async (req, res, next) => {
    try {
      const subscription = await this.service.getOrganizationSubscription(req.user.orgId);
      res.json({ data: subscription });
    } catch (error) {
      next(error);
    }
  };

  /** @type {import('express').RequestHandler} */
  listCompanies = async (req, res, next) => {
    try {
      const companies = await this.service.listCompaniesWithUsers();
      res.json({ data: companies });
    } catch (error) {
      next(error);
    }
  };

  /** @type {import('express').RequestHandler} */
  setRole = async (req, res, next) => {
    try {
      const { uid, role, orgId } = req.body;
      const user = await this.service.assignRole(uid, role, orgId);
      res.json({ data: user });
    } catch (error) {
      next(error);
    }
  };

  updateSubscription = async (req, res, next) => {
  try {
    const result = await this.service.updateOrganizationSubscription(
      req.user.orgId,
      req.body.planId
    );
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
};
}

module.exports = AuthController;
