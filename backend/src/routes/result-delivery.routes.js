const { adminPermission } = require('../middleware/adminPermission');
const { Router } = require('express');
const multer = require('multer');
const { checkPersistedRole } = require('../middleware/checkPersistedRole');
const { validateParams } = require('../middleware/validateParams');
const { phaseParamSchema } = require('../validators/event.schema');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 }, fileFilter: (req, file, cb) => file.mimetype === 'application/pdf' ? cb(null, true) : cb(new Error('Solo se permiten archivos PDF.')) });
function createResultDeliveryRoutes(controller, authService) {
  const router = Router();
  router.use(checkPersistedRole(authService, 'admin'));
  router.get('/pending', adminPermission('results.view', 'results.deliver'), controller.list);
  router.get('/:eventId/:module/download', adminPermission('results.view', 'results.deliver'), validateParams(phaseParamSchema), controller.download);
  router.post('/:eventId/:module', adminPermission('results.deliver'), upload.single('pdf'), controller.deliver);
  return router;
}
module.exports = { createResultDeliveryRoutes };
