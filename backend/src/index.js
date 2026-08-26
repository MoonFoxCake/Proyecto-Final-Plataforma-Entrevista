const functions = require('firebase-functions');
const createApp = require('./app');

const app = createApp();

/**
 * Dual entry point:
 *  - As a Cloud Function, this module exports `api`, wrapping the Express
 *    app with `functions.https.onRequest`.
 *  - For local development, uncomment the `app.listen(...)` block below
 *    and run `npm run dev`.
 */
exports.api = functions.https.onRequest(app);

// Local development server (comment back in for `npm run dev` / `npm start`):
// const { loadEnv } = require('./config/env');
// const env = loadEnv();
// const port = env.PORT || 3000;
// app.listen(port, () => {
//   console.log(`Nexo Perfil API listening on http://localhost:${port}`);
// });
