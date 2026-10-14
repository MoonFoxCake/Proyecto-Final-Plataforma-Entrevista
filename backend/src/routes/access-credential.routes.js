const { Router } = require('express');
const { checkPersistedRole } = require('../middleware/checkPersistedRole');
const { validateInput } = require('../middleware/validateInput');
const { validateQuery } = require('../middleware/validateQuery');
const { credentialBatchSchema, credentialActionSchema, attendanceQuerySchema } = require('../validators/event.schema');

/**
 * `/events/:eventId/credentials` — onsite access credentials. Company users
 * only; the service checks that the event belongs to their organization.
 */
function createAccessCredentialRoutes(controller, authService) {
  const router = Router({ mergeParams: true });
  const companyOnly = checkPersistedRole(authService, 'company');

  router.get('/', companyOnly, controller.summary);
  router.post('/', companyOnly, validateInput(credentialBatchSchema), controller.issue);
  router.get('/attendance.pdf', companyOnly, validateQuery(attendanceQuerySchema), controller.attendance);
  router.post('/:credentialId/reissue', companyOnly, validateInput(credentialActionSchema), controller.reissue);
  router.post('/:credentialId/revoke', companyOnly, validateInput(credentialActionSchema), controller.revoke);

  return router;
}

module.exports = { createAccessCredentialRoutes };
