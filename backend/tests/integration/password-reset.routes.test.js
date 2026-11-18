/**
 * POST /auth/password-reset through the real Express app: public, validated,
 * same answer whether the account exists, 429 when asked too often. Firebase
 * Auth and the Resend API are replaced (no e-mail is sent).
 */
const request = require('supertest');

const mockGenerateLink = jest.fn();
jest.mock('../../src/config/firebase', () => ({
  admin: {},
  db: {},
  auth: {
    verifyIdToken: jest.fn(async (token) => ({ uid: token })),
    generatePasswordResetLink: (...args) => mockGenerateLink(...args),
  },
}));

const createApp = require('../../src/app');
const { createContainer } = require('../../src/container');

const URL_PATH = '/api/v1/auth/password-reset';

describe('POST /auth/password-reset', () => {
  const sent = [];
  let app;

  beforeAll(() => {
    process.env.FRONTEND_URL = 'https://app.example.com';
    process.env.RESEND_API_KEY = 'test-key';
    global.fetch = jest.fn(async (url, options) => {
      sent.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ id: `mail-${sent.length}` }) };
    });
    app = createApp(createContainer('memory'));
  });

  beforeEach(() => {
    sent.length = 0;
    mockGenerateLink.mockReset();
  });

  test('sends our own e-mail with a link to the reset page', async () => {
    mockGenerateLink.mockResolvedValue('https://x.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=ABC123&apiKey=k');
    const res = await request(app).post(URL_PATH).send({ email: 'persona@empresa.com' });
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ data: { sent: true } });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toEqual(['persona@empresa.com']);
    expect(sent[0].html).toContain('https://app.example.com/reset-password?mode=resetPassword&amp;oobCode=ABC123');
  });

  test('unknown accounts get the same answer and no e-mail', async () => {
    mockGenerateLink.mockRejectedValue(Object.assign(new Error('none'), { code: 'auth/user-not-found' }));
    const res = await request(app).post(URL_PATH).send({ email: 'nadie@empresa.com' });
    expect(res.status).toBe(202);
    expect(sent).toHaveLength(0);
  });

  test('rejects an invalid address', async () => {
    const res = await request(app).post(URL_PATH).send({ email: 'no-es-correo' });
    expect(res.status).toBe(400);
    expect(mockGenerateLink).not.toHaveBeenCalled();
  });

  test('too many requests for one address answer 429 with Retry-After', async () => {
    mockGenerateLink.mockResolvedValue('https://x.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=ABC');
    for (let i = 0; i < 3; i += 1) await request(app).post(URL_PATH).send({ email: 'repetida@empresa.com' });
    const res = await request(app).post(URL_PATH).send({ email: 'repetida@empresa.com' });
    expect(res.status).toBe(429);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    expect(sent).toHaveLength(3);
  });
});
