const { adminPermission } = require('../middleware/adminPermission');
const { Router } = require('express');
const { checkPersistedRole } = require('../middleware/checkPersistedRole');
const { validateInput } = require('../middleware/validateInput');
const { validateParams } = require('../middleware/validateParams');
const { reviewSchema, phaseParamSchema } = require('../validators/event.schema');

function createAdminReviewRoutes(controller, authService) {
  const router = Router();
  router.use(checkPersistedRole(authService, 'admin'));
  router.get('/processes', adminPermission('processes.view', 'companies.view', 'dashboard.view', 'evaluations.review', 'evaluations.publish'), controller.list);
  router.get('/processes/:eventId', adminPermission('processes.view', 'companies.view', 'evaluations.review', 'evaluations.publish'), controller.getProcess);
  router.get('/processes/:eventId/participants/:anonymousId', adminPermission('evaluations.review', 'evaluations.publish'), controller.getParticipant);
  router.patch('/processes/:eventId/participants/:anonymousId', adminPermission('evaluations.review'), validateInput(reviewSchema), controller.saveReview);
  router.post('/processes/:eventId/publish', adminPermission('evaluations.publish'), controller.publish);
  router.post('/processes/:eventId/phases/:module/close', adminPermission('evaluations.publish'), validateParams(phaseParamSchema), controller.closePhase);
  return router;
}

module.exports = { createAdminReviewRoutes };
