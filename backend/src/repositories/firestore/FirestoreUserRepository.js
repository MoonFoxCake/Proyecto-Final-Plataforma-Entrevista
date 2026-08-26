const IUserRepository = require('../interfaces/IUserRepository');
const { db } = require('../../config/firebase');

/**
 * Firestore implementation of {@link IUserRepository}.
 */
class FirestoreUserRepository extends IUserRepository {
  constructor() {
    super();
    this.collection = db.collection('users');
  }

  async findById(id) {
    // TODO: implement Firestore query
    throw new Error('Not implemented yet');
  }

  async findByEmail(email) {
    // TODO: implement Firestore query
    throw new Error('Not implemented yet');
  }

  async findByOrganization(orgId) {
    // TODO: implement Firestore query
    throw new Error('Not implemented yet');
  }

  async create(data) {
    // TODO: implement Firestore query
    throw new Error('Not implemented yet');
  }

  async update(id, data) {
    // TODO: implement Firestore query
    throw new Error('Not implemented yet');
  }
}

module.exports = FirestoreUserRepository;
