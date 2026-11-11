const IUserRepository = require('../interfaces/IUserRepository');
const { generateId } = require('../../utils/helpers');
const { AppError, ForbiddenError } = require('../../utils/errors');

/**
 * In-memory implementation of {@link IUserRepository}, used in unit tests
 * so services can be exercised without a real Firestore connection.
 */
class InMemoryUserRepository extends IUserRepository {
  constructor() {
    super();
    /** @type {object[]} */
    this.data = [];
  }

  async findById(id) {
    return this.data.find((item) => item.id === id) || null;
  }

  async findByEmail(email) {
    return this.data.find((item) => item.email === email) || null;
  }

  async findByOrganization(orgId) {
    return this.data.filter((item) => item.orgId === orgId);
  }

  async findAll() {
    return [...this.data];
  }

  /** Like Firestore, a user created with a `uid` is stored under that id. */
  async create(data) {
    const { uid, ...rest } = data;
    const item = { id: uid ?? generateId(), ...rest, createdAt: new Date() };
    this.data.push(item);
    return item;
  }

  async update(id, data) {
    const index = this.data.findIndex((item) => item.id === id);
    if (index === -1) return null;
    this.data[index] = { ...this.data[index], ...data };
    return this.data[index];
  }

  async changeAccount(id, changes, expectedRevision) {
    const index = this.data.findIndex((item) => item.id === id);
    if (index < 0) return null;
    const current = this.data[index];
    if (current.adminAccess === 'owner') throw new ForbiddenError('La cuenta propietaria está protegida.');
    if ((current.revision || 0) !== expectedRevision) throw new AppError('La cuenta cambió. Actualiza la lista antes de continuar.', 409);
    const saved = { ...current, ...changes, revision: expectedRevision + 1, updatedAt: new Date().toISOString() };
    this.data[index] = saved;
    return saved;
  }

  async initializeOwner(uid, profile) {
    if (this.ownerUid) throw new ForbiddenError('La cuenta propietaria ya fue configurada.');
    const index = this.data.findIndex((item) => item.id === uid);
    if (index >= 0 && (this.data[index].role !== 'admin' || ['deleted', 'deletion_pending'].includes(this.data[index].status))) throw new ForbiddenError('Esta identidad ya pertenece a una cuenta incompatible.');
    this.ownerUid = uid;
    const saved = { id: uid, ...profile, role: 'admin', adminAccess: 'owner', permissions: [], status: 'active', orgId: null, revision: 1, createdAt: new Date().toISOString() };
    if (index >= 0) this.data[index] = saved; else this.data.push(saved);
    return saved;
  }

  async getOwnerId() { return this.ownerUid || null; }
}

module.exports = InMemoryUserRepository;
