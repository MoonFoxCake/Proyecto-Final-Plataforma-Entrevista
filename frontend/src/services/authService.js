import {
  onAuthStateChanged as firebaseOnAuthStateChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { auth } from '../config/firebase.js';
import api from './api';

/**
 * Wraps Firebase Auth for the rest of the app.
 */

/**
 * Registers a new candidate.
 *
 * Account creation happens on the backend (`POST /auth/register`, via the
 * Admin SDK) rather than client-side, so it can atomically create the
 * Firebase Auth user, tag it with the `candidate` role (custom claims),
 * and create the Firestore user document in one place.
 *
 * Once that succeeds, this briefly signs in to trigger Firebase's
 * verification email, then signs back out — registration lands the user
 * on the login screen, not straight into the app, matching the "revisa tu
 * correo" copy on the success screen.
 *
 * @param {{ email: string, password: string, displayName: string, phone?: string, city?: string, country?: string, academicLevel?: string, professionalArea?: string }} data
 * @returns {Promise<object>} the created user record
 */
export async function register(data) {
  const { data: user } = await api.post('/auth/register', data);

  try {
    const credential = await signInWithEmailAndPassword(auth, data.email, data.password);
    await sendEmailVerification(credential.user);
    await signOut(auth);
  } catch (error) {
    // Non-fatal: the account was created either way. The user can still
    // log in and request a new verification email later.
    console.error('No se pudo enviar el correo de verificación:', error);
  }

  return user;
}

/**
 * @param {string} email
 * @param {string} password
 * @returns {Promise<import('firebase/auth').User>}
 */
export async function login(email, password) {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

/**
 * @returns {Promise<void>}
 */
export async function logout() {
  await signOut(auth);
}

/**
 * @returns {import('firebase/auth').User|null}
 */
export function getCurrentUser() {
  return auth.currentUser;
}

/**
 * Subscribes to Firebase Auth state changes.
 *
 * @param {(user: import('firebase/auth').User|null) => void} callback
 * @returns {() => void} unsubscribe function
 */
export function onAuthStateChanged(callback) {
  return firebaseOnAuthStateChanged(auth, callback);
}
