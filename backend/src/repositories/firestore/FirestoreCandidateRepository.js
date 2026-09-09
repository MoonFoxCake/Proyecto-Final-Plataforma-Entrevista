const ICandidateRepository = require('../interfaces/ICandidateRepository');
const { db } = require('../../config/firebase');
const { stripUndefined } = require('../../utils/helpers');

function serializeCandidate(doc) {
  const data = doc.data();
  return {
    id: doc.id,
    ...data,
    fechaHoraCita: data.fechaHoraCita?.toDate?.() ?? data.fechaHoraCita,
    createdAt: data.createdAt?.toDate?.() ?? data.createdAt,
    submittedAt: data.submittedAt?.toDate?.() ?? data.submittedAt,
  };
}

class FirestoreCandidateRepository extends ICandidateRepository {
  constructor() {
    super();
    this.collection = db.collection('candidates');
  }

  async findById(id) {
    const doc = await this.collection.doc(id).get();
    return doc.exists ? serializeCandidate(doc) : null;
  }

  async findByEvent(eventId, orgId) {
    const snapshot = await this.collection.where('eventId', '==', eventId).get();
    return snapshot.docs
      .map(serializeCandidate)
      .filter((candidate) => candidate.orgId === orgId)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  }

  async findByCedulaAndEvent(eventId, cedula) {
    const snapshot = await this.collection.where('eventId', '==', eventId).get();
    const doc = snapshot.docs.find((item) => item.data().cedula === cedula);
    return doc ? serializeCandidate(doc) : null;
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

module.exports = FirestoreCandidateRepository;
