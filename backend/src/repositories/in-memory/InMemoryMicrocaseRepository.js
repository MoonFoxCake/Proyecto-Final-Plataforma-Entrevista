const { generateId } = require('../../utils/helpers');
class InMemoryMicrocaseRepository {
  constructor() { this.data = []; }
  async findAll() { return [...this.data]; }
  async findById(id) { return this.data.find((x) => x.id === id) || null; }
  async create(data) { const item = { id: generateId(), ...data, createdAt: new Date(), updatedAt: new Date() }; this.data.push(item); return item; }
  async update(id, data) { const i = this.data.findIndex((x) => x.id === id); if (i < 0) return null; this.data[i] = { ...this.data[i], ...data, updatedAt: new Date() }; return this.data[i]; }
  async delete(id) { const item = await this.findById(id); this.data = this.data.filter((x) => x.id !== id); return item; }
}
module.exports = InMemoryMicrocaseRepository;
