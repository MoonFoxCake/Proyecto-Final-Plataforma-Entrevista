const { auth } = require('../config/firebase');
const { ROLES } = require('../utils/constants');
const { ValidationError, NotFoundError } = require('../utils/errors');

/**
 * Handles user registration and role assignment (Firebase Custom Claims).
 */
class AuthService {
  /** @param {import('../repositories/interfaces/IUserRepository')} userRepo */
  constructor(userRepo) {
    this.userRepo = userRepo;
  }

  /**
   * Registers a new candidate: creates the Firebase Auth account, tags it
   * with the `candidate` role via custom claims, and creates the matching
   * Firestore user document.
   *
   * This endpoint is public (called before the caller has any token), so
   * it's the one place that creates the Auth account itself — everywhere
   * else, `req.user` already comes from a verified token.
   *
   * @param {{ email: string, password: string, displayName: string, phone?: string, city?: string, country?: string, academicLevel?: string, professionalArea?: string }} data
   * @returns {Promise<object>}
   */
  async registerUser(data) {
    const { email, password, displayName, ...profile } = data;

    let userRecord;
    try {
      userRecord = await auth.createUser({ email, password, displayName });
    } catch (error) {
      if (error.code === 'auth/email-already-exists') {
        throw new ValidationError('Ese correo ya está registrado.');
      }
      if (error.code === 'auth/invalid-password') {
        throw new ValidationError('La contraseña no cumple los requisitos mínimos.');
      }
      throw error;
    }

    try {
      await auth.setCustomUserClaims(userRecord.uid, { role: ROLES.CANDIDATE });

      return await this.userRepo.create({
        uid: userRecord.uid,
        email,
        displayName,
        role: ROLES.CANDIDATE,
        orgId: null,
        ...profile,
      });
    } catch (error) {
      // Don't leave an orphaned Auth account behind if the claims/Firestore
      // step fails after the account was already created.
      await auth.deleteUser(userRecord.uid).catch(() => {});
      throw error;
    }
  }

  /**
   * Assigns a role (and optionally an organization) to a user via
   * Firebase Custom Claims, and mirrors it onto the Firestore user doc.
   *
   * @param {string} uid
   * @param {string} role
   * @param {string} [orgId]
   * @returns {Promise<object>}
   */
  async assignRole(uid, role, orgId) {
    const user = await this.userRepo.findById(uid);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    await auth.setCustomUserClaims(uid, { role, orgId: orgId ?? null });
    return this.userRepo.update(uid, { role, orgId: orgId ?? null });
  }
}

module.exports = AuthService;
