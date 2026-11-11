const { adminPermission } = require('../middleware/adminPermission');
const { Router } = require('express');
const { checkPersistedRole } = require('../middleware/checkPersistedRole');
function createQuestionBankRoutes(service, authService) {
  const router = Router();
  router.use(checkPersistedRole(authService, 'admin'), adminPermission('questions.manage'));
  const handle = (fn) => async (req, res, next) => { try { res.json({ data: await fn(req) }); } catch (error) { next(error); } };
  router.get('/', handle(() => service.list()));
  router.post('/', handle((req) => service.create(req.body)));
  router.get('/:id/versions', handle((req) => service.history(req.params.id)));
  router.put('/:id', handle((req) => service.update(req.params.id, req.body)));
  router.patch('/:id/status', handle((req) => service.setActive(req.params.id, req.body)));
  return router;
}
module.exports = { createQuestionBankRoutes };
