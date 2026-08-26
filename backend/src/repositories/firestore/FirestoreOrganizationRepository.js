const IOrganizationRepository = require('../interfaces/IOrganizationRepository');
const { db } = require('../../config/firebase');
const { stripUndefined } = require('../../utils/helpers');

/**
 * Firestore implementation of {@link IOrganizationRepository}.
 */
class FirestoreOrganizationRepository extends IOrganizationRepository {
  constructor() {
    super();
    this.collection = db.collection('organizations');
  }

  async findById(id) {
    const doc = await this.collection.doc(id).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : null;
  }

  async findAll() {
    const snapshot = await this.collection.get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }

  async create(data) {
    const payload = stripUndefined({ ...data, createdAt: new Date() });
    const ref = await this.collection.add(payload);
    return { id: ref.id, ...payload };
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

module.exports = FirestoreOrganizationRepository;
