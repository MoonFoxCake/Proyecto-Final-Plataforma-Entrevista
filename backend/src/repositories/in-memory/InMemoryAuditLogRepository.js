const IAuditLogRepository = require('../interfaces/IAuditLogRepository');
const { generateId } = require('../../utils/helpers');

class InMemoryAuditLogRepository extends IAuditLogRepository {
  constructor() {
    super();
    this.data = [];
  }

  async record(entry) {
    const item = { id: generateId(), ...entry };
    this.data.push(item);
    return item;
  }

  async findByEvent(eventId) {
    return this.data.filter((item) => item.eventId === eventId);
  }
}

module.exports = InMemoryAuditLogRepository;
