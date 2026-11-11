const IUserRepository = require('../interfaces/IUserRepository');
const { db } = require('../../config/firebase');
const { stripUndefined } = require('../../utils/helpers');
const { AppError, ForbiddenError } = require('../../utils/errors');

/**
 * Firestore implementation of {@link IUserRepository}.
 *
 * User documents are keyed by the Firebase Auth `uid` (not an
 * auto-generated Firestore id), so this repo's `id` is always that uid —
 * it's what `verifyToken` puts on `req.user.uid` and what every other
 * document that references a user should store as `userId`.
 */
class FirestoreUserRepository extends IUserRepository {
  constructor() {
    super();
    this.collection = db.collection('users');
  }

  async findById(id) {
    const doc = await this.collection.doc(id).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : null;
  }

  async findByEmail(email) {
    const snapshot = await this.collection.where('email', '==', email).limit(1).get();
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() };
  }

  async findByOrganization(orgId) {
    const snapshot = await this.collection.where('orgId', '==', orgId).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }

  async findAll() {
    const snapshot = await this.collection.get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }

  /**
   * @param {object} data must include `uid` — used as the document id.
   */
  async create(data) {
    const { uid, ...rest } = data;
    if (!uid) throw new Error('FirestoreUserRepository.create requires data.uid');

    const payload = stripUndefined({ ...rest, createdAt: new Date() });
    await this.collection.doc(uid).set(payload);
    return { id: uid, ...payload };
  }

  async update(id, data) {
    const ref = this.collection.doc(id);
    const doc = await ref.get();
    if (!doc.exists) return null;

    const payload = stripUndefined(data);
    await ref.update(payload);
    return { id, ...doc.data(), ...payload };
  }

  async changeAccount(id, changes, expectedRevision) {
    const ref = this.collection.doc(id);
    return db.runTransaction(async (transaction) => {
      const doc = await transaction.get(ref);
      if (!doc.exists) return null;
      const current = doc.data();
      if (current.adminAccess === 'owner') throw new ForbiddenError('La cuenta propietaria está protegida.');
      if ((current.revision || 0) !== expectedRevision) throw new AppError('La cuenta cambió. Actualiza la lista antes de continuar.', 409);
      const payload = stripUndefined({ ...changes, revision: expectedRevision + 1, updatedAt: new Date().toISOString() });
      transaction.update(ref, payload);
      return { id, ...current, ...payload };
    });
  }

  async initializeOwner(uid, profile) {
    const security = db.collection('adminSecurity').doc('owner');
    const ref = this.collection.doc(uid);
    return db.runTransaction(async (transaction) => {
      const [owner, user] = await Promise.all([transaction.get(security), transaction.get(ref)]);
      if (owner.exists) throw new ForbiddenError('La cuenta propietaria ya fue configurada.');
      if (user.exists && (user.data().role !== 'admin' || ['deleted', 'deletion_pending'].includes(user.data().status))) throw new ForbiddenError('Esta identidad ya pertenece a una cuenta incompatible.');
      const saved = { ...profile, role: 'admin', adminAccess: 'owner', permissions: [], status: 'active', orgId: null, revision: 1, createdAt: new Date().toISOString() };
      transaction.create(security, { uid, createdAt: new Date().toISOString() });
      transaction.set(ref, saved);
      return { id: uid, ...saved };
    });
  }

  async getOwnerId() {
    const doc = await db.collection('adminSecurity').doc('owner').get();
    return doc.exists ? doc.data().uid : null;
  }
}

module.exports = FirestoreUserRepository;
