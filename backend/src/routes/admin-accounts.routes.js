const { Router } = require('express');
const { checkPersistedRole } = require('../middleware/checkPersistedRole');
function createAdminAccountRoutes(service, authService) {
  const router = Router();
  router.use(checkPersistedRole(authService, 'admin'));
  const handle = (fn) => async (req, res, next) => { try { res.set('Cache-Control', 'no-store'); res.json({ data: await fn(req) }); } catch (error) { next(error); } };
  router.get('/accounts', handle((req) => service.listAdmins(req.user.uid)));
  router.post('/accounts', handle((req) => service.create(req.user.uid, req.body)));
  router.put('/accounts/:id', handle((req) => service.update(req.user.uid, req.params.id, req.body)));
  router.patch('/accounts/:id/status', handle((req) => service.setStatus(req.user.uid, req.params.id, req.body)));
  router.post('/accounts/:id/password', handle((req) => service.resetPassword(req.user.uid, req.params.id, req.body)));
  router.get('/users', handle((req) => service.listUsers(req.user.uid)));
  router.delete('/accounts/:id', handle((req) => service.delete(req.user.uid, req.params.id, req.body)));
  router.delete('/users/:id', handle((req) => service.delete(req.user.uid, req.params.id, req.body)));
  return router;
}
module.exports = { createAdminAccountRoutes };
