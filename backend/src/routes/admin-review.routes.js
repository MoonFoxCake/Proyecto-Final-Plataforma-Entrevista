const { adminPermission } = require('../middleware/adminPermission');
const { Router } = require('express');
const { checkPersistedRole } = require('../middleware/checkPersistedRole');
const { validateInput } = require('../middleware/validateInput');
const { reviewSchema } = require('../validators/event.schema');

const RESULTS = ['results.view', 'results.deliver'];

/**
 * Resultados: every process with its anonymous participants and answers.
 * The list also feeds the dashboard and the companies view. Closing a phase
 * is the company's decision, so it is not offered here.
 */
function createAdminReviewRoutes(controller, authService) {
  const router = Router();
  router.use(checkPersistedRole(authService, 'admin'));
  router.get('/processes', adminPermission(...RESULTS, 'dashboard.view', 'companies.view'), controller.list);
  router.get('/processes/:eventId', adminPermission(...RESULTS), controller.getProcess);
  router.get('/processes/:eventId/participants/:anonymousId', adminPermission(...RESULTS), controller.getParticipant);
  router.patch('/processes/:eventId/participants/:anonymousId', adminPermission('results.deliver'), validateInput(reviewSchema), controller.saveReview);
  return router;
}

module.exports = { createAdminReviewRoutes };
