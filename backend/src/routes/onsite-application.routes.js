const { Router } = require('express');
const { checkPersistedRole } = require('../middleware/checkPersistedRole');
const { validateInput } = require('../middleware/validateInput');
const { validateQuery } = require('../middleware/validateQuery');
const { onsiteRosterQuerySchema, attendanceSchema } = require('../validators/event.schema');

/**
 * `/events/:eventId/onsite` — the applicator panel. Any company user of the
 * organization can act as applicator; the service checks that the event
 * belongs to their organization.
 */
function createOnsiteApplicationRoutes(controller, authService) {
  const router = Router({ mergeParams: true });
  const companyOnly = checkPersistedRole(authService, 'company');

  router.get('/', companyOnly, validateQuery(onsiteRosterQuerySchema), controller.roster);
  router.post('/attendance', companyOnly, validateInput(attendanceSchema), controller.attendance);

  return router;
}

module.exports = { createOnsiteApplicationRoutes };
