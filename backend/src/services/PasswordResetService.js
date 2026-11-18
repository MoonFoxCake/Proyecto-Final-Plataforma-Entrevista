/**
 * Password recovery for company accounts.
 *
 * Firebase creates the one-time code; the e-mail is ours (Resend, from the
 * platform's own address, in Spanish) and its link opens the frontend's
 * /reset-password page directly, so the flow never depends on the action
 * URL configured in the Firebase console.
 *
 * The answer is the same whether the account exists or not, so the form
 * cannot be used to find out who has an account.
 */
const ADMIN_EMAIL_DOMAIN = '@admin.nexoperfil.invalid';
const MINUTE_MS = 60 * 1000;

/** Requests per address and per IP, counted whether the account exists or not. */
const PASSWORD_RESET_LIMITS = {
  email: { max: 3, windowMs: 15 * MINUTE_MS },
  ip: { max: 20, windowMs: 15 * MINUTE_MS },
};

class PasswordResetService {
  /**
   * @param {{ identity: { generatePasswordResetLink(email: string, settings?: object): Promise<string> },
   *   emailService: { sendPasswordReset(params: { email: string, url: string }): Promise<unknown> },
   *   frontendUrl?: string, limiter: import('../utils/AttemptLimiter') }} deps
   */
  constructor({ identity, emailService, frontendUrl, limiter }) {
    this.identity = identity;
    this.emailService = emailService;
    this.frontendUrl = (frontendUrl || '').replace(/\/+$/, '');
    this.limiter = limiter;
  }

  /**
   * Sends the recovery e-mail if `email` belongs to an account.
   *
   * @param {string} email
   * @param {{ ip?: string }} [client]
   * @returns {Promise<{ state: 'SENT' } | { state: 'TOO_MANY_REQUESTS', retryAfterSeconds: number }>}
   *   SENT also when there is no such account.
   */
  async request(email, { ip } = {}) {
    const address = email.trim().toLowerCase();
    const keys = [`email:${address}`, `ip:${ip || 'unknown'}`];
    const retryAfterSeconds = this.limiter.retryAfter(keys);
    if (retryAfterSeconds > 0) return { state: 'TOO_MANY_REQUESTS', retryAfterSeconds };
    this.limiter.recordFailure(keys);

    // Administrators sign in with a username; the owner resets their password.
    if (address.endsWith(ADMIN_EMAIL_DOMAIN)) return { state: 'SENT' };

    let link;
    try {
      link = await this.identity.generatePasswordResetLink(address, { url: `${this.frontendUrl}/login` });
    } catch (error) {
      if (error?.code === 'auth/user-not-found' || error?.code === 'auth/email-not-found') return { state: 'SENT' };
      throw error;
    }

    const oobCode = new URL(link).searchParams.get('oobCode');
    const url = `${this.frontendUrl}/reset-password?mode=resetPassword&oobCode=${encodeURIComponent(oobCode)}`;
    await this.emailService.sendPasswordReset({ email: address, url });
    return { state: 'SENT' };
  }
}

module.exports = { PasswordResetService, PASSWORD_RESET_LIMITS };
