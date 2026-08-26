const { Router } = require('express');

const AuthController = require('../controllers/auth.controller');

const { createAuthRoutes } = require('./auth.routes');

/**
 * Builds the `/api/v1` router tree, wiring each sub-router's controller
 * from the services exposed by the DI container.
 *
 * @param {ReturnType<typeof import('../container').createContainer>} container
 * @returns {import('express').Router}
 */
function createApiRouter(container) {
  const router = Router();

  const authController = new AuthController(container.authService);

  router.use('/auth', createAuthRoutes(authController));

  return router;
}

module.exports = createApiRouter;
