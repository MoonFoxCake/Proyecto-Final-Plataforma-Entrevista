const { Router } = require('express');
const { adminPermission } = require('../middleware/adminPermission');
const { checkPersistedRole } = require('../middleware/checkPersistedRole');

function createSettingsRoutes(settingsService, authService) {
  const router = Router();
  router.use(checkPersistedRole(authService, 'admin'), adminPermission('settings.manage'));
  router.get('/', async (req, res, next) => {
    try { res.json({ data: await settingsService.get() }); } catch (error) { next(error); }
  });
  router.put('/', async (req, res, next) => {
    try { res.json({ data: await settingsService.update(req.body, req.user.uid) }); } catch (error) { next(error); }
  });
  return router;
}

module.exports = { createSettingsRoutes };
