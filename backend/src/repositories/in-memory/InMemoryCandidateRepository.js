const ICandidateRepository = require('../interfaces/ICandidateRepository');
const { generateId } = require('../../utils/helpers');

class InMemoryCandidateRepository extends ICandidateRepository {
  constructor() {
    super();
    this.data = [];
  }

  async findById(id) {
    return this.data.find((item) => item.id === id) || null;
  }

  async findByEvent(eventId, orgId) {
    return this.data.filter((item) => item.eventId === eventId && item.orgId === orgId);
  }
  async findByCedulaAndEvent(eventId, cedula) {
    return this.data.find((item) => item.eventId === eventId && item.cedula === cedula) || null;
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

module.exports = InMemoryCandidateRepository;
