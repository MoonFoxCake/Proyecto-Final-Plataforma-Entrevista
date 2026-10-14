/**
 * Onsite access credentials (`accessCredentials`). Only the HMAC of each
 * code is stored, never the code.
 *
 * An assignment (event + candidate + module) has at most one current
 * credential; `issue` and `update` are atomic so two concurrent requests
 * cannot leave two usable codes for the same assignment.
 */
class IAccessCredentialRepository {
  async findById(id) { throw new Error('Not implemented'); }
  async findByEvent(eventId) { throw new Error('Not implemented'); }
  async findByCodeHash(codeHash) { throw new Error('Not implemented'); }
  /**
   * Atomically issues `credential` for its assignment. `decide(current)`
   * receives the assignment's current credential (or null) and returns
   * `{ action: 'skip' }` or `{ action: 'issue', currentChanges? }` (changes
   * applied to the current one, e.g. revoking it).
   *
   * @returns {Promise<{ clash?: true, skipped?: true, issued?: object, current: object|null }>}
   *   `clash`: another credential already has this code hash; retry with a new code.
   */
  async issue(credential, decide) { throw new Error('Not implemented'); }
  /** Atomically applies `mutate(current)` (changes to merge; may throw). Returns the updated credential. */
  async update(id, mutate) { throw new Error('Not implemented'); }
}

module.exports = IAccessCredentialRepository;
