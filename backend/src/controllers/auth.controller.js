/**
 * HTTP layer for authentication/user-management endpoints. No business
 * logic here — delegates to {@link AuthService}.
 */
class AuthController {
  /** @param {import('../services/AuthService')} authService */
  constructor(authService) {
    this.service = authService;
  }

  /** @type {import('express').RequestHandler} */
  register = async (req, res, next) => {
    try {
      const user = await this.service.registerUser(req.body);
      res.status(201).json({ data: user });
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
  setRole = async (req, res, next) => {
    try {
      const { uid, role, orgId } = req.body;
      const user = await this.service.assignRole(uid, role, orgId);
      res.json({ data: user });
    } catch (error) {
      next(error);
    }
  };
}

module.exports = AuthController;
