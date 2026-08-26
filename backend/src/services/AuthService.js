/**
 * Handles user registration and role assignment (Firebase Custom Claims).
 */
class AuthService {
  /** @param {import('../repositories/interfaces/IUserRepository')} userRepo */
  constructor(userRepo) {
    this.userRepo = userRepo;
  }

  /**
   * Registers a new user (creates the Firebase Auth account and the
   * corresponding Firestore user document).
   *
   * @param {{ email: string, password: string, displayName: string }} data
   * @returns {Promise<object>}
   */
  async registerUser(data) {
    // TODO: implement business logic
    throw new Error('Not implemented');
  }

  /**
   * Assigns a role (and optionally an organization) to a user via
   * Firebase Custom Claims.
   *
   * @param {string} uid
   * @param {string} role
   * @param {string} [orgId]
   * @returns {Promise<object>}
   */
  async assignRole(uid, role, orgId) {
    // TODO: implement business logic
    throw new Error('Not implemented');
  }
}

module.exports = AuthService;
