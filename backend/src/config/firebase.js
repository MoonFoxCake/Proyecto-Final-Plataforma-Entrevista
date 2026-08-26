const admin = require('firebase-admin');

/**
 * Firebase Admin SDK initialization.
 *
 * Credentials come from environment variables (service account), never
 * hardcoded. This module is the single place the rest of the backend
 * imports `db` / `auth` from.
 *
 * TODO: build the credential cert from FIREBASE_PROJECT_ID,
 * FIREBASE_PRIVATE_KEY and FIREBASE_CLIENT_EMAIL and call
 * admin.initializeApp(). Remember FIREBASE_PRIVATE_KEY needs its
 * escaped "\n" sequences converted back to real newlines.
 */
if (!admin.apps.length) {
  // TODO: implement admin.initializeApp({ credential: admin.credential.cert({...}) })
}

const db = admin.apps.length ? admin.firestore() : null;
const auth = admin.apps.length ? admin.auth() : null;

module.exports = { admin, db, auth };
