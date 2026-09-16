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

  async findByCompanyName(companyName) {
    const companyNameSnapshot = await this.collection.where('companyName', '==', companyName).limit(1).get();
    const snapshot = companyNameSnapshot.empty
      ? await this.collection.where('name', '==', companyName).limit(1).get()
      : companyNameSnapshot;
    if (!snapshot.empty) {
      const doc = snapshot.docs[0];
      return { id: doc.id, ...doc.data() };
    }

    const allOrganizations = await this.collection.get();
    const matchingDoc = allOrganizations.docs.find((doc) => {
      const data = doc.data();
      return [data.companyName, data.name].some(
        (name) => typeof name === 'string' && name.trim().toLowerCase() === companyName
      );
    });

    return matchingDoc ? { id: matchingDoc.id, ...matchingDoc.data() } : null;
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

  async delete(id) {
    const ref = this.collection.doc(id);
    const doc = await ref.get();
    if (!doc.exists) return false;
    await ref.delete();
    return true;
  }
}

module.exports = FirestoreOrganizationRepository;
