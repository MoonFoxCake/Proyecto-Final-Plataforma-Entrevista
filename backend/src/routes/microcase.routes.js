const { Router } = require('express');
const { checkPersistedRole } = require('../middleware/checkPersistedRole');
function createMicrocaseRoutes(controller, authService) {
  const router = Router();
  const admin = checkPersistedRole(authService, 'admin');
  router.get('/available', checkPersistedRole(authService, 'company'), controller.listActive);
  router.use(admin);
  router.get('/', controller.list);
  router.post('/', controller.create);
  router.get('/:id', controller.get);
  router.put('/:id', controller.update);
  router.post('/:id/activate', controller.activate);
  router.post('/:id/deactivate', controller.deactivate);
  router.post('/:id/preview', controller.preview);
  router.delete('/:id', controller.delete);
  return router;
}
module.exports = { createMicrocaseRoutes };
