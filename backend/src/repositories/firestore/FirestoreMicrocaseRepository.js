const { db } = require('../../config/firebase');
const { stripUndefined } = require('../../utils/helpers');

class FirestoreMicrocaseRepository {
  constructor() { this.collection = db.collection('microCases'); }
  async findAll() {
    const snap = await this.collection.get();
    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }
  async findById(id) {
    const doc = await this.collection.doc(id).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : null;
  }
  async create(data) {
    const now = new Date();
    const payload = stripUndefined({ ...data, createdAt: now, updatedAt: now });
    const ref = await this.collection.add(payload);
    return { id: ref.id, ...payload };
  }
  async update(id, data) {
    const ref = this.collection.doc(id);
    const doc = await ref.get();
    if (!doc.exists) return null;
    const payload = stripUndefined({ ...data, updatedAt: new Date() });
    await ref.update(payload);
    return { id, ...doc.data(), ...payload };
  }
  async delete(id) {
    const existing = await this.findById(id);
    if (existing) await this.collection.doc(id).delete();
    return existing;
  }
}
module.exports = FirestoreMicrocaseRepository;
