class ICandidateRepository {
  async findById(id) { throw new Error('Not implemented'); }
  async findByEvent(eventId, orgId) { throw new Error('Not implemented'); }
  async findByCedulaAndEvent(eventId, cedula) { throw new Error('Not implemented'); }
  async create(data) { throw new Error('Not implemented'); }
  async update(id, data) { throw new Error('Not implemented'); }
}

module.exports = ICandidateRepository;
