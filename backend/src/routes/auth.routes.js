const { Router } = require('express');
const { adminPermission, ownerOnly } = require('../middleware/adminPermission');
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
    adminPermission('companies.view', 'dashboard.view'),
    authController.listCompanies
  );

  router.post(
    '/company-users',
    checkPersistedRole(authService, 'admin'),
    ownerOnly,
    validateInput(companyUserSchema),
    authController.createCompanyUser
  );

  router.post(
    '/set-role',
    checkPersistedRole(authService, 'admin'),
    ownerOnly,
    validateInput(setRoleSchema),
    authController.setRole
  );

  return router;
}

module.exports = {
  createAuthRoutes,
  createPublicAuthRoutes,
};
