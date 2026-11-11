const { db } = require('../../config/firebase');

class FirestoreSettingsRepository {
  constructor() { this.ref = db.collection('platformSettings').doc('main'); }

  async get() {
    const doc = await this.ref.get();
    return doc.exists ? doc.data() : null;
  }

  async set(data) { await this.ref.set(data); }
}

module.exports = FirestoreSettingsRepository;
