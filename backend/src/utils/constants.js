/**
 * Application-wide constants, frozen to prevent accidental mutation.
 */

const ROLES = Object.freeze({
  ADMIN: 'admin',
  CLIENT: 'client',
  CANDIDATE: 'candidate',
});

module.exports = { ROLES };
