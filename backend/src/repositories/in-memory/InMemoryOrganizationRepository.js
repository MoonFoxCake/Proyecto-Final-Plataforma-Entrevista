const IOrganizationRepository = require('../interfaces/IOrganizationRepository');
const { generateId } = require('../../utils/helpers');

/**
 * In-memory implementation of {@link IOrganizationRepository}.
 */
class InMemoryOrganizationRepository extends IOrganizationRepository {
  constructor() {
    super();
    /** @type {object[]} */
    this.data = [];
  }

  async findById(id) {
    return this.data.find((item) => item.id === id) || null;
  }

  async findByCompanyName(companyName) {
    return this.data.find((item) => [item.companyName, item.name].some(
      (name) => typeof name === 'string' && name.trim().toLowerCase() === companyName
    )) || null;
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

module.exports = InMemoryOrganizationRepository;
