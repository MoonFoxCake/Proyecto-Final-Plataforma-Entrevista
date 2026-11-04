const IMacrocaseRepository = require('../interfaces/IMacrocaseRepository');
const { generateId } = require('../../utils/helpers');

class InMemoryMacrocaseRepository extends IMacrocaseRepository {
  constructor() {
    super();
    this.data = [];
  }

  async findAll() { return [...this.data]; }
  async findById(id) { return this.data.find((item) => item.id === id) || null; }
  async create(data) {
    const now = new Date();
    const item = { id: generateId(), ...data, createdAt: now, updatedAt: now };
    this.data.push(item);
    return item;
  }
  async update(id, data) {
    const index = this.data.findIndex((item) => item.id === id);
    if (index === -1) return null;
    this.data[index] = { ...this.data[index], ...data, updatedAt: new Date() };
    return this.data[index];
  }
  async delete(id) {
    const existing = await this.findById(id);
    if (!existing) return null;
    this.data = this.data.filter((item) => item.id !== id);
    return existing;
  }
}

module.exports = InMemoryMacrocaseRepository;
