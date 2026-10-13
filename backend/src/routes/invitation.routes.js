const { Router } = require('express');
const { validateInput } = require('../middleware/validateInput');
const { submissionSchema, macrocaseStageSchema, macrocaseActionSchema } = require('../validators/event.schema');

function createPublicInvitationRoutes(invitationController) {
  const router = Router();
  router.get('/access', invitationController.validateAccess);
  router.post('/access/submit', validateInput(submissionSchema), invitationController.submit);
  // Module B, one stage at a time. POST keeps the token out of URLs and logs.
  router.post('/access/macrocase/stage', validateInput(macrocaseStageSchema), invitationController.macrocaseStage);
  router.post('/access/macrocase/advance', validateInput(macrocaseActionSchema), invitationController.advanceMacrocase);
  return router;
}

module.exports = { createPublicInvitationRoutes };
