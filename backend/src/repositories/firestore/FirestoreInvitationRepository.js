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

const toDate = (value) => value?.toDate?.() ?? value ?? null;

function serializeProgress(data) {
  return {
    ...data,
    timerStartedAt: toDate(data.timerStartedAt),
    startedAt: toDate(data.startedAt),
    updatedAt: toDate(data.updatedAt),
    answers: (data.answers || []).map((answer) => ({ ...answer, answeredAt: toDate(answer.answeredAt) })),
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

      // One final submission per evaluation, even if another link of the
      // same candidate and stage was used meanwhile.
      const candidateRef = db.collection('candidates').doc(invitation.candidateId);
      const candidate = (await transaction.get(candidateRef)).data() || {};
      const stageDone = module === 'B' ? candidate.moduleB?.status === 'COMPLETED' : candidate.status === 'EVALUATION_COMPLETED';
      if (stageDone) {
        const previous = module === 'B' ? candidate.moduleB?.submittedAt : candidate.submittedAt;
        return { state: 'COMPLETED', submittedAt: previous?.toDate?.() ?? previous, alreadySubmitted: true };
      }

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
        candidateRef,
        module === 'B'
          ? { 'moduleB.status': 'COMPLETED', 'moduleB.submittedAt': now }
          : { status: 'EVALUATION_COMPLETED', submittedAt: now },
      );
      return { state: 'COMPLETED', submittedAt: now, alreadySubmitted: false };
    });
  }

  async findProgress(progressId) {
    const doc = await db.collection('evaluationProgress').doc(progressId).get();
    return doc.exists ? serializeProgress(doc.data()) : null;
  }

  /** Read-modify-write in a transaction, so two tabs cannot both answer the same stage. */
  async updateProgress(progressId, mutate) {
    const ref = db.collection('evaluationProgress').doc(progressId);
    return db.runTransaction(async (transaction) => {
      const doc = await transaction.get(ref);
      const next = mutate(doc.exists ? serializeProgress(doc.data()) : null);
      transaction.set(ref, stripUndefined(next));
      return next;
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
