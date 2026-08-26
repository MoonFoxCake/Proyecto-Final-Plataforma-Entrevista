require('dotenv').config();

const functions = require('firebase-functions');
const createApp = require('./app');

const app = createApp();

/**
 * Dual entry point:
 *  - As a Cloud Function, this module exports `api`, wrapping the Express
 *    app with `functions.https.onRequest`.
 *  - For local development (`npm run dev` / `npm start`, i.e. this file
 *    run directly with `node`), it also starts a plain HTTP listener.
 */
exports.api = functions.https.onRequest(app);

if (require.main === module) {
  const { loadEnv } = require('./config/env');
  const env = loadEnv();
  const port = Number(env.PORT) || 3000;

  app.listen(port, () => {
    console.log(`Nexo Perfil API listening on http://localhost:${port}`);
  });
}
