const IAuditLogRepository = require('../interfaces/IAuditLogRepository');
const { db } = require('../../config/firebase');
const { stripUndefined } = require('../../utils/helpers');

class FirestoreAuditLogRepository extends IAuditLogRepository {
  constructor() {
    super();
    this.collection = db.collection('auditLog');
  }

  async record(entry) {
    const payload = stripUndefined(entry);
    const ref = await this.collection.add(payload);
    return { id: ref.id, ...payload };
  }

  async findByEvent(eventId) {
    const snapshot = await this.collection.where('eventId', '==', eventId).get();
    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return { id: doc.id, ...data, at: data.at?.toDate?.() ?? data.at };
    });
  }
}

module.exports = FirestoreAuditLogRepository;
