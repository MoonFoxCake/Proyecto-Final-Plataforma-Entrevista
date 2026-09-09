class IInvitationRepository {
  async findByTokenHash(tokenHash) { throw new Error('Not implemented'); }
  async create(data) { throw new Error('Not implemented'); }
  async update(id, data) { throw new Error('Not implemented'); }
  async findActiveByCandidate(candidateId, eventId) { throw new Error('Not implemented'); }
  async completeWithSubmission(tokenHash, answers) { throw new Error('Not implemented'); }
}

module.exports = IInvitationRepository;
