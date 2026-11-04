import api from './api';

const CLIENT_KEY = 'nexo.onsite.client';
const SESSION_KEY = 'nexo.onsite.session';

// Browser storage can be unavailable (private mode, blocked site data):
// every access is guarded and the page works without it.
function read(storage, key) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function write(storage, key, value) {
  try {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, value);
  } catch {
    // Not persisted: only resuming after a reload is lost.
  }
}

let memoryClientId = null;

/**
 * Random id of this computer's browser, so the backend can limit failed
 * attempts per computer even when the whole room shares one IP.
 */
function clientId() {
  let id = read(window.localStorage, CLIENT_KEY) || memoryClientId;
  if (!id) {
    id = globalThis.crypto?.randomUUID?.() ?? `c-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    write(window.localStorage, CLIENT_KEY, id);
  }
  memoryClientId = id;
  return id;
}

/**
 * Exchanges the code printed on the card for an evaluation session.
 * Resolves with `{ state, … }` for every outcome, including too many
 * attempts (HTTP 429).
 */
export async function loginWithCode(codigo) {
  try {
    const { data } = await api.post('/onsite/access', { codigo }, { headers: { 'X-Onsite-Client': clientId() } });
    return data?.data ?? { state: 'INVALID' };
  } catch (error) {
    if (error.response?.status === 429 && error.response.data?.data) return error.response.data.data;
    throw error;
  }
}

/**
 * The session token lives only in this tab (sessionStorage), never in the
 * URL, so a reload resumes the evaluation and closing the tab forgets it.
 */
export const savedSession = () => read(window.sessionStorage, SESSION_KEY);
export const saveSession = (token) => write(window.sessionStorage, SESSION_KEY, token);
export const clearSession = () => write(window.sessionStorage, SESSION_KEY, null);
