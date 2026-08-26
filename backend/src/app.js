const express = require('express');
const cors = require('cors');

const { createContainer } = require('./container');
const createApiRouter = require('./routes');
const AuthController = require('./controllers/auth.controller');
const { createPublicAuthRoutes } = require('./routes/auth.routes');
const { verifyToken } = require('./middleware/verifyToken');
const { checkTenant } = require('./middleware/checkTenant');
const { errorHandler } = require('./middleware/errorHandler');

/**
 * Builds the Express application.
 *
 * @param {ReturnType<typeof createContainer>} [container] injected for
 *   tests (e.g. a `memory` container); defaults to the Firestore-backed
 *   container for production.
 * @returns {import('express').Express}
 */
function createApp(container = createContainer('firestore')) {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  // Public: account creation happens before the caller has a token to
  // verify, so this can't sit behind verifyToken like everything else.
  const authController = new AuthController(container.authService);
  app.use('/api/v1/auth', createPublicAuthRoutes(authController));

  app.use('/api/v1', verifyToken, checkTenant, createApiRouter(container));

  // Must be mounted last.
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
