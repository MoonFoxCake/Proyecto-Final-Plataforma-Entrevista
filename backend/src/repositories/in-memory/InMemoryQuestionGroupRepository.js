const { randomUUID } = require('crypto');
const { AppError, NotFoundError } = require('../../utils/errors');
const copy = (value) => structuredClone(value);
class InMemoryQuestionGroupRepository {
  constructor() { this.groups = new Map(); this.versions = new Map(); }
  async ensureInitial(data) { if (!this.groups.has('initial-a')) await this.create(data, 'initial-a'); }
  async findAll() { return copy([...this.groups.values()]); }
  async findById(id) { return copy(this.groups.get(id) || null); }
  async history(id) { return copy(this.versions.get(id) || []); }
  async create(data, id = randomUUID()) {
    const now = new Date().toISOString();
    const group = { ...copy(data), id, version: 1, createdAt: now, updatedAt: now };
    this.groups.set(id, group);
    this.versions.set(id, [copy(group)]);
    return copy(group);
  }
  async revise(id, data, baseVersion) {
    const previous = this.groups.get(id);
    if (!previous) throw new NotFoundError('Grupo no encontrado.');
    if (previous.version !== baseVersion) throw new AppError('El grupo cambió. Carga la versión actual antes de guardar.', 409);
    const group = { ...previous, ...copy(data), version: previous.version + 1, updatedAt: new Date().toISOString() };
    this.groups.set(id, group);
    this.versions.get(id).push(copy(group));
    return copy(group);
  }
  async setActive(id, active, baseVersion) {
    const group = this.groups.get(id);
    if (!group) throw new NotFoundError('Grupo no encontrado.');
    if (group.version !== baseVersion) throw new AppError('El grupo cambió. Actualiza el banco antes de cambiar su estado.', 409);
    const updated = { ...group, active, updatedAt: new Date().toISOString() };
    this.groups.set(id, updated);
    return copy(updated);
  }
}
module.exports = InMemoryQuestionGroupRepository;
