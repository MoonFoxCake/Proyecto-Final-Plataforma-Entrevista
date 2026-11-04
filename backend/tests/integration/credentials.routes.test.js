const request = require('supertest');

// Firebase Auth is replaced: the Bearer token is the uid. Everything else is
// the real app with in-memory repositories.
jest.mock('../../src/config/firebase', () => ({
  admin: {},
  db: {},
  auth: { verifyIdToken: jest.fn(async (token) => ({ uid: token })) },
}));

const createApp = require('../../src/app');
const { createContainer } = require('../../src/container');

describe('/api/v1/events/:eventId/credentials', () => {
  let app;
  let container;
  let event;
  let candidate;

  beforeEach(async () => {
    process.env.ACCESS_CODE_PEPPER = 'secreto-de-prueba-con-32-caracteres!!';
    container = createContainer('memory');
    const { repos } = container;
    await repos.userRepo.create({ uid: 'company-1', role: 'company', orgId: 'org-1' });
    await repos.userRepo.create({ uid: 'company-2', role: 'company', orgId: 'org-2' });
    await repos.userRepo.create({ uid: 'admin-1', role: 'admin', orgId: null });
    const startsAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    event = await repos.eventRepo.create({
      orgId: 'org-1', name: 'Concurso Presencial', modality: 'onsite', modules: ['A'],
      onsite: { venue: 'Campus', room: 'Aula 1', startsAt, endsAt: new Date(startsAt.getTime() + 7200000) },
    });
    candidate = await repos.candidateRepo.create({ eventId: event.id, orgId: 'org-1', nombreCompleto: 'María', status: 'CITED' });
    app = createApp(container);
  });

  afterEach(() => { delete process.env.ACCESS_CODE_PEPPER; });

  const as = (uid) => ({ Authorization: `Bearer ${uid}` });
  const url = () => `/api/v1/events/${event.id}/credentials`;

  test('the company issues codes once, in a response that must not be cached', async () => {
    const response = await request(app).post(url()).set(as('company-1')).send({ modulo: 'A', candidateIds: [candidate.id] });

    expect(response.status).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.data.issued).toEqual([expect.objectContaining({ candidateId: candidate.id, code: expect.stringMatching(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/) })]);

    const summary = await request(app).get(url()).set(as('company-1'));
    expect(summary.status).toBe(200);
    expect(summary.body.data.modules[0].rows[0].credential.status).toBe('GENERATED');
    expect(JSON.stringify(summary.body)).not.toContain(response.body.data.issued[0].code);
    expect(JSON.stringify(summary.body)).not.toContain('codeHash');
  });

  test('another organization, an admin or an anonymous caller cannot reach the credentials', async () => {
    expect((await request(app).get(url()).set(as('company-2'))).status).toBe(404);
    expect((await request(app).post(url()).set(as('company-2')).send({ modulo: 'A', candidateIds: [candidate.id] })).status).toBe(404);
    expect((await request(app).get(url()).set(as('admin-1'))).status).toBe(403);
    expect((await request(app).get(url())).status).toBe(401);
    expect(container.repos.accessCredentialRepo.data).toEqual([]);
  });

  test('validates the request body', async () => {
    const bad = await request(app).post(url()).set(as('company-1')).send({ modulo: 'C', candidateIds: [] });
    expect(bad.status).toBe(400);
    const extra = await request(app).post(url()).set(as('company-1')).send({ modulo: 'A', candidateIds: [candidate.id], codigo: 'AAAAA-AAAAA' });
    expect(extra.status).toBe(400);
  });

  test('the cards PDF arrives with the codes; the attendance list downloads as a PDF for the company only', async () => {
    const issued = await request(app).post(url()).set(as('company-1')).send({ modulo: 'A', candidateIds: [candidate.id], papel: 'A4' });
    expect(Buffer.from(issued.body.data.cardsPdf.base64, 'base64').subarray(0, 5).toString()).toBe('%PDF-');

    await container.repos.candidateRepo.update(candidate.id, { citation: { status: 'SENT' } });
    const sheet = await request(app).get(`${url()}/attendance.pdf?modulo=A&papel=CARTA`).set(as('company-1')).buffer(true).parse((res, done) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => done(null, Buffer.concat(chunks)));
    });
    expect(sheet.status).toBe(200);
    expect(sheet.headers['content-type']).toBe('application/pdf');
    expect(sheet.headers['content-disposition']).toMatch(/^attachment; filename="lista-asistencia-concurso-presencial-modulo-a\.pdf"$/);
    expect(sheet.headers['cache-control']).toBe('no-store');
    expect(sheet.body.subarray(0, 5).toString()).toBe('%PDF-');

    expect((await request(app).get(`${url()}/attendance.pdf`).set(as('company-2'))).status).toBe(404);
    expect((await request(app).get(`${url()}/attendance.pdf?modulo=Z`).set(as('company-1'))).status).toBe(400);
  });

  test('applicator panel: any company user of the organization, never another organization', async () => {
    // The appointment is today, so attendance and enabling are allowed.
    await container.repos.eventRepo.update(event.id, {
      onsite: { ...event.onsite, startsAt: new Date(), endsAt: new Date(Date.now() + 3600000) },
    });
    await container.repos.userRepo.create({ uid: 'company-1b', role: 'company', orgId: 'org-1' });
    await container.repos.candidateRepo.update(candidate.id, { citation: { status: 'SENT' } });
    await request(app).post(url()).set(as('company-1')).send({ modulo: 'A', candidateIds: [candidate.id] });
    const onsite = `/api/v1/events/${event.id}/onsite`;

    expect((await request(app).get(`${onsite}?modulo=A`).set(as('company-2'))).status).toBe(404);
    expect((await request(app).post(`${onsite}/attendance`).set(as('company-2')).send({ modulo: 'A', candidateId: candidate.id, presente: true })).status).toBe(404);
    expect((await request(app).post(`${onsite}/attendance`).set(as('admin-1')).send({ modulo: 'A', candidateId: candidate.id, presente: true })).status).toBe(403);
    // There is no manual enabling any more.
    expect((await request(app).post(`${onsite}/enable`).set(as('company-1')).send({ modulo: 'A', candidateIds: [candidate.id] })).status).toBe(404);
    expect((await request(app).post(`${onsite}/attendance`).set(as('company-1')).send({ modulo: 'A', candidateId: candidate.id })).status).toBe(400);

    // Another user of the same company acts as applicator.
    const marked = await request(app).post(`${onsite}/attendance`).set(as('company-1b')).send({ modulo: 'A', candidateId: candidate.id, presente: true });
    expect(marked.status).toBe(200);
    expect(marked.body.data).toMatchObject({ status: 'PRESENT', markedBy: 'company-1b' });

    const roster = await request(app).get(`${onsite}?modulo=A`).set(as('company-1'));
    expect(roster.status).toBe(200);
    expect(roster.body.data.rows[0]).toMatchObject({ attendance: { status: 'PRESENT' }, credential: { status: 'GENERATED' }, accessWindow: { state: 'OPEN' } });
  });

  test('revoke and reissue go through the same checks', async () => {
    const issued = await request(app).post(url()).set(as('company-1')).send({ modulo: 'A', candidateIds: [candidate.id] });
    const { credentialId } = issued.body.data.issued[0];

    expect((await request(app).post(`${url()}/${credentialId}/revoke`).set(as('company-2')).send({})).status).toBe(404);

    const reissued = await request(app).post(`${url()}/${credentialId}/reissue`).set(as('company-1')).send({ motivo: 'Tarjeta extraviada' });
    expect(reissued.status).toBe(201);
    expect(reissued.headers['cache-control']).toBe('no-store');
    expect(reissued.body.data.issued[0].code).not.toBe(issued.body.data.issued[0].code);
  });
});
