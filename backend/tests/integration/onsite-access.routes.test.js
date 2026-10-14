const request = require('supertest');

jest.mock('../../src/config/firebase', () => ({
  admin: {},
  db: {},
  auth: { verifyIdToken: jest.fn(async (token) => ({ uid: token })) },
}));

const createApp = require('../../src/app');
const { createContainer } = require('../../src/container');

describe('POST /api/v1/onsite/access (public)', () => {
  let app;
  let container;
  let code;

  beforeEach(async () => {
    process.env.ACCESS_CODE_PEPPER = 'secreto-de-prueba-con-32-caracteres!!';
    container = createContainer('memory');
    const { repos } = container;
    await repos.userRepo.create({ uid: 'company-1', role: 'company', orgId: 'org-1' });
    // The appointment is today.
    const startsAt = new Date();
    const event = await repos.eventRepo.create({
      orgId: 'org-1', name: 'Concurso Presencial', modality: 'onsite', modules: ['A'],
      onsite: { venue: 'Campus', room: 'Aula 1', startsAt, endsAt: new Date(startsAt.getTime() + 7200000) },
    });
    const candidate = await repos.candidateRepo.create({
      eventId: event.id, orgId: 'org-1', nombreCompleto: 'María', status: 'CITED', citation: { status: 'SENT' },
    });
    const { issued } = await container.accessCredentialService.issueBatch(event.id, 'org-1', { module: 'A', candidateIds: [candidate.id] }, 'company-1');
    code = issued[0].code;
    await container.onsiteApplicationService.setAttendance(event.id, 'org-1', { module: 'A', candidateId: candidate.id, present: true }, 'company-1');
    await container.onsiteApplicationService.enable(event.id, 'org-1', { module: 'A', candidateIds: [candidate.id] }, 'company-1');
    container.onsiteAccessService.sleep = async () => {};
    app = createApp(container);
  });

  afterEach(() => { delete process.env.ACCESS_CODE_PEPPER; });

  const login = (codigo, headers = {}) => request(app).post('/api/v1/onsite/access').set(headers).send({ codigo });

  test('needs no account: the code alone opens the session, in a response that is not cached', async () => {
    const response = await login(code);
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.data).toMatchObject({ state: 'VALID', module: 'A', candidate: { nombreCompleto: 'María' } });

    // The session token opens the evaluation through the existing access check.
    const access = await request(app).get('/api/v1/invitations/access').query({ token: response.body.data.token });
    expect(access.body.data).toMatchObject({ state: 'VALID', module: 'A' });
  });

  test('accepts only the code', async () => {
    expect((await request(app).post('/api/v1/onsite/access').send({ codigo: code, correo: 'x@y.z' })).status).toBe(400);
  });

  test('too many wrong codes from one browser → 429 with Retry-After; other computers keep working', async () => {
    const browser = { 'X-Onsite-Client': 'browser-aaaa-1', 'X-Forwarded-For': '203.0.113.7' };
    for (let index = 0; index < 5; index += 1) {
      expect((await login('AAAAA-AAAAA', browser)).body.data).toEqual({ state: 'INVALID' });
    }
    const blocked = await login(code, browser);
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(blocked.body.data.state).toBe('TOO_MANY_ATTEMPTS');

    const other = await login(code, { 'X-Onsite-Client': 'browser-bbbb-2', 'X-Forwarded-For': '203.0.113.7' });
    expect(other.body.data.state).toBe('VALID');
  });

  test('the IP limit uses the caller address behind the proxy', async () => {
    for (let index = 0; index < 40; index += 1) {
      await login('AAAAA-AAAAA', { 'X-Onsite-Client': `browser-${String(index).padStart(4, '0')}`, 'X-Forwarded-For': '198.51.100.1' });
    }
    expect((await login(code, { 'X-Onsite-Client': 'browser-fresh-1', 'X-Forwarded-For': '198.51.100.1' })).status).toBe(429);
    expect((await login(code, { 'X-Onsite-Client': 'browser-fresh-2', 'X-Forwarded-For': '198.51.100.2' })).body.data.state).toBe('VALID');
  });
});
