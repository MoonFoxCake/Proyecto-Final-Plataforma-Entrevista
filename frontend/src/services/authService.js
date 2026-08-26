import api from './api';

/**
 * Wraps Firebase Auth for the rest of the app.
 */

/**
 * Registers a new user: creates the Firebase Auth account and, via the
 * backend, the corresponding Firestore user document.
 *
 * @param {{ email: string, password: string, displayName: string }} data
 * @returns {Promise<object>}
 */
export async function register(data) {
  // TODO: implement Firebase createUserWithEmailAndPassword, then call
  // the backend so it creates the Firestore user document, e.g.
  // const { data: user } = await api.post('/auth/register', data);
  // return user;
  throw new Error('Not implemented');
}

/**
 * @param {string} email
 * @param {string} password
 * @returns {Promise<object>}
 */
export async function login(email, password) {
  // TODO: implement Firebase signInWithEmailAndPassword
  throw new Error('Not implemented');
}

/**
 * @returns {Promise<void>}
 */
export async function logout() {
  // TODO: implement Firebase signOut
  throw new Error('Not implemented');
}

/**
 * @returns {object|null}
 */
export function getCurrentUser() {
  // TODO: return the current Firebase user
  throw new Error('Not implemented');
}

/**
 * Subscribes to Firebase Auth state changes.
 *
 * @param {(user: object|null) => void} callback
 * @returns {() => void} unsubscribe function
 */
export function onAuthStateChanged(callback) {
  // TODO: implement Firebase onAuthStateChanged subscription
  throw new Error('Not implemented');
}
