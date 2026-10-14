const { Router } = require('express');
const { validateInput } = require('../middleware/validateInput');
const { onsiteLoginSchema } = require('../validators/event.schema');

/**
 * Public: the candidate at the venue has no account, only the code printed
 * on their card. Mounted before `verifyToken` in app.js.
 */
function createPublicOnsiteAccessRoutes(controller) {
  const router = Router();
  router.post('/access', validateInput(onsiteLoginSchema), controller.login);
  return router;
}

module.exports = { createPublicOnsiteAccessRoutes };
