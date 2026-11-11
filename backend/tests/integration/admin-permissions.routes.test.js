const request = require('supertest');
jest.mock('../../src/config/firebase', () => ({ admin: {}, db: {}, auth: {
  verifyIdToken: jest.fn(async (uid) => ({ uid, role: 'admin', adminAccess: 'full' })),
  createUser: jest.fn(async () => ({ uid: 'new-admin' })), setCustomUserClaims: jest.fn(), deleteUser: jest.fn(),
} }));
const createApp = require('../../src/app');
const { createContainer } = require('../../src/container');
const { auth } = require('../../src/config/firebase');

describe('Persisted administrative authorization', () => {
  let app, container;
  const call = (method, path, uid = 'restricted') => request(app)[method](`/api/v1${path}`).set('Authorization', `Bearer ${uid}`);
  beforeEach(async () => {
    jest.clearAllMocks();
    container = createContainer('memory');
    await container.repos.userRepo.initializeOwner('owner', { username: 'owner' });
    await container.repos.userRepo.create({ uid: 'restricted', role: 'admin', adminAccess: 'restricted', permissions: ['questions.manage'] });
    await container.repos.userRepo.create({ uid: 'full', role: 'admin', adminAccess: 'full' });
    await container.repos.userRepo.create({ uid: 'legacy', role: 'admin' });
    await container.repos.userRepo.create({ uid: 'company', role: 'company', orgId: 'org' });
    app = createApp(container);
  });
  test('reads current grants on every request and ignores stale elevated token claims', async () => {
    expect((await call('get', '/admin/question-groups')).status).toBe(200);
    expect((await call('get', '/admin/accounts')).status).toBe(403);
    expect((await call('get', '/macrocasos')).status).toBe(403);
    expect((await call('get', '/microcasos')).status).toBe(403);
    expect((await call('get', '/admin/results/pending')).status).toBe(403);
    await container.repos.userRepo.update('restricted', { permissions: [] });
    expect((await call('get', '/admin/question-groups')).status).toBe(403);
    expect(auth.verifyIdToken).toHaveBeenCalledWith('restricted', true);
  });
  test.each(['disabled', 'deleted', 'deletion_pending'])('blocks %s accounts on all authenticated endpoints', async (status) => {
    await container.repos.userRepo.update('full', { status });
    expect((await call('get', '/auth/me', 'full')).status).toBe(403);
    expect((await call('get', '/admin/accounts', 'full')).status).toBe(403);
  });
  test('legacy admins and company identities cannot use administrative management', async () => {
    for (const uid of ['legacy', 'company']) {
      expect((await call('get', '/admin/accounts', uid)).status).toBe(403);
      expect((await call('post', '/admin/accounts', uid).send({})).status).toBe(403);
    }
    expect(auth.createUser).not.toHaveBeenCalled();
  });
  test('viewing results and delivering them are separate permissions', async () => {
    const pdf = (uid) => call('post', '/admin/results/missing/A', uid).attach('pdf', Buffer.from('%PDF-1.4'), { filename: 'r.pdf', contentType: 'application/pdf' });
    await container.repos.userRepo.update('restricted', { permissions: ['results.view'] });
    expect((await call('get', '/admin/processes')).status).toBe(200);
    expect((await call('get', '/admin/processes/missing')).status).toBe(404);
    expect((await call('get', '/admin/results/missing/A/download')).status).toBe(404);
    expect((await pdf()).status).toBe(403);
    expect((await call('patch', '/admin/processes/missing/participants/anon').send({})).status).toBe(403);
    await container.repos.userRepo.update('restricted', { permissions: ['results.deliver'] });
    expect((await pdf()).status).toBe(404);
    expect((await call('patch', '/admin/processes/missing/participants/anon').send({})).status).toBe(404);
  });

  test('admins cannot publish or close phases: those routes no longer exist', async () => {
    expect((await call('post', '/admin/processes/missing/publish', 'full')).status).toBe(404);
    expect((await call('post', '/admin/processes/missing/phases/A/close', 'full')).status).toBe(404);
  });

  test('accounts saved with the old permission ids keep the same access', async () => {
    await container.repos.userRepo.update('restricted', { permissions: ['processes.view', 'evaluations.publish'] });
    expect((await call('get', '/admin/processes/missing')).status).toBe(404);
    expect((await call('get', '/admin/results/missing/B/download')).status).toBe(404);
    const owner = await call('get', '/admin/accounts', 'owner');
    expect(owner.body.data.accounts.find((account) => account.id === 'restricted').permissions).toEqual(['results.view', 'results.deliver']);
  });
  test('closes the legacy role escalation endpoint even to full administrators', async () => {
    expect((await call('post', '/auth/set-role', 'full').send({ uid: 'company', role: 'admin' })).status).toBe(403);
    const owner = await call('post', '/auth/set-role', 'owner').send({ uid: 'company', role: 'admin' });
    expect(owner.status).toBe(403);
    expect((await container.repos.userRepo.findById('company')).role).toBe('company');
  });
  test('prevents public registration from claiming a reserved admin username', async () => {
    const response = await request(app).post('/api/v1/auth/register').send({
      companyName: 'Test Company', industry: 'Technology', companySize: '1-10', country: 'Guatemala', city: 'Guatemala', companyPhone: '+50255550000',
      displayName: 'Some Person', contactRole: 'Owner', contactPhone: '+50255550000',
      email: 'owner@admin.nexoperfil.invalid', password: 'Password-1234', acceptTerms: true,
    });
    expect([400, 403]).toContain(response.status);
    expect(response.body.error.message).toContain('reservado');
    expect(auth.createUser).not.toHaveBeenCalled();
  });
  test('returns credentials only on creation and never caches management responses', async () => {
    const response = await call('post', '/admin/accounts', 'owner').send({ username: 'reviewer', displayName: 'Reviewer One', adminAccess: 'restricted', permissions: ['results.view'] });
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.data.temporaryPassword).toBeTruthy();
    const list = await call('get', '/admin/accounts', 'owner');
    expect(list.body.data.accounts.find((account) => account.id === 'new-admin').temporaryPassword).toBeUndefined();
  });
});
