const IEventRepository = require('../interfaces/IEventRepository');
const { generateId } = require('../../utils/helpers');

class InMemoryEventRepository extends IEventRepository {
  constructor() {
    super();
    this.data = [];
  }

  async findById(id) { return this.data.find((item) => item.id === id) || null; }
  async findAll() { return [...this.data]; }
  async findByOrganization(orgId) {
    return this.data.filter((item) => (item.orgId ?? item.recruiterOrgId) === orgId);
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

module.exports = InMemoryEventRepository;
