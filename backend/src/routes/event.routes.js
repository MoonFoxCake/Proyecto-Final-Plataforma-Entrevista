const { Router } = require('express');
const { checkPersistedRole } = require('../middleware/checkPersistedRole');
const { validateInput } = require('../middleware/validateInput');
const {
  candidateSchema, eventSchema, moduleBInvitationSchema, moduleCConfigSchema, moduleCInvitationSchema, withdrawSchema, phaseParamSchema,
} = require('../validators/event.schema');
const { validateParams } = require('../middleware/validateParams');

function createEventRoutes(eventController, authService) {
  const router = Router();
  const companyOnly = checkPersistedRole(authService, 'company');

  router.get('/', companyOnly, eventController.list);
  router.post('/', companyOnly, validateInput(eventSchema), eventController.create);
  router.get('/:eventId', companyOnly, eventController.get);
  router.get('/:eventId/candidates', companyOnly, eventController.listCandidates);
  // Online events: access links. Onsite events: citations without access.
  router.post('/:eventId/invitations/publish', companyOnly, eventController.publishInvitations);
  router.post('/:eventId/citations/status', companyOnly, eventController.refreshCitations);
  router.post('/:eventId/module-c/assign', companyOnly, eventController.assignModuleC);
  router.put('/:eventId/module-c/configure', companyOnly, validateInput(moduleCConfigSchema), eventController.configureModuleC);
  router.post('/:eventId/module-c/invitations', companyOnly, validateInput(moduleCInvitationSchema), eventController.sendModuleC);
  router.get('/:eventId/results/:module/download', companyOnly, validateParams(phaseParamSchema), eventController.downloadResult);
  router.post('/:eventId/phases/:module/close', companyOnly, validateParams(phaseParamSchema), eventController.closePhase);
  router.post('/:eventId/candidates/:candidateId/resend', companyOnly, eventController.resendModuleA);
  router.post('/:eventId/candidates/:candidateId/withdraw', companyOnly, validateInput(withdrawSchema), eventController.withdrawCandidate);
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
