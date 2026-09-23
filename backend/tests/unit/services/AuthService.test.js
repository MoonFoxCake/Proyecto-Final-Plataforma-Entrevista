jest.mock('../../../src/config/firebase', () => ({ auth: {
  createUser: jest.fn(), setCustomUserClaims: jest.fn(), deleteUser: jest.fn(),
} }));

const AuthService = require('../../../src/services/AuthService');
const { auth } = require('../../../src/config/firebase');
const { NotFoundError } = require('../../../src/utils/errors');

describe('AuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    auth.createUser.mockResolvedValue({ uid: 'company-user-1' });
    auth.setCustomUserClaims.mockResolvedValue();
    auth.deleteUser.mockResolvedValue();
  });

  test('register creates an isolated company organization and company user', async () => {
    const userRepo = { create: jest.fn(async (data) => ({ id: data.uid, ...data })) };
    const organizationRepo = {
      findByCompanyName: jest.fn().mockResolvedValue(null),
      create: jest.fn(async (data) => ({ id: 'org-1', ...data })), delete: jest.fn(),
    };
    const service = new AuthService(userRepo, organizationRepo);
    const result = await service.registerCompany({
      companyName: 'TechCorp S.A.', industry: 'Tecnología', companySize: '51-200',
      website: 'https://techcorp.example', companyPhone: '+502 2200 0000', city: 'Guatemala', country: 'Guatemala',
      displayName: 'María González', contactRole: 'Gerente de RRHH', contactPhone: '+502 5555 0000',
      email: 'RRHH@TECHCORP.EXAMPLE', password: 'Segura123', acceptTerms: true,
    });

    expect(auth.setCustomUserClaims).toHaveBeenCalledWith('company-user-1', { role: 'company', orgId: 'org-1' });
    expect(result.organization).toMatchObject({ companyName: 'TechCorp S.A.', industry: 'Tecnología' });
    expect(result.user).toMatchObject({ role: 'company', orgId: 'org-1', email: 'rrhh@techcorp.example' });
    expect(result.user.role).not.toBe('candidate');
  });

  test('public register cannot join an existing organization by name', async () => {
    const service = new AuthService({}, {
      findByCompanyName: jest.fn().mockResolvedValue({ id: 'existing-org' }),
    });
    await expect(service.registerCompany({ companyName: 'TechCorp', email: 'owner@techcorp.example' })).rejects.toThrow('Ya existe una empresa registrada con ese nombre.');
    expect(auth.createUser).not.toHaveBeenCalled();
  });
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
