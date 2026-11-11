const { createAdminAccountRoutes } = require('./admin-accounts.routes');
const { createQuestionBankRoutes } = require('./question-bank.routes');
const { Router } = require('express');

const AuthController = require('../controllers/auth.controller');
const EventController = require('../controllers/event.controller');
const AdminReviewController = require('../controllers/admin-review.controller');
const MacrocaseController = require('../controllers/macrocase.controller');
const MicrocaseController = require('../controllers/microcase.controller');
const AccessCredentialController = require('../controllers/access-credential.controller');
const OnsiteApplicationController = require('../controllers/onsite-application.controller');
const ResultDeliveryController = require('../controllers/result-delivery.controller');

const { createAuthRoutes } = require('./auth.routes');
const { createEventRoutes } = require('./event.routes');
const { createAdminReviewRoutes } = require('./admin-review.routes');
const { createMacrocaseRoutes } = require('./macrocase.routes');
const { createMicrocaseRoutes } = require('./microcase.routes');
const { createAccessCredentialRoutes } = require('./access-credential.routes');
const { createOnsiteApplicationRoutes } = require('./onsite-application.routes');
const { createResultDeliveryRoutes } = require('./result-delivery.routes');

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
    container.invitationService,
    container.microcaseService,
    container.resultDeliveryService
  );
  const adminReviewController = new AdminReviewController(container.reviewService);

  const macrocaseController = new MacrocaseController(
  container.macrocaseService
);

  const microcaseController = new MicrocaseController(container.microcaseService);

  const accessCredentialController = new AccessCredentialController(container.accessCredentialService);
  const onsiteApplicationController = new OnsiteApplicationController(container.onsiteApplicationService);
  const resultDeliveryController = new ResultDeliveryController(container.resultDeliveryService);

  router.use('/admin/question-groups', createQuestionBankRoutes(container.questionBankService, container.authService));
  router.use('/admin', createAdminAccountRoutes(container.adminAccountService, container.authService));
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
  router.use('/admin/results', createResultDeliveryRoutes(resultDeliveryController, container.authService));
  router.use('/macrocasos', createMacrocaseRoutes(macrocaseController, container.authService));
  router.use('/microcasos', createMicrocaseRoutes(microcaseController, container.authService));

  return router;
}

module.exports = createApiRouter;
