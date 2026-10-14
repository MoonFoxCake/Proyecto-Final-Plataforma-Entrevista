/**
 * Append-only record of sensitive operations (`auditLog`): who did what to
 * which credential and when. Never holds access codes.
 */
class IAuditLogRepository {
  async record(entry) { throw new Error('Not implemented'); }
  async findByEvent(eventId) { throw new Error('Not implemented'); }
}

module.exports = IAuditLogRepository;
