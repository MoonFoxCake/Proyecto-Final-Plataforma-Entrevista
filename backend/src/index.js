require('dotenv').config();

const createApp = require('./app');
const { loadEnv } = require('./config/env');

/**
 * Local/production entry point. Deployed on Render as a plain Node web
 * service (`npm start` → this file), not as a Firebase Cloud Function —
 * that path required the Blaze billing plan, which this project doesn't
 * use. Firebase Auth and Firestore stay on the (free) Spark plan; only
 * where this Express app *runs* changed.
 */
const env = loadEnv();
const app = createApp();
const port = Number(env.PORT) || 3000;

app.listen(port, () => {
  console.log(`Nexo Perfil API listening on http://localhost:${port}`);
});
