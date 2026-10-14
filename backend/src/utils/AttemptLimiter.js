/**
 * Counts failed attempts per key (e.g. `ip:…`, `client:…`) in a sliding
 * window and blocks a key that exceeds its limit until the window clears.
 *
 * In memory: the backend runs as a single instance (Render free plan). With
 * several instances this would need a shared store.
 *
 * @example
 *   const limiter = new AttemptLimiter({ rules: { ip: { max: 30, windowMs: 600000 } } });
 *   limiter.retryAfter(['ip:1.2.3.4']) // 0 → allowed
 *   limiter.recordFailure(['ip:1.2.3.4'])
 */
const MAX_TRACKED_KEYS = 10_000;

class AttemptLimiter {
  /**
   * @param {{ rules: Record<string, { max: number, windowMs: number }>, now?: () => number }} options
   *   `rules` by key prefix (the part before the first `:`).
   */
  constructor({ rules, now = () => Date.now() }) {
    this.rules = rules;
    this.now = now;
    this.failures = new Map(); // key → timestamps (ms)
  }

  ruleFor(key) {
    return this.rules[key.split(':')[0]];
  }

  recent(key) {
    const rule = this.ruleFor(key);
    const since = this.now() - rule.windowMs;
    const recent = (this.failures.get(key) || []).filter((at) => at > since);
    if (recent.length) this.failures.set(key, recent);
    else this.failures.delete(key);
    return recent;
  }

  /** Seconds until every given key is allowed again (0 = allowed now). */
  retryAfter(keys) {
    let waitMs = 0;
    for (const key of keys) {
      const rule = this.ruleFor(key);
      const recent = this.recent(key);
      if (recent.length >= rule.max) {
        // Allowed again when the oldest counted failure leaves the window.
        waitMs = Math.max(waitMs, recent[recent.length - rule.max] + rule.windowMs - this.now());
      }
    }
    return Math.ceil(waitMs / 1000);
  }

  recordFailure(keys) {
    const at = this.now();
    for (const key of keys) this.failures.set(key, [...this.recent(key), at]);
    // Keys that never come back would otherwise accumulate.
    if (this.failures.size > MAX_TRACKED_KEYS) {
      for (const key of [...this.failures.keys()]) this.recent(key);
    }
  }
}

module.exports = AttemptLimiter;
