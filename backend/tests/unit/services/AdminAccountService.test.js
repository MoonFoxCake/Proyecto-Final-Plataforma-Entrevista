const AdminAccountService = require('../../../src/services/AdminAccountService');
const UserRepository = require('../../../src/repositories/in-memory/InMemoryUserRepository');
const { permissionsOf, ALL_PERMISSIONS } = require('../../../src/utils/adminPermissions');

describe('Administrative account security', () => {
  let users, identity, audit, service;
  const access = { username: 'evaluador', displayName: 'Ana Evaluadora', adminAccess: 'restricted', permissions: ['results.view'] };
  beforeEach(async () => {
    users = new UserRepository();
    await users.initializeOwner('owner', { username: 'owner' });
    await users.create({ uid: 'full', role: 'admin', adminAccess: 'full', revision: 1, status: 'active' });
    await users.create({ uid: 'limited', role: 'admin', adminAccess: 'restricted', permissions: ['admins.create', 'admins.manage', 'admins.delete', 'results.view'], revision: 1, status: 'active' });
    await users.create({ uid: 'company', role: 'company', email: 'person@example.test', orgId: 'org', revision: 0 });
    identity = { createUser: jest.fn(async () => ({ uid: 'new' })), setCustomUserClaims: jest.fn(), deleteUser: jest.fn(), updateUser: jest.fn(), revokeRefreshTokens: jest.fn() };
    audit = { record: jest.fn() };
    service = new AdminAccountService({ userRepo: users, auditRepo: audit, identity });
  });
  test('owner initialization is exclusive and legacy admins have no implicit permissions', async () => {
    await expect(users.initializeOwner('another', {})).rejects.toMatchObject({ statusCode: 403 });
    expect(permissionsOf({ role: 'admin' })).toEqual([]);
    // Ids from before Procesos and Resultados were merged keep their access.
    expect(permissionsOf({ role: 'admin', permissions: ['evaluations.review', 'processes.view', 'evaluations.publish'] })).toEqual(['results.view', 'results.deliver']);
    expect(permissionsOf(await users.findById('owner'))).toEqual(ALL_PERMISSIONS);
    expect(permissionsOf({ role: 'admin', adminAccess: 'full', status: 'disabled' })).toEqual([]);
  });
  test('creates an account with a reserved alias and a one-time password, without persisting credentials', async () => {
    const result = await service.create('limited', access);
    expect(identity.createUser).toHaveBeenCalledWith(expect.objectContaining({ email: 'evaluador@admin.nexoperfil.invalid', password: result.temporaryPassword }));
    expect(result.temporaryPassword.length).toBeGreaterThanOrEqual(24);
    expect(await users.findById('new')).toMatchObject({ adminAccess: 'restricted', permissions: ['results.view'] });
    expect(JSON.stringify(await users.findAll())).not.toContain(result.temporaryPassword);
    expect(JSON.stringify(audit.record.mock.calls)).not.toContain(result.temporaryPassword);
  });
  test.each([
    { adminAccess: 'full', permissions: [] },
    { adminAccess: 'restricted', permissions: ['questions.manage'] },
    { adminAccess: 'restricted', permissions: ['unknown.permission'] },
  ])('rejects escalation at account creation: %j', async (grants) => {
    await expect(service.create('limited', { ...access, ...grants })).rejects.toThrow();
    expect(identity.createUser).not.toHaveBeenCalled();
  });
  test('full administrators can create full accounts', async () => {
    expect((await service.create('full', { ...access, adminAccess: 'full', permissions: [] })).account.adminAccess).toBe('full');
  });
  test.each(['owner', 'full'])('protects owner and self against mutations by %s', async (actor) => {
    for (const target of ['owner', actor]) {
      await expect(service.update(actor, target, { displayName: 'Changed', adminAccess: 'restricted', permissions: [], revision: 1 })).rejects.toMatchObject({ statusCode: 403 });
      await expect(service.setStatus(actor, target, { status: 'disabled', revision: 1 })).rejects.toMatchObject({ statusCode: 403 });
      await expect(service.resetPassword(actor, target, { password: 'long-password-example', revision: 1 })).rejects.toMatchObject({ statusCode: 403 });
      await expect(service.delete(actor, target, { confirmation: target, revision: 1 })).rejects.toMatchObject({ statusCode: 403 });
    }
    expect(identity.updateUser).not.toHaveBeenCalled();
    expect(identity.deleteUser).not.toHaveBeenCalled();
  });
  test('restricted administrators cannot manage a disabled account with greater permissions', async () => {
    await users.update('full', { adminAccess: 'restricted', permissions: ['questions.manage'], status: 'disabled' });
    await expect(service.update('limited', 'full', { displayName: 'Changed', adminAccess: 'restricted', permissions: [], revision: 1 })).rejects.toMatchObject({ statusCode: 403 });
  });
  test('detects stale revisions and applies suspension before calling the identity provider', async () => {
    await service.update('owner', 'limited', { displayName: 'Changed', adminAccess: 'restricted', permissions: ['results.view'], revision: 1 });
    await expect(service.setStatus('owner', 'limited', { status: 'disabled', revision: 1 })).rejects.toMatchObject({ statusCode: 409 });
    identity.updateUser.mockRejectedValueOnce(new Error('Provider offline'));
    await expect(service.setStatus('owner', 'limited', { status: 'disabled', revision: 2 })).rejects.toThrow('Provider offline');
    expect(permissionsOf(await users.findById('limited'))).toEqual([]);
  });
  test('user deletion requires its own permission and an exact confirmation', async () => {
    await expect(service.delete('limited', 'company', { confirmation: 'person@example.test', revision: 0 })).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.delete('owner', 'company', { confirmation: 'wrong', revision: 0 })).rejects.toMatchObject({ statusCode: 400 });
    expect(identity.deleteUser).not.toHaveBeenCalled();
  });
  test('failed identity deletion blocks access and supports retry without removing organization data', async () => {
    identity.deleteUser.mockRejectedValueOnce(new Error('Provider offline'));
    await expect(service.delete('owner', 'company', { confirmation: 'person@example.test', revision: 0 })).rejects.toThrow('Provider offline');
    const pending = await users.findById('company');
    expect(pending).toMatchObject({ status: 'deletion_pending', revision: 1, orgId: 'org' });
    expect(await service.delete('owner', 'company', { confirmation: 'person@example.test', revision: 1 })).toEqual({ id: 'company', deleted: true });
    expect(await users.findById('company')).toMatchObject({ status: 'deleted', orgId: 'org' });
  });
  test('users.delete alone never grants access to delete administrators', async () => {
    await users.update('limited', { permissions: ['users.delete'] });
    await expect(service.delete('limited', 'full', { confirmation: 'full', revision: 1 })).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.listAdmins('limited')).rejects.toMatchObject({ statusCode: 403 });
  });
  test('revoked and missing actors cannot operate even through direct service calls', async () => {
    await users.update('full', { status: 'disabled' });
    await expect(service.create('full', access)).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.delete('missing', 'company', {})).rejects.toMatchObject({ statusCode: 403 });
  });
});
