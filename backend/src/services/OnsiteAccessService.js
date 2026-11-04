const crypto = require('crypto');
const {
  ACCESS_CHANNELS, AUDIT_ACTIONS, CANDIDATE_STATUSES, CREDENTIAL_STATUSES, INVITATION_STATUSES, MODULE_B_STATUSES, MODULES,
} = require('../utils/constants');
const { ExternalServiceError, ValidationError } = require('../utils/errors');
const { isOnsite } = require('../utils/eventModality');
const { entryWindowState, hashAccessCode, isWellFormedAccessCode } = require('../utils/accessCode');
const AccessCredentialService = require('./AccessCredentialService');

// Every failed attempt answers a bit later: slows down automated guessing.
const FAILURE_DELAY_MS = 750;

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

// A code not used yet: printed (GENERATED) or, on older credentials, enabled by hand.
const USABLE = [CREDENTIAL_STATUSES.GENERATED, CREDENTIAL_STATUSES.ENABLED];

// What the candidate is told for a known code that cannot be used now. No
// candidate data is revealed before a successful login.
const STATE_BY_STATUS = Object.freeze({
  [CREDENTIAL_STATUSES.USED]: 'USED',
  [CREDENTIAL_STATUSES.REVOKED]: 'REVOKED',
  [CREDENTIAL_STATUSES.EXPIRED]: 'EXPIRED',
});
// Before / after the appointment's entry window.
const STATE_BY_WINDOW = Object.freeze({ PENDING: 'NOT_YET', CLOSED: 'WINDOW_CLOSED' });

/**
 * Candidate login at the venue with the temporary code printed on their
 * access sheet — no e-mail, password or phone.
 *
 * A code works by itself from the start of the appointment, during its
 * entry window; nobody enables it by hand. A recovery code (replacing one
 * already used) works outside the window, until its expiry, and only on
 * the same computer. The window only limits beginning: the session lasts
 * until the end of the appointment's day.
 *
 * A valid code is consumed (USED) and exchanged for an individual
 * session: an opaque token stored hashed as an `invitations` document with
 * `channel: 'onsite'`, so the evaluation runs through the same access and
 * submission flow as an online invitation (and is closed by the final
 * submission). Consuming the code does not mark the evaluation finished.
 *
 * Failed attempts (unknown or malformed codes) are limited per browser and
 * per IP; each one is also answered with a delay.
 */
class OnsiteAccessService {
  constructor({
    credentialRepo, invitationRepo, candidateRepo, eventService, invitationService, auditRepo, limiter, pepper,
    now = () => new Date(), sleep = wait,
  }) {
    this.credentialRepo = credentialRepo;
    this.invitationRepo = invitationRepo;
    this.candidateRepo = candidateRepo;
    this.eventService = eventService;
    this.invitationService = invitationService;
    this.auditRepo = auditRepo;
    this.limiter = limiter;
    this.pepper = pepper;
    this.now = now;
    this.sleep = sleep;
  }

  /**
   * @param {string} code as typed by the candidate
   * @param {{ ip?: string, clientId?: string }} client who is trying, for the attempt limits
   * @returns {Promise<object>} `{ state: 'VALID', token, module, candidate, event, … }` or
   *   `{ state }` (INVALID, NOT_YET, WINDOW_CLOSED, USED, REVOKED, EXPIRED, COMPLETED,
   *   OTHER_COMPUTER, TOO_MANY_ATTEMPTS with `retryAfterSeconds`)
   */
  async login(code, { ip, clientId } = {}) {
    const keys = [`ip:${ip || 'unknown'}`, ...(clientId ? [`client:${clientId}`] : [])];
    const retryAfterSeconds = this.limiter.retryAfter(keys);
    if (retryAfterSeconds > 0) return { state: 'TOO_MANY_ATTEMPTS', retryAfterSeconds };
    if (!this.pepper) throw new ExternalServiceError('ACCESS_CODE_PEPPER no está configurada en el backend.');

    const fail = async () => {
      this.limiter.recordFailure(keys);
      await this.sleep(FAILURE_DELAY_MS);
      return { state: 'INVALID' };
    };
    if (!isWellFormedAccessCode(code)) return fail();
    const credential = await this.credentialRepo.findByCodeHash(hashAccessCode(code, this.pepper));
    if (!credential) return fail();

    const now = this.now();
    const status = AccessCredentialService.effectiveStatus(credential, now);
    if (!USABLE.includes(status)) return { state: STATE_BY_STATUS[status] || 'INVALID' };

    const { candidate, event } = await this.assignment(credential);
    if (!candidate || !event) return { state: 'INVALID' };
    if (this.completed(candidate, credential.module)) return { state: 'COMPLETED' };
    // A code replacing one already used works only on that computer (D7).
    if (credential.requiredClientId && credential.requiredClientId !== clientId) {
      await this.audit(credential, now, AUDIT_ACTIONS.ONSITE_LOGIN_OTHER_COMPUTER);
      return { state: 'OTHER_COMPUTER' };
    }
    if (!credential.recovery) {
      // The current appointment, so a rescheduled session moves its window too.
      const appointment = credential.module === MODULES.A ? event.onsite : candidate.moduleB?.citation?.appointment;
      if (!appointment?.startsAt) return { state: 'INVALID' };
      const windowState = entryWindowState(appointment, now);
      if (windowState !== 'OPEN') return { state: STATE_BY_WINDOW[windowState] };
    }

    try {
      await this.consume(credential, now, clientId);
    } catch (error) {
      if (error.accessState) return { state: error.accessState };
      throw error;
    }

    let token;
    try {
      token = await this.openSession(credential, now, clientId);
    } catch (error) {
      // No session could be opened: give the code back so it can be retried.
      await this.credentialRepo.update(credential.id, () => ({ status: credential.status, usedAt: null, usedByClient: null })).catch(() => {});
      throw error;
    }
    await this.audit(credential, now, AUDIT_ACTIONS.ONSITE_SESSION_STARTED);

    const access = await this.invitationService.validateAccess(token);
    return access.state === 'VALID' ? { ...access, token } : access;
  }

  async assignment(credential) {
    const candidate = await this.candidateRepo.findById(credential.candidateId);
    let event;
    try {
      event = await this.eventService.getEvent(credential.eventId, credential.orgId);
    } catch {
      return {};
    }
    const valid = candidate && candidate.eventId === event.id && candidate.orgId === credential.orgId && isOnsite(event)
      && (credential.module !== MODULES.B || event.moduleB?.macrocase);
    return valid ? { candidate, event } : {};
  }

  completed(candidate, module) {
    return module === MODULES.A
      ? candidate.status === CANDIDATE_STATUSES.EVALUATION_COMPLETED || Boolean(candidate.submittedAt)
      : candidate.moduleB?.status === MODULE_B_STATUSES.COMPLETED;
  }

  /**
   * Unused → USED atomically: two logins with the same code cannot both
   * succeed. Remembers which browser used it, so a replacement code is
   * bound to the same computer.
   */
  async consume(credential, now, clientId) {
    await this.credentialRepo.update(credential.id, (current) => {
      const status = AccessCredentialService.effectiveStatus(current, now);
      if (!USABLE.includes(status)) {
        throw Object.assign(new ValidationError('El acceso ya no está disponible.'), { accessState: STATE_BY_STATUS[status] || 'INVALID' });
      }
      return { status: CREDENTIAL_STATUSES.USED, usedAt: now, usedByClient: clientId };
    });
  }

  /**
   * Opens the candidate's session, valid until the code's own expiry (end of
   * the appointment day). Any other open session for the same evaluation is
   * cancelled: only one at a time.
   */
  async openSession(credential, now, clientId) {
    const previous = await this.invitationRepo.findActiveByCandidate(credential.candidateId, credential.eventId, credential.module);
    if (previous) {
      await this.invitationRepo.update(previous.id, { status: INVITATION_STATUSES.CANCELLED, cancelledAt: now });
    }
    const token = crypto.randomBytes(32).toString('base64url');
    await this.invitationRepo.create({
      candidateId: credential.candidateId,
      eventId: credential.eventId,
      orgId: credential.orgId,
      module: credential.module,
      channel: ACCESS_CHANNELS.ONSITE,
      credentialId: credential.id,
      clientId,
      tokenHash: hashToken(token),
      status: INVITATION_STATUSES.ACTIVE,
      availableAt: now,
      expiresAt: credential.expiresAt,
    });
    return token;
  }

  /** `recovery`: the code replaces another one, i.e. an interrupted evaluation resumes. */
  async audit(credential, now, action) {
    try {
      await this.auditRepo.record({
        orgId: credential.orgId,
        eventId: credential.eventId,
        candidateId: credential.candidateId,
        module: credential.module,
        credentialId: credential.id,
        action,
        actorUid: null,
        at: now,
        ...(credential.replacesId ? { recovery: true, replacesId: credential.replacesId } : {}),
      });
    } catch (error) {
      console.error(`No se pudo registrar ${action} de la credencial ${credential.id}:`, error.message);
    }
  }
}

module.exports = OnsiteAccessService;
