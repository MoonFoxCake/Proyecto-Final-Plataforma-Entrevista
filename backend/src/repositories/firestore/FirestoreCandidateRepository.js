const ICandidateRepository = require('../interfaces/ICandidateRepository');
const { db } = require('../../config/firebase');
const { stripUndefined } = require('../../utils/helpers');

/**
 * Converts the Timestamp fields of a nested object to Dates. Only keys that
 * exist are touched: these objects are written back as they are, and
 * Firestore rejects nested `undefined` values.
 */
function withDates(object, keys) {
  if (!object) return object;
  const result = { ...object };
  for (const key of keys) {
    if (result[key]?.toDate) result[key] = result[key].toDate();
  }
  return result;
}

/** Onsite citation (Module A or B). */
function serializeCitation(citation) {
  if (!citation) return citation;
  const result = withDates(citation, ['sentAt', 'failedAt']);
  if (citation.appointment) result.appointment = withDates(citation.appointment, ['startsAt', 'endsAt']);
  if (citation.delivery) result.delivery = withDates(citation.delivery, ['checkedAt']);
  return result;
}

function serializeCandidate(doc) {
  const data = doc.data();
  const moduleB = data.moduleB && withDates(data.moduleB, ['invitedAt', 'submittedAt']);
  if (moduleB?.citation) moduleB.citation = serializeCitation(moduleB.citation);
  return {
    id: doc.id,
    ...data,
    ...(data.citation ? { citation: serializeCitation(data.citation) } : {}),
    ...(moduleB ? { moduleB } : {}),
    fechaHoraCita: data.fechaHoraCita?.toDate?.() ?? data.fechaHoraCita,
    createdAt: data.createdAt?.toDate?.() ?? data.createdAt,
    submittedAt: data.submittedAt?.toDate?.() ?? data.submittedAt,
    reviewedAt: data.reviewedAt?.toDate?.() ?? data.reviewedAt,
    profilePublishedAt: data.profilePublishedAt?.toDate?.() ?? data.profilePublishedAt,
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

  async findByEventId(eventId) {
    const snapshot = await this.collection.where('eventId', '==', eventId).get();
    return snapshot.docs.map(serializeCandidate).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
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
