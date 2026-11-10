const { db } = require('../../config/firebase');
const { AppError, NotFoundError } = require('../../utils/errors');
class FirestoreQuestionGroupRepository {
  constructor() { this.collection = db.collection('moduleAQuestionGroups'); }
  async ensureInitial(data) {
    const ref = this.collection.doc('initial-a');
    if ((await ref.get()).exists) return;
    await db.runTransaction(async (transaction) => {
      if ((await transaction.get(ref)).exists) return;
      const now = new Date().toISOString();
      const group = { ...data, id: ref.id, version: 1, createdAt: now, updatedAt: now };
      transaction.create(ref, group);
      transaction.create(ref.collection('versions').doc('1'), group);
    });
  }
  async findAll() { return (await this.collection.get()).docs.map((doc) => ({ ...doc.data(), id: doc.id })); }
  async findById(id) { const doc = await this.collection.doc(id).get(); return doc.exists ? { ...doc.data(), id: doc.id } : null; }
  async history(id) { return (await this.collection.doc(id).collection('versions').get()).docs.map((doc) => doc.data()); }
  async create(data) {
    const ref = this.collection.doc();
    const now = new Date().toISOString();
    const group = { ...data, id: ref.id, version: 1, createdAt: now, updatedAt: now };
    const batch = db.batch();
    batch.create(ref, group); batch.create(ref.collection('versions').doc('1'), group);
    await batch.commit(); return group;
  }
  async change(id, baseVersion, build, revision) {
    const ref = this.collection.doc(id);
    return db.runTransaction(async (transaction) => {
      const doc = await transaction.get(ref);
      if (!doc.exists) throw new NotFoundError('Grupo no encontrado.');
      const previous = doc.data();
      if (previous.version !== baseVersion) throw new AppError('El grupo cambió. Carga la versión actual antes de guardar.', 409);
      const group = { ...previous, ...build(previous), id, updatedAt: new Date().toISOString() };
      transaction.set(ref, group);
      if (revision) transaction.create(ref.collection('versions').doc(String(group.version)), group);
      return group;
    });
  }
  async revise(id, data, baseVersion) { return this.change(id, baseVersion, (old) => ({ ...data, version: old.version + 1 }), true); }
  async setActive(id, active, baseVersion) { return this.change(id, baseVersion, () => ({ active }), false); }
}
module.exports = FirestoreQuestionGroupRepository;
