const express = require('express');
const cors = require('cors');

const { createContainer } = require('./container');
const createApiRouter = require('./routes');
const AuthController = require('./controllers/auth.controller');
const InvitationController = require('./controllers/invitation.controller');
const { createPublicAuthRoutes } = require('./routes/auth.routes');
const { createPublicInvitationRoutes } = require('./routes/invitation.routes');
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
  app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});


  // Frontend (Firebase Hosting) and backend (Render) are different origins.
  // CORS_ORIGIN restricts requests to that domain in production; unset, it
  // falls back to allowing any origin (fine — auth is a Bearer token, not
  // cookies, so a permissive default carries no CSRF-style risk).
  app.use(cors(process.env.CORS_ORIGIN ? { origin: process.env.CORS_ORIGIN } : undefined));
  app.use(express.json());

  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  // Public: account creation happens before the caller has a token to
  // verify, so this can't sit behind verifyToken like everything else.
  const authController = new AuthController(container.authService);
  const invitationController = new InvitationController(container.invitationService);
  app.use('/api/v1/auth', createPublicAuthRoutes(authController));
  app.use('/api/v1/invitations', createPublicInvitationRoutes(invitationController));

  app.use('/api/v1', verifyToken, checkTenant, createApiRouter(container));

  // Must be mounted last.
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
