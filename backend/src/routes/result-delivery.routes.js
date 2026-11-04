const { Router } = require('express');
const multer = require('multer');
const { checkPersistedRole } = require('../middleware/checkPersistedRole');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 }, fileFilter: (req, file, cb) => file.mimetype === 'application/pdf' ? cb(null, true) : cb(new Error('Solo se permiten archivos PDF.')) });
function createResultDeliveryRoutes(controller, authService) {
  const router = Router();
  router.use(checkPersistedRole(authService, 'admin'));
  router.get('/pending', controller.list);
  router.post('/:eventId/:module', upload.single('pdf'), controller.deliver);
  return router;
}
module.exports = { createResultDeliveryRoutes };
