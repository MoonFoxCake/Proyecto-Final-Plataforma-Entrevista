const IInvitationRepository = require('../interfaces/IInvitationRepository');
const { db } = require('../../config/firebase');
const { stripUndefined } = require('../../utils/helpers');

function serialize(doc) {
  const data = doc.data();
  return {
    id: doc.id,
    ...data,
    expiresAt: data.expiresAt?.toDate?.() ?? data.expiresAt,
    createdAt: data.createdAt?.toDate?.() ?? data.createdAt,
    submittedAt: data.submittedAt?.toDate?.() ?? data.submittedAt,
  };
}

class FirestoreInvitationRepository extends IInvitationRepository {
  constructor() {
    super();
    this.collection = db.collection('invitations');
  }

  async findByTokenHash(tokenHash) {
    const snapshot = await this.collection.where('tokenHash', '==', tokenHash).limit(1).get();
    if (snapshot.empty) return null;
    return serialize(snapshot.docs[0]);
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

  async findActiveByCandidate(candidateId, eventId) {
    const snapshot = await this.collection.where('candidateId', '==', candidateId).get();
    const doc = snapshot.docs.find((item) => {
      const data = item.data();
      return data.eventId === eventId && data.status === 'ACTIVE';
    });
    return doc ? serialize(doc) : null;
  }

  async completeWithSubmission(tokenHash, answers) {
    const query = this.collection.where('tokenHash', '==', tokenHash).limit(1);
    return db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(query);
      if (snapshot.empty) return { state: 'INVALID' };

      const invitationDoc = snapshot.docs[0];
      const invitation = invitationDoc.data();
      if (invitation.status === 'COMPLETED') {
        return {
          state: 'COMPLETED',
          submittedAt: invitation.submittedAt?.toDate?.() ?? invitation.submittedAt,
          alreadySubmitted: true,
        };
      }
      if (invitation.status === 'CANCELLED') return { state: 'CANCELLED' };
      if (invitation.status === 'EXPIRED') return { state: 'EXPIRED' };

      const now = new Date();
      const expiresAt = invitation.expiresAt?.toDate?.() ?? new Date(invitation.expiresAt);
      if (expiresAt <= now) {
        transaction.update(invitationDoc.ref, { status: 'EXPIRED', expiredAt: now });
        return { state: 'EXPIRED' };
      }

      const submissionRef = db.collection('evaluationSubmissions').doc(invitationDoc.id);
      transaction.set(submissionRef, {
        invitationId: invitationDoc.id,
        candidateId: invitation.candidateId,
        eventId: invitation.eventId,
        orgId: invitation.orgId,
        module: 'A',
        instrumentVersion: 'DEMO_A_V1',
        answers,
        submittedAt: now,
      });
      transaction.update(invitationDoc.ref, { status: 'COMPLETED', submittedAt: now });
      transaction.update(db.collection('candidates').doc(invitation.candidateId), {
        status: 'EVALUATION_COMPLETED',
        submittedAt: now,
      });
      return { state: 'COMPLETED', submittedAt: now, alreadySubmitted: false };
    });
  }

  async findSubmissionByCandidate(candidateId, eventId) {
    const snapshot = await db.collection('evaluationSubmissions').where('candidateId', '==', candidateId).get();
    const doc = snapshot.docs.find((item) => item.data().eventId === eventId);
    if (!doc) return null;
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      submittedAt: data.submittedAt?.toDate?.() ?? data.submittedAt,
    };
  }
}

module.exports = FirestoreInvitationRepository;
