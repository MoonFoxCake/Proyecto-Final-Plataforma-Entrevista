const { Router } = require('express');
const { checkRole } = require('../middleware/checkRole');
const { validateInput } = require('../middleware/validateInput');
const { registerSchema, setRoleSchema } = require('../validators/auth.schema');

/**
 * @param {import('../controllers/auth.controller')} authController
 * @returns {import('express').Router}
 */
function createAuthRoutes(authController) {
  const router = Router();

  router.post('/register', validateInput(registerSchema), authController.register);
  router.post(
    '/set-role',
    checkRole('admin'),
    validateInput(setRoleSchema),
    authController.setRole
  );

  return router;
}

module.exports = createAuthRoutes;
