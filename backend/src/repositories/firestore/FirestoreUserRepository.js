const IUserRepository = require('../interfaces/IUserRepository');
const { db } = require('../../config/firebase');
const { stripUndefined } = require('../../utils/helpers');

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
}

module.exports = FirestoreUserRepository;
