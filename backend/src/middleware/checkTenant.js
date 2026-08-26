const { UnauthorizedError } = require('../utils/errors');

/**
 * Reads `req.user.orgId` (set by `verifyToken`) and injects it as
 * `req.tenantId` so controllers can pass it down to services without
 * reaching into `req.user` themselves.
 *
 * @type {import('express').RequestHandler}
 */
function checkTenant(req, res, next) {
  if (!req.user) {
    return next(new UnauthorizedError('Authentication required'));
  }

  req.tenantId = req.user.orgId;
  return next();
}

module.exports = { checkTenant };
