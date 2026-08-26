/**
 * Small, pure utility helpers shared across services/controllers.
 */

/**
 * Generates a simple unique id. Placeholder for repos/tests that need an
 * id before persisting to Firestore (which normally generates its own).
 *
 * @returns {string}
 */
function generateId() {
  // TODO: replace with a proper id strategy if needed (uuid, nanoid, etc.)
  return `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

/**
 * Removes `undefined` values from an object (Firestore rejects `undefined`
 * field values).
 *
 * @param {Record<string, unknown>} obj
 * @returns {Record<string, unknown>}
 */
function stripUndefined(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

module.exports = { generateId, stripUndefined };
