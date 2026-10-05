const IMacrocaseRepository = require('../interfaces/IMacrocaseRepository');
const { db } = require('../../config/firebase');
const { stripUndefined } = require('../../utils/helpers');

function serializeMacrocase(doc) {
  const data = doc.data();

  return {
    id: doc.id,
    ...data,
    createdAt: data.createdAt?.toDate?.() ?? data.createdAt,
    updatedAt: data.updatedAt?.toDate?.() ?? data.updatedAt,
  };
}

class FirestoreMacrocaseRepository extends IMacrocaseRepository {
  constructor() {
    super();
    this.collection = db.collection('macroCases');
  }

  async findAll() {
    const snapshot = await this.collection.get();

    return snapshot.docs.map((doc) => serializeMacrocase(doc));
  }

  async findById(id) {
    const doc = await this.collection.doc(id).get();

    if (!doc.exists) {
      return null;
    }

    return serializeMacrocase(doc);
  }

  async create(data) {
    const now = new Date();

    const payload = stripUndefined({
      ...data,
      createdAt: now,
      updatedAt: now,
    });

    const ref = await this.collection.add(payload);

    return {
      id: ref.id,
      ...payload,
    };
  }

  async update(id, data) {
    const existing = await this.findById(id);

    if (!existing) {
      return null;
    }

    const payload = stripUndefined({
      ...data,
      updatedAt: new Date(),
    });

    await this.collection.doc(id).update(payload);

    return {
      ...existing,
      ...payload,
    };
  }

  async delete(id) {
    const existing = await this.findById(id);

    if (!existing) {
      return null;
    }

    await this.collection.doc(id).delete();

    return existing;
  }
}

module.exports = FirestoreMacrocaseRepository;