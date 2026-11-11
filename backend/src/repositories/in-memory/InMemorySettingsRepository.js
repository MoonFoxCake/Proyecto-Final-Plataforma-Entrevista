class InMemorySettingsRepository {
  constructor() { this.data = null; }

  async get() { return this.data; }

  async set(data) { this.data = data; }
}

module.exports = InMemorySettingsRepository;
