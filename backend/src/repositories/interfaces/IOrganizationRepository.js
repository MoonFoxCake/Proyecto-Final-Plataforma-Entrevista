/**
 * Repository contract for organization (tenant) persistence.
 */
class IOrganizationRepository {
  /** @param {string} id @returns {Promise<object|null>} */
  async findById(id) { throw new Error('Not implemented'); }

  /** @returns {Promise<object[]>} */
  async findAll() { throw new Error('Not implemented'); }

  /** @param {object} data @returns {Promise<object>} */
  async create(data) { throw new Error('Not implemented'); }

  /** @param {string} id @param {object} data @returns {Promise<object|null>} */
  async update(id, data) { throw new Error('Not implemented'); }
}

module.exports = IOrganizationRepository;
