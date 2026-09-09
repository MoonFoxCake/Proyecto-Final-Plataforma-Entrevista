const IEventRepository = require('../interfaces/IEventRepository');
const { db } = require('../../config/firebase');
const { stripUndefined } = require('../../utils/helpers');

function serializeEvent(doc, sourceCollection) {
  const data = doc.data();
  return {
    id: doc.id,
    ...data,
    sourceCollection,
    date: data.date?.toDate?.() ?? data.date,
    eventDate: data.eventDate?.toDate?.() ?? data.eventDate,
    availableFrom: data.availableFrom?.toDate?.() ?? data.availableFrom,
    createdAt: data.createdAt?.toDate?.() ?? data.createdAt,
  };
}

/**
 * Supports both the current `events` collection and legacy `processes`
 * documents from the original skeleton.
 */
class FirestoreEventRepository extends IEventRepository {
  constructor() {
    super();
    this.collection = db.collection('events');
  }

  async findById(id) {
    for (const collectionName of ['events', 'processes']) {
      const doc = await db.collection(collectionName).doc(id).get();
      if (doc.exists) return serializeEvent(doc, collectionName);
    }
    return null;
  }

  async findByOrganization(orgId) {
    const matches = [];
    const seen = new Set();
    const lookups = [
      ['events', 'orgId'],
      ['events', 'recruiterOrgId'],
      ['processes', 'recruiterOrgId'],
      ['processes', 'orgId'],
    ];

    for (const [collectionName, field] of lookups) {
      const snapshot = await db.collection(collectionName).where(field, '==', orgId).get();
      snapshot.docs.forEach((doc) => {
        const key = `${collectionName}:${doc.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          matches.push(serializeEvent(doc, collectionName));
        }
      });
    }
    return matches;
  }

  async create(data) {
    const payload = stripUndefined({ ...data, createdAt: new Date() });
    const ref = await this.collection.add(payload);
    return { id: ref.id, ...payload, sourceCollection: 'events' };
  }
}

module.exports = FirestoreEventRepository;
