const { ForbiddenError, UnauthorizedError } = require('../utils/errors');

/**
 * Middleware factory. `checkRole('admin', 'client')` returns a middleware
 * that allows the request through only if `req.user.role` is one of the
 * given roles. Must run after `verifyToken`.
 *
 * @param {...string} allowedRoles
 * @returns {import('express').RequestHandler}
 */
function checkRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(new ForbiddenError(`Requires one of roles: ${allowedRoles.join(', ')}`));
    }

    return next();
  };
}

module.exports = { checkRole };
