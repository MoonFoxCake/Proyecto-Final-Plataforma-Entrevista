const IAccessCredentialRepository = require('../interfaces/IAccessCredentialRepository');
const { generateId } = require('../../utils/helpers');

const assignmentKey = ({ eventId, candidateId, module }) => `${eventId}_${candidateId}_${module}`;

class InMemoryAccessCredentialRepository extends IAccessCredentialRepository {
  constructor() {
    super();
    this.data = [];
    this.current = new Map(); // assignment → current credential id
  }

  async findById(id) {
    return this.data.find((item) => item.id === id) || null;
  }

  async findByEvent(eventId) {
    return this.data.filter((item) => item.eventId === eventId);
  }

  async findByCodeHash(codeHash) {
    return this.data.find((item) => item.codeHash === codeHash) || null;
  }

  async issue(credential, decide) {
    const key = assignmentKey(credential);
    const stored = this.data.find((item) => item.id === this.current.get(key)) || null;
    // Like Firestore, `current` is the credential as it was before this issue.
    const current = stored && { ...stored };
    if (this.data.some((item) => item.codeHash === credential.codeHash)) return { clash: true, current };
    const decision = decide(current);
    if (decision.action === 'skip') return { skipped: true, current };

    const issued = { id: generateId(), ...credential, replacesId: current?.id ?? null };
    if (stored && decision.currentChanges) Object.assign(stored, decision.currentChanges, { replacedById: issued.id });
    this.data.push(issued);
    this.current.set(key, issued.id);
    return { issued, current };
  }

  async update(id, mutate) {
    const item = this.data.find((credential) => credential.id === id) || null;
    Object.assign(item ?? {}, mutate(item));
    return item;
  }
}

module.exports = InMemoryAccessCredentialRepository;
