import {
  confirmPasswordReset as firebaseConfirmPasswordReset,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  sendPasswordResetEmail,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut,
  verifyPasswordResetCode as firebaseVerifyPasswordResetCode,
} from 'firebase/auth';
import { auth } from '../config/firebase.js';
import api from './api';

/**
 * Wraps Firebase Auth for the rest of the app.
 */

/**
 * Registers a new company and its first responsible user.
 *
 * Account creation happens on the backend (`POST /auth/register`, via the
 * Admin SDK) rather than client-side, so it can atomically create the
 * Firebase Auth user, organization, `company` role claim and Firestore
 * records in one place. Candidates only access evaluations by invitation.
 *
 * Once that succeeds, this briefly signs in to trigger Firebase's
 * verification email, then signs back out — registration lands the user
 * on the login screen, not straight into the app, matching the "revisa tu
 * correo" copy on the success screen.
 *
 * @param {object} data
 * @returns {Promise<object>} created user and organization
 */
export async function register(data) {
  const { data: response } = await api.post('/auth/register', data);

  try {
    const credential = await signInWithEmailAndPassword(auth, data.email, data.password);
    await sendEmailVerification(credential.user);
    await signOut(auth);
  } catch (error) {
    // Non-fatal: the account was created either way. The user can still
    // log in and request a new verification email later.
    console.error('No se pudo enviar el correo de verificación:', error);
  }

  return response?.data ?? response;
}

/**
 * Creates a client account from the admin dashboard.
 *
 * @param {{ companyName: string, displayName: string, email: string, password: string, phone?: string }} data
 * @returns {Promise<object>}
 */
export async function createCompanyUser(data) {
  const { data: result } = await api.post('/auth/company-users', data);
  return result?.data ?? result;
}

/**
 * Fetches all companies and their company users for the admin dashboard.
 *
 * @returns {Promise<object[]>}
 */
export async function getCompanies() {
  const { data } = await api.get('/auth/companies');
  return data?.data ?? [];
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
 * Sends Firebase's password recovery email. The current origin keeps this
 * valid in development and production without hardcoding an environment.
 *
 * @param {string} email
 * @returns {Promise<void>}
 */
export async function requestPasswordReset(email) {
  await sendPasswordResetEmail(auth, email, {
    url: window.location.origin + '/reset-password',
  });
}

/** @param {string} oobCode @returns {Promise<string>} */
export function verifyPasswordResetCode(oobCode) {
  return firebaseVerifyPasswordResetCode(auth, oobCode);
}

/**
 * @param {string} oobCode
 * @param {string} newPassword
 * @returns {Promise<void>}
 */
export function confirmPasswordReset(oobCode, newPassword) {
  return firebaseConfirmPasswordReset(auth, oobCode, newPassword);
}

/**
 * Fetches the current user's persisted profile from the backend. This is the
 * source of truth for the UI role, because Firestore/user docs can be updated
 * independently of the ID token claim cache.
 *
 * @returns {Promise<object|null>}
 */
export async function getProfile() {
  const { data } = await api.get('/auth/me');
  return data?.data ?? null;
}

/**
 * @returns {Promise<void>}
 */
export async function logout() {
  await signOut(auth);

  document.cookie.split(';').forEach((cookie) => {
    const name = cookie.split('=')[0].trim();
    if (name) document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
  });

  Object.keys(localStorage).forEach((key) => {
    if (key.startsWith('firebase:')) localStorage.removeItem(key);
  });
  sessionStorage.clear();
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
