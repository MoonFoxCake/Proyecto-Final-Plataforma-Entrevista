const IInvitationRepository = require('../interfaces/IInvitationRepository');
const { generateId } = require('../../utils/helpers');

class InMemoryInvitationRepository extends IInvitationRepository {
  constructor() {
    super();
    this.data = [];
    this.submissions = [];
  }

  async findByTokenHash(tokenHash) {
    return this.data.find((item) => item.tokenHash === tokenHash) || null;
  }

  async create(data) {
    const item = { id: generateId(), ...data, createdAt: new Date() };
    this.data.push(item);
    return item;
  }

  async update(id, data) {
    const index = this.data.findIndex((item) => item.id === id);
    if (index === -1) return null;
    this.data[index] = { ...this.data[index], ...data };
    return this.data[index];
  }

  async findActiveByCandidate(candidateId, eventId, module = 'A') {
    return this.data.find((item) => (
      item.candidateId === candidateId &&
      item.eventId === eventId &&
      (item.module || 'A') === module &&
      item.status === 'ACTIVE'
    )) || null;
  }

  /**
   * @param {{ module?: 'A'|'B', instrumentVersion?: string, answers: object[] }} submission
   */
  async completeWithSubmission(tokenHash, { module = 'A', instrumentVersion = 'DEMO_A_V1', answers }) {
    const invitation = this.data.find((item) => item.tokenHash === tokenHash);
    if (!invitation) return { state: 'INVALID' };
    if (invitation.status === 'COMPLETED') {
      return { state: 'COMPLETED', submittedAt: invitation.submittedAt, alreadySubmitted: true };
    }
    if (invitation.status === 'CANCELLED') return { state: 'CANCELLED' };
    if (invitation.status === 'EXPIRED' || new Date(invitation.expiresAt) <= new Date()) {
      invitation.status = 'EXPIRED';
      return { state: 'EXPIRED' };
    }
    const submittedAt = new Date();
    this.submissions.push({
      id: invitation.id,
      invitationId: invitation.id,
      candidateId: invitation.candidateId,
      eventId: invitation.eventId,
      orgId: invitation.orgId,
      module,
      instrumentVersion,
      answers,
      submittedAt,
    });
    invitation.status = 'COMPLETED';
    invitation.submittedAt = submittedAt;
    return { state: 'COMPLETED', submittedAt, alreadySubmitted: false };
  }

  async findSubmissionByCandidate(candidateId, eventId, module = 'A') {
    return this.submissions.find((item) => (
      item.candidateId === candidateId && item.eventId === eventId && (item.module || 'A') === module
    )) || null;
  }
}

module.exports = InMemoryInvitationRepository;
