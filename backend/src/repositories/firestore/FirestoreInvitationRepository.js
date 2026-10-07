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
    availableAt: data.availableAt?.toDate?.() ?? data.availableAt,
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

  async findActiveByCandidate(candidateId, eventId, module = 'A') {
    const snapshot = await this.collection.where('candidateId', '==', candidateId).get();
    const doc = snapshot.docs.find((item) => {
      const data = item.data();
      return data.eventId === eventId && (data.module || 'A') === module && data.status === 'ACTIVE';
    });
    return doc ? serialize(doc) : null;
  }

  /**
   * Stores the answers and closes the invitation in one transaction.
   * Module A marks the candidate's evaluation as completed; Module B only
   * its own stage (candidate.moduleB), leaving the Module A review intact.
   *
   * @param {{ module?: 'A'|'B', instrumentVersion?: string, answers: object[] }} submission
   */
  async completeWithSubmission(tokenHash, { module = 'A', instrumentVersion = 'DEMO_A_V1', answers }) {
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
        module,
        instrumentVersion,
        answers,
        submittedAt: now,
      });
      transaction.update(invitationDoc.ref, { status: 'COMPLETED', submittedAt: now });
      transaction.update(
        db.collection('candidates').doc(invitation.candidateId),
        module === 'B'
          ? { 'moduleB.status': 'COMPLETED', 'moduleB.submittedAt': now }
          : { status: 'EVALUATION_COMPLETED', submittedAt: now },
      );
      return { state: 'COMPLETED', submittedAt: now, alreadySubmitted: false };
    });
  }

  async findSubmissionByCandidate(candidateId, eventId, module = 'A') {
    const snapshot = await db.collection('evaluationSubmissions').where('candidateId', '==', candidateId).get();
    const doc = snapshot.docs.find((item) => {
      const data = item.data();
      return data.eventId === eventId && (data.module || 'A') === module;
    });
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
