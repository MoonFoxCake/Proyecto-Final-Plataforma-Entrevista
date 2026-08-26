const { auth } = require('../config/firebase');
const { UnauthorizedError } = require('../utils/errors');

/**
 * Extracts the Bearer token from the Authorization header, verifies it
 * against Firebase Auth, and injects the decoded user into `req.user` as
 * `{ uid, email, role, orgId }`. `role`/`orgId` come from custom claims
 * (see `AuthService.assignRole`) and are `null` until a role is assigned.
 *
 * @type {import('express').RequestHandler}
 */
async function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return next(new UnauthorizedError('Missing Authorization Bearer token'));
  }

  try {
    const decoded = await auth.verifyIdToken(token);

    req.user = {
      uid: decoded.uid,
      email: decoded.email,
      role: decoded.role ?? null,
      orgId: decoded.orgId ?? null,
    };

    return next();
  } catch (error) {
    return next(new UnauthorizedError('Invalid or expired token'));
  }
}

module.exports = { verifyToken };
