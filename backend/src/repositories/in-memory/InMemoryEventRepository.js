const IEventRepository = require('../interfaces/IEventRepository');
const { generateId } = require('../../utils/helpers');

class InMemoryEventRepository extends IEventRepository {
  constructor() {
    super();
    this.data = [];
  }

  async findById(id) { return this.data.find((item) => item.id === id) || null; }
  async findByOrganization(orgId) {
    return this.data.filter((item) => (item.orgId ?? item.recruiterOrgId) === orgId);
  }
  async create(data) {
    const item = { id: generateId(), ...data, createdAt: new Date() };
    this.data.push(item);
    return item;
  }
}

module.exports = InMemoryEventRepository;
