const { Router } = require('express');
const { checkRole } = require('../middleware/checkRole');
const { validateInput } = require('../middleware/validateInput');
const { registerSchema, setRoleSchema } = require('../validators/auth.schema');

/**
 * Routes reachable with no Authorization header — the caller has no
 * Firebase account yet, so there's nothing to verify a token against.
 * Mounted before the `verifyToken`/`checkTenant` middleware in app.js.
 *
 * @param {import('../controllers/auth.controller')} authController
 * @returns {import('express').Router}
 */
function createPublicAuthRoutes(authController) {
  const router = Router();

  router.post('/register', validateInput(registerSchema), authController.register);

  return router;
}

/**
 * Routes that require an authenticated caller. Mounted after
 * `verifyToken`/`checkTenant` in app.js, so `req.user` is already set.
 *
 * @param {import('../controllers/auth.controller')} authController
 * @returns {import('express').Router}
 */
function createAuthRoutes(authController) {
  const router = Router();

  router.post(
    '/set-role',
    checkRole('admin'),
    validateInput(setRoleSchema),
    authController.setRole
  );

  return router;
}

module.exports = { createAuthRoutes, createPublicAuthRoutes };
