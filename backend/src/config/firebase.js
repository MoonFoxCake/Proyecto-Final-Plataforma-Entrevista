const admin = require('firebase-admin');
const { loadEnv } = require('./env');

/**
 * Firebase Admin SDK initialization.
 *
 * Credentials come from environment variables (service account), never
 * hardcoded. This module is the single place the rest of the backend
 * imports `db` / `auth` from.
 *
 * `loadEnv()` runs here, at import time, so a missing/malformed env var
 * fails the process immediately on startup instead of inside a request.
 */
if (!admin.apps.length) {
  const env = loadEnv();

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: env.FIREBASE_PROJECT_ID,
      // The .env file stores literal "\n" escape sequences (env files can't
      // hold real newlines); Firestore/Auth need the actual PEM format back.
      privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
    }),
  });
}

const db = admin.firestore();
const auth = admin.auth();

module.exports = { admin, db, auth };
