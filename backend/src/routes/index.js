const { Router } = require('express');

const AuthController = require('../controllers/auth.controller');
const EventController = require('../controllers/event.controller');
const AdminReviewController = require('../controllers/admin-review.controller');
const MacrocaseController = require('../controllers/macrocase.controller');
const AccessCredentialController = require('../controllers/access-credential.controller');
const OnsiteApplicationController = require('../controllers/onsite-application.controller');

const { createAuthRoutes } = require('./auth.routes');
const { createEventRoutes } = require('./event.routes');
const { createAdminReviewRoutes } = require('./admin-review.routes');
const { createMacrocaseRoutes } = require('./macrocase.routes');
const { createAccessCredentialRoutes } = require('./access-credential.routes');
const { createOnsiteApplicationRoutes } = require('./onsite-application.routes');

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
  const adminReviewController = new AdminReviewController(container.reviewService);

  const macrocaseController = new MacrocaseController(
  container.macrocaseService
);

  const accessCredentialController = new AccessCredentialController(container.accessCredentialService);
  const onsiteApplicationController = new OnsiteApplicationController(container.onsiteApplicationService);

  router.use('/auth', createAuthRoutes(authController, container.authService));
  router.use(
    '/events/:eventId/credentials',
    createAccessCredentialRoutes(accessCredentialController, container.authService)
  );
  router.use(
    '/events/:eventId/onsite',
    createOnsiteApplicationRoutes(onsiteApplicationController, container.authService)
  );
  router.use('/events', createEventRoutes(eventController, container.authService));
  router.use('/admin', createAdminReviewRoutes(adminReviewController, container.authService));
  router.use(
  '/macrocasos',
  createMacrocaseRoutes(macrocaseController, container.authService)
);

  return router;
}

module.exports = createApiRouter;
