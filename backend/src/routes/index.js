const { Router } = require('express');

const AuthController = require('../controllers/auth.controller');
const EventController = require('../controllers/event.controller');

const { createAuthRoutes } = require('./auth.routes');
const { createEventRoutes } = require('./event.routes');

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
  const eventController = new EventController(
    container.eventService,
    container.candidateService,
    container.invitationService
  );

  router.use('/auth', createAuthRoutes(authController, container.authService));
  router.use('/events', createEventRoutes(eventController, container.authService));

  return router;
}

module.exports = createApiRouter;
