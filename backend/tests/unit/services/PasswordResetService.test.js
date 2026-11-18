const { PasswordResetService, PASSWORD_RESET_LIMITS } = require('../../../src/services/PasswordResetService');
const AttemptLimiter = require('../../../src/utils/AttemptLimiter');

const LINK = 'https://nexo-prueba.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=CODE%2Fwith+chars&apiKey=k&lang=es';

function build({ generate } = {}) {
  let now = 0;
  const identity = { generatePasswordResetLink: jest.fn(generate || (async () => LINK)) };
  const emailService = { sendPasswordReset: jest.fn(async () => ({ id: 'mail' })) };
  const limiter = new AttemptLimiter({ rules: PASSWORD_RESET_LIMITS, now: () => now });
  const service = new PasswordResetService({ identity, emailService, frontendUrl: 'https://app.example.com/', limiter });
  return { service, identity, emailService, advance: (ms) => { now += ms; } };
}

test('e-mails a link to the platform page with Firebase one-time code', async () => {
  const { service, identity, emailService } = build();
  await expect(service.request(' Persona@Empresa.com ', { ip: '1.1.1.1' })).resolves.toEqual({ state: 'SENT' });
  expect(identity.generatePasswordResetLink).toHaveBeenCalledWith('persona@empresa.com', { url: 'https://app.example.com/login' });
  expect(emailService.sendPasswordReset).toHaveBeenCalledWith({
    email: 'persona@empresa.com',
    url: 'https://app.example.com/reset-password?mode=resetPassword&oobCode=CODE%2Fwith%20chars',
  });
});

test('answers the same when there is no such account, without sending anything', async () => {
  const { service, emailService } = build({ generate: async () => { throw Object.assign(new Error('none'), { code: 'auth/user-not-found' }); } });
  await expect(service.request('nadie@empresa.com')).resolves.toEqual({ state: 'SENT' });
  expect(emailService.sendPasswordReset).not.toHaveBeenCalled();
});

test('never sends links for administrator usernames', async () => {
  const { service, identity } = build();
  await expect(service.request('owner@admin.nexoperfil.invalid')).resolves.toEqual({ state: 'SENT' });
  expect(identity.generatePasswordResetLink).not.toHaveBeenCalled();
});

test('other failures reach the caller', async () => {
  const { service } = build({ generate: async () => { throw new Error('Firebase caído'); } });
  await expect(service.request('persona@empresa.com')).rejects.toThrow('Firebase caído');
});

test('limits requests per address, also for addresses without an account', async () => {
  const { service, emailService, advance } = build();
  for (let i = 0; i < 3; i += 1) await service.request('persona@empresa.com', { ip: '1.1.1.1' });
  const blocked = await service.request('PERSONA@empresa.com', { ip: '2.2.2.2' });
  expect(blocked.state).toBe('TOO_MANY_REQUESTS');
  expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  expect(emailService.sendPasswordReset).toHaveBeenCalledTimes(3);
  // Another address from the same place still works, and the limit clears.
  await expect(service.request('otra@empresa.com', { ip: '1.1.1.1' })).resolves.toEqual({ state: 'SENT' });
  advance(PASSWORD_RESET_LIMITS.email.windowMs + 1);
  await expect(service.request('persona@empresa.com', { ip: '1.1.1.1' })).resolves.toEqual({ state: 'SENT' });
});
