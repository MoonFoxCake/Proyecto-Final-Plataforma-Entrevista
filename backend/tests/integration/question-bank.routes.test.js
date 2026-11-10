const request = require('supertest');
jest.mock('../../src/config/firebase', () => ({ admin: {}, db: {}, auth: { verifyIdToken: jest.fn(async (uid) => ({ uid })) } }));
const createApp = require('../../src/app');
const { createContainer } = require('../../src/container');
describe('Question bank authorization and history', () => {
  let app, container;
  const path = '/api/v1/admin/question-groups';
  const payload = { name: 'Grupo A', questions: [{ id: 'q1', text: 'Actúo responsablemente.' }] };
  beforeEach(async () => {
    container = createContainer('memory');
    await container.repos.userRepo.create({ uid: 'admin-1', role: 'admin' });
    await container.repos.userRepo.create({ uid: 'company-1', role: 'company', orgId: 'org-1' });
    app = createApp(container);
  });
  const admin = (req) => req.set('Authorization', 'Bearer admin-1');
  test('rejects anonymous and company management, but administrators can create and revise', async () => {
    expect((await request(app).get(path)).status).toBe(401);
    expect((await request(app).get(path).set('Authorization', 'Bearer company-1')).status).toBe(403);
    const created = await admin(request(app).post(path)).send(payload);
    expect(created.status).toBe(200);
    const group = created.body.data;
    expect(group.active).toBe(false);
    const update = await admin(request(app).put(`${path}/${group.id}`)).send({ ...payload, name: 'Grupo actualizado', baseVersion: 1 });
    expect(update.body.data.version).toBe(2);
    expect((await admin(request(app).put(`${path}/${group.id}`)).send({ ...payload, baseVersion: 1 })).status).toBe(409);
    const history = await admin(request(app).get(`${path}/${group.id}/versions`));
    expect(history.body.data.map((v) => v.version)).toEqual([2, 1]);
    expect((await admin(request(app).patch(`${path}/${group.id}/status`)).send({ baseVersion: 2, active: true })).body.data.active).toBe(true);
  });
});
