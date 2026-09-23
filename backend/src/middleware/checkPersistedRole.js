const { ForbiddenError, UnauthorizedError } = require('../utils/errors');

/**
 * Checks the role stored by the server for the authenticated Firebase uid.
 * The client cannot influence this value because it is read through the
 * injected repository on the backend.
 *
 * @param {import('../services/AuthService')} authService
 * @param {...string} allowedRoles
 * @returns {import('express').RequestHandler}
 */
function checkPersistedRole(authService, ...allowedRoles) {
  return async (req, res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    try {
      const profile = await authService.getProfile(req.user.uid);
      if (!allowedRoles.includes(profile.role)) {
        return next(new ForbiddenError(`Requires one of roles: ${allowedRoles.join(', ')}`));
      }

      req.user.role = profile.role;
      req.user.orgId = profile.orgId ?? null;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = { checkPersistedRole };