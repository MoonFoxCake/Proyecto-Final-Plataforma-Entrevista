const IAccessCredentialRepository = require('../interfaces/IAccessCredentialRepository');
const { db } = require('../../config/firebase');
const { stripUndefined } = require('../../utils/helpers');

const DATE_FIELDS = ['expiresAt', 'appointmentStartsAt', 'createdAt', 'enabledAt', 'usedAt', 'revokedAt'];

function serialize(doc) {
  const data = doc.data();
  const result = { id: doc.id, ...data };
  for (const field of DATE_FIELDS) {
    if (result[field]?.toDate) result[field] = result[field].toDate();
  }
  return result;
}

/**
 * `accessCredentials`: one document per issued code (history is kept).
 * `accessCredentialSlots/{eventId}_{candidateId}_{module}`: points to the
 * assignment's current credential, so issuing is a single transaction
 * over a known document and two concurrent requests cannot both issue.
 */
class FirestoreAccessCredentialRepository extends IAccessCredentialRepository {
  constructor() {
    super();
    this.collection = db.collection('accessCredentials');
    this.slots = db.collection('accessCredentialSlots');
  }

  async findById(id) {
    const doc = await this.collection.doc(id).get();
    return doc.exists ? serialize(doc) : null;
  }

  async findByEvent(eventId) {
    const snapshot = await this.collection.where('eventId', '==', eventId).get();
    return snapshot.docs.map(serialize);
  }

  async findByCodeHash(codeHash) {
    const snapshot = await this.collection.where('codeHash', '==', codeHash).limit(1).get();
    return snapshot.empty ? null : serialize(snapshot.docs[0]);
  }

  async issue(credential, decide) {
    const slotRef = this.slots.doc(`${credential.eventId}_${credential.candidateId}_${credential.module}`);
    return db.runTransaction(async (transaction) => {
      const slot = await transaction.get(slotRef);
      const currentId = slot.exists ? slot.data().currentId : null;
      const currentDoc = currentId ? await transaction.get(this.collection.doc(currentId)) : null;
      const current = currentDoc?.exists ? serialize(currentDoc) : null;
      const clash = await transaction.get(this.collection.where('codeHash', '==', credential.codeHash).limit(1));
      if (!clash.empty) return { clash: true, current };

      const decision = decide(current);
      if (decision.action === 'skip') return { skipped: true, current };

      const ref = this.collection.doc();
      const issued = stripUndefined({ ...credential, replacesId: current?.id ?? null });
      if (current && decision.currentChanges) {
        transaction.update(currentDoc.ref, stripUndefined({ ...decision.currentChanges, replacedById: ref.id }));
      }
      transaction.set(ref, issued);
      transaction.set(slotRef, {
        eventId: credential.eventId,
        candidateId: credential.candidateId,
        module: credential.module,
        currentId: ref.id,
        updatedAt: credential.createdAt,
      });
      return { issued: { id: ref.id, ...issued }, current };
    });
  }

  async update(id, mutate) {
    const ref = this.collection.doc(id);
    return db.runTransaction(async (transaction) => {
      const doc = await transaction.get(ref);
      const current = doc.exists ? serialize(doc) : null;
      const changes = stripUndefined(mutate(current));
      transaction.update(ref, changes);
      return { ...current, ...changes };
    });
  }
}

module.exports = FirestoreAccessCredentialRepository;
