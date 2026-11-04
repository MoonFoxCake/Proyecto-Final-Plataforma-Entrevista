const AttemptLimiter = require('../../../src/utils/AttemptLimiter');

describe('AttemptLimiter', () => {
  let clock;
  let limiter;

  beforeEach(() => {
    clock = { ms: 0 };
    limiter = new AttemptLimiter({
      rules: { client: { max: 3, windowMs: 60_000 }, ip: { max: 5, windowMs: 120_000 } },
      now: () => clock.ms,
    });
  });

  test('blocks a key after its limit until the oldest failure leaves the window', () => {
    for (let index = 0; index < 3; index += 1) {
      expect(limiter.retryAfter(['client:a'])).toBe(0);
      limiter.recordFailure(['client:a']);
      clock.ms += 10_000;
    }
    // Failures at 0 s, 10 s and 20 s; now 30 s → allowed again at 60 s.
    expect(limiter.retryAfter(['client:a'])).toBe(30);
    clock.ms = 60_001;
    expect(limiter.retryAfter(['client:a'])).toBe(0);
  });

  test('keys are independent, and the strictest blocked key decides', () => {
    for (let index = 0; index < 3; index += 1) limiter.recordFailure(['client:a', 'ip:1.1.1.1']);
    expect(limiter.retryAfter(['client:b', 'ip:1.1.1.1'])).toBe(0);
    expect(limiter.retryAfter(['client:a', 'ip:1.1.1.1'])).toBe(60);

    for (let index = 0; index < 2; index += 1) limiter.recordFailure(['client:b', 'ip:1.1.1.1']);
    // The IP reached 5 failures: blocked for every client behind it.
    expect(limiter.retryAfter(['client:c', 'ip:1.1.1.1'])).toBe(120);
    expect(limiter.retryAfter(['client:c', 'ip:2.2.2.2'])).toBe(0);
  });
});
