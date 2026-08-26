/**
 * Repository contract for user persistence. Services depend on this
 * interface, never on a concrete implementation.
 */
class IUserRepository {
  /** @param {string} id @returns {Promise<object|null>} */
  async findById(id) { throw new Error('Not implemented'); }

  /** @param {string} email @returns {Promise<object|null>} */
  async findByEmail(email) { throw new Error('Not implemented'); }

  /** @param {string} orgId @returns {Promise<object[]>} */
  async findByOrganization(orgId) { throw new Error('Not implemented'); }

  /** @param {object} data @returns {Promise<object>} */
  async create(data) { throw new Error('Not implemented'); }

  /** @param {string} id @param {object} data @returns {Promise<object|null>} */
  async update(id, data) { throw new Error('Not implemented'); }
}

module.exports = IUserRepository;
