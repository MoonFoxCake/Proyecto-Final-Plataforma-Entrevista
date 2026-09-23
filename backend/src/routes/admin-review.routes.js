const { Router } = require('express');
const { checkPersistedRole } = require('../middleware/checkPersistedRole');
const { validateInput } = require('../middleware/validateInput');
const { reviewSchema } = require('../validators/event.schema');

function createAdminReviewRoutes(controller, authService) {
  const router = Router();
  router.use(checkPersistedRole(authService, 'admin'));
  router.get('/processes', controller.list);
  router.get('/processes/:eventId', controller.getProcess);
  router.get('/processes/:eventId/participants/:anonymousId', controller.getParticipant);
  router.patch('/processes/:eventId/participants/:anonymousId', validateInput(reviewSchema), controller.saveReview);
  router.post('/processes/:eventId/publish', controller.publish);
  return router;
}

module.exports = { createAdminReviewRoutes };
