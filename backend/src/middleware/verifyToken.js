const { UnauthorizedError } = require('../utils/errors');

/**
 * Extracts the Bearer token from the Authorization header, verifies it
 * against Firebase Auth, and injects the decoded user into `req.user`
 * as `{ uid, email, role, orgId }`.
 *
 * For now this returns a mocked user so downstream development
 * (routes/controllers/services) can proceed without a live Firebase
 * project configured.
 *
 * @type {import('express').RequestHandler}
 */
function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return next(new UnauthorizedError('Missing Authorization Bearer token'));
  }

  try {
    // TODO: implement Firebase token verification:
    // const decoded = await admin.auth().verifyIdToken(token);
    // req.user = { uid: decoded.uid, email: decoded.email, role: decoded.role, orgId: decoded.orgId };

    // Mocked user for local development until the above is implemented.
    req.user = {
      uid: 'mock-uid',
      email: 'mock.user@example.com',
      role: 'admin',
      orgId: 'mock-org',
    };

    return next();
  } catch (error) {
    return next(new UnauthorizedError('Invalid or expired token'));
  }
}

module.exports = { verifyToken };
