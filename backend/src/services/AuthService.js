const { auth } = require('../config/firebase');
const { ROLES } = require('../utils/constants');
const { ValidationError, NotFoundError } = require('../utils/errors');

/**
 * Handles user registration and role assignment (Firebase Custom Claims).
 */
class AuthService {
  /**
   * @param {import('../repositories/interfaces/IUserRepository')} userRepo
   * @param {import('../repositories/interfaces/IOrganizationRepository')} [organizationRepo]
   */
  constructor(userRepo, organizationRepo) {
    this.userRepo = userRepo;
    this.organizationRepo = organizationRepo;
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
  * Creates an organization and its first company user from the admin panel.
   *
   * @param {{ companyName: string, displayName: string, email: string, password: string, phone?: string }} data
   * @returns {Promise<object>}
   */
  async createCompanyUser(data) {
    const { companyName, email, password, displayName, phone } = data;
    const normalizedCompanyName = companyName.trim().toLowerCase();

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
      let organization = this.organizationRepo
        ? await this.organizationRepo.findByCompanyName(normalizedCompanyName)
        : null;

      if (!organization && this.organizationRepo) {
        organization = await this.organizationRepo.create({
          companyName: normalizedCompanyName,
          name: normalizedCompanyName,
          email,
        });
      }

      const orgId = organization?.id ?? null;
      const persistedCompanyName = organization?.companyName ?? organization?.name ?? normalizedCompanyName;

      await auth.setCustomUserClaims(userRecord.uid, { role: ROLES.COMPANY, orgId });

      const user = await this.userRepo.create({
        uid: userRecord.uid,
        email,
        displayName,
        phone,
        companyName: persistedCompanyName,
        role: ROLES.COMPANY,
        orgId,
      });

      return { user, organization };
    } catch (error) {
      await auth.deleteUser(userRecord.uid).catch(() => {});
      throw error;
    }
  }

  /**
   * Creates a candidate under the authenticated company's organization.
   *
   * @param {{ email: string, password: string, displayName: string, phone?: string, city?: string, country?: string, academicLevel?: string, professionalArea?: string }} data
   * @param {string} orgId
   * @returns {Promise<object>}
   */
  async createCandidateUser(data, orgId) {
    const { email, password, displayName, ...profile } = data;
    const organization = await this.organizationRepo.findById(orgId);
    if (!organization) throw new NotFoundError('Organization not found');

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
      await auth.setCustomUserClaims(userRecord.uid, { role: ROLES.CANDIDATE, orgId });

      return await this.userRepo.create({
        uid: userRecord.uid,
        email,
        displayName,
        role: ROLES.CANDIDATE,
        orgId,
        companyName: organization.companyName ?? organization.name,
        ...profile,
      });
    } catch (error) {
      await auth.deleteUser(userRecord.uid).catch(() => {});
      throw error;
    }
  }

  /**
   * Reads the persisted user profile for a uid. This is the source of truth
   * for UI role routing, because the Firebase token claim can be stale until
   * a fresh ID token is issued.
   *
   * @param {string} uid
   * @returns {Promise<object>}
   */
  async getProfile(uid) {
    const user = await this.userRepo.findById(uid);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    return user;
  }

  /**
   * Lists every company organization with its company users for the admin
   * dashboard.
   *
   * @returns {Promise<object[]>}
   */
  async listCompaniesWithUsers() {
    const organizations = await this.organizationRepo.findAll();
    const users = await this.userRepo.findAll();

    return organizations.map((organization) => ({
      ...organization,
      users: users.filter((user) => user.orgId === organization.id && user.role === ROLES.COMPANY),
    }));
  }

  /** @param {string} orgId @returns {Promise<object[]>} */
  async listCandidates(orgId) {
    const users = await this.userRepo.findByOrganization(orgId);
    return users.filter((user) => user.role === ROLES.CANDIDATE);
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
