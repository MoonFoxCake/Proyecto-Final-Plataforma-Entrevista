const { Router } = require('express');
const multer = require('multer');
const { checkPersistedRole } = require('../middleware/checkPersistedRole');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const allowed = [
      'audio/mpeg',
      'audio/wav',
      'audio/ogg',
      'audio/webm',
    ];

    if (!allowed.includes(file.mimetype)) {
      return cb(
        new Error(
          'Formato de audio no permitido. Usa MP3, WAV, OGG o WEBM.'
        )
      );
    }

    cb(null, true);
  },
});

function createMacrocaseRoutes(macrocaseController, authService) {
  const router = Router();

  const adminOnly = checkPersistedRole(authService, 'admin');

  router.get('/', adminOnly, macrocaseController.list);

  router.get(
    '/:macrocaseId',
    adminOnly,
    macrocaseController.get
  );

  router.post(
    '/',
    adminOnly,
    macrocaseController.create
  );

  router.put(
    '/:macrocaseId',
    adminOnly,
    macrocaseController.update
  );

  router.post(
    '/:macrocaseId/activate',
    adminOnly,
    macrocaseController.activate
  );

  router.post(
    '/:macrocaseId/deactivate',
    adminOnly,
    macrocaseController.deactivate
  );

  router.post(
    '/:macrocaseId/audio',
    adminOnly,
    upload.single('audio'),
    macrocaseController.uploadAudio
  );

  router.delete(
    '/:macrocaseId',
    adminOnly,
    macrocaseController.delete
  );

  return router;
}

module.exports = { createMacrocaseRoutes };