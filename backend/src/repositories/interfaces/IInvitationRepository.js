class IInvitationRepository {
  async findByTokenHash(tokenHash) { throw new Error('Not implemented'); }
  async create(data) { throw new Error('Not implemented'); }
  async update(id, data) { throw new Error('Not implemented'); }
  async findActiveByCandidate(candidateId, eventId, module = 'A') { throw new Error('Not implemented'); }
  async completeWithSubmission(tokenHash, submission) { throw new Error('Not implemented'); }
  async findSubmissionByCandidate(candidateId, eventId, module = 'A') { throw new Error('Not implemented'); }
  /** Saved Module B progress (`evaluationProgress/{progressId}`), or null. */
  async findProgress(progressId) { throw new Error('Not implemented'); }
  /**
   * Atomically replaces the progress with `mutate(current | null)` and
   * returns the new value. If `mutate` throws, nothing is written.
   */
  async updateProgress(progressId, mutate) { throw new Error('Not implemented'); }
}

module.exports = IInvitationRepository;
