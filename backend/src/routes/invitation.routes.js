const { Router } = require('express');
const { validateInput } = require('../middleware/validateInput');
const { submissionSchema } = require('../validators/event.schema');

function createPublicInvitationRoutes(invitationController) {
  const router = Router();
  router.get('/access', invitationController.validateAccess);
  router.post('/access/submit', validateInput(submissionSchema), invitationController.submit);
  return router;
}

module.exports = { createPublicInvitationRoutes };
