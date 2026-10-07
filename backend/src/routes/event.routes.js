const { Router } = require('express');
const { checkPersistedRole } = require('../middleware/checkPersistedRole');
const { validateInput } = require('../middleware/validateInput');
const { candidateSchema, eventSchema, moduleBInvitationSchema } = require('../validators/event.schema');

function createEventRoutes(eventController, authService) {
  const router = Router();
  const companyOnly = checkPersistedRole(authService, 'company');

  router.get('/', companyOnly, eventController.list);
  router.post('/', companyOnly, validateInput(eventSchema), eventController.create);
  router.get('/:eventId', companyOnly, eventController.get);
  router.get('/:eventId/candidates', companyOnly, eventController.listCandidates);
  router.post('/:eventId/invitations/publish', companyOnly, eventController.publishInvitations);
  router.post(
    '/:eventId/module-b/invitations',
    companyOnly,
    validateInput(moduleBInvitationSchema),
    eventController.sendModuleB
  );
  router.post(
    '/:eventId/candidates',
    companyOnly,
    validateInput(candidateSchema),
    eventController.createCandidate
  );

  return router;
}

module.exports = { createEventRoutes };
