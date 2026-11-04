const { Router } = require('express');
const { checkRole } = require('../middleware/checkRole');
const { checkPersistedRole } = require('../middleware/checkPersistedRole');
const { validateInput } = require('../middleware/validateInput');
const {
  registerSchema,
  companyUserSchema,
  setRoleSchema,
  updateSubscriptionSchema,
} = require('../validators/auth.schema');

/**
 * Rutas públicas que no requieren autenticación.
 */
function createPublicAuthRoutes(authController) {
  const router = Router();

  router.post(
    '/register',
    validateInput(registerSchema),
    authController.register
  );

  return router;
}

/**
 * Rutas que requieren autenticación.
 */
function createAuthRoutes(authController, authService) {
  const router = Router();

  router.get('/me', authController.getProfile);

  router.get(
    '/subscription',
    checkPersistedRole(authService, 'company'),
    authController.getSubscription
  );

  router.patch(
    '/subscription',
    checkPersistedRole(authService, 'company'),
    validateInput(updateSubscriptionSchema),
    authController.updateSubscription
  );

  router.get(
    '/companies',
    checkPersistedRole(authService, 'admin'),
    authController.listCompanies
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

module.exports = {
  createAuthRoutes,
  createPublicAuthRoutes,
};
