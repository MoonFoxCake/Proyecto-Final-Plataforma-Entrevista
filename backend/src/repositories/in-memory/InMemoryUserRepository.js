const IUserRepository = require('../interfaces/IUserRepository');
const { generateId } = require('../../utils/helpers');

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
}

module.exports = InMemoryUserRepository;
