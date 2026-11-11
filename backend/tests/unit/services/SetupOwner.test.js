const path = require('path');

describe('Owner command startup', () => {
  const originalArgv = process.argv;
  afterEach(() => { process.argv = originalArgv; jest.resetModules(); });

  test('loads backend/.env before Firebase initialization without running account mutations', async () => {
    let loaded = false;
    const config = jest.fn(() => { loaded = true; return {}; });
    jest.doMock('dotenv', () => ({ config }));
    jest.doMock('../../../src/config/firebase', () => {
      if (!loaded) throw new Error('Firebase initialized before dotenv');
      return { auth: {} };
    });
    jest.doMock('../../../src/repositories/firestore/FirestoreUserRepository', () => class {
      async getOwnerId() { return 'existing-owner'; }
    });
    process.argv = ['node', 'setup-owner.js', '--username', 'owner'];
    const { main } = require('../../../scripts/setup-owner');
    expect(config).not.toHaveBeenCalled();
    await expect(main()).rejects.toThrow('Ya existe un propietario');
    expect(config).toHaveBeenCalledWith({ path: path.resolve(__dirname, '../../../.env') });
    // No override: deployment environment variables retain precedence.
    expect(config.mock.calls[0][0].override).toBeUndefined();
  });
});
