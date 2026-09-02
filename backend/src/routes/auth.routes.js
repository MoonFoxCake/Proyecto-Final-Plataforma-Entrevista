const { Router } = require('express');
const { checkRole } = require('../middleware/checkRole');
const { checkPersistedRole } = require('../middleware/checkPersistedRole');
const { validateInput } = require('../middleware/validateInput');
const { registerSchema, companyUserSchema, candidateUserSchema, setRoleSchema } = require('../validators/auth.schema');

/**
 * Routes reachable with no Authorization header — the caller has no
 * Firebase account yet, so there's nothing to verify a token against.
 * Mounted before the `verifyToken`/`checkTenant` middleware in app.js.
 *
 * @param {import('../controllers/auth.controller')} authController
 * @param {import('../services/AuthService')} authService
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
function createAuthRoutes(authController, authService) {
  const router = Router();

  router.get('/me', authController.getProfile);

  router.get('/companies', checkPersistedRole(authService, 'admin'), authController.listCompanies);

  router.get('/candidates', checkPersistedRole(authService, 'company'), authController.listCandidates);

  router.post(
    '/candidates',
    checkPersistedRole(authService, 'company'),
    validateInput(candidateUserSchema),
    authController.createCandidateUser
  );

  router.post(
    '/company-users',
    checkPersistedRole(authService, 'admin'),
    validateInput(companyUserSchema),
    authController.createCompanyUser
  );

  router.post(
    '/set-role',
    checkRole('admin'),
    validateInput(setRoleSchema),
    authController.setRole
  );

  return router;
}

module.exports = { createAuthRoutes, createPublicAuthRoutes };
