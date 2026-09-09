jest.mock('../../../src/config/firebase', () => ({ auth: {} }));

const AuthService = require('../../../src/services/AuthService');
const { NotFoundError } = require('../../../src/utils/errors');

describe('AuthService', () => {
  test('getProfile returns the persisted role from the user record', async () => {
    const repo = {
      findById: jest.fn().mockResolvedValue({ id: 'uid-123', email: 'admin@example.com', role: 'admin' }),
    };

    const service = new AuthService(repo);
    const user = await service.getProfile('uid-123');

    expect(repo.findById).toHaveBeenCalledWith('uid-123');
    expect(user.role).toBe('admin');
  });

  test('getProfile throws when the user does not exist', async () => {
    const repo = {
      findById: jest.fn().mockResolvedValue(null),
    };

    const service = new AuthService(repo);

    await expect(service.getProfile('missing-user')).rejects.toThrow(NotFoundError);
  });
});
