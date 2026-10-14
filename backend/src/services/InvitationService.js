const crypto = require('crypto');
const {
  CANDIDATE_STATUSES, INVITATION_STATUSES, MODULES, MODULE_B_STATUSES, CITATION_STATUSES, ACCESS_CHANNELS,
} = require('../utils/constants');
const { ValidationError } = require('../utils/errors');
const {
  MACROCASE_SCHEMA_VERSION, toSectionedMacrocase, publicOverview, stageView, applyAction, finalAnswers,
} = require('../utils/macrocase');
const { isOnsite, modulesOf, toAppointment } = require('../utils/eventModality');

const DAY_MS = 24 * 60 * 60 * 1000;
// Module B is sent once Module A results are out, so it is available right
// away and stays open for a few days.
const MODULE_B_VALIDITY_MS = 3 * DAY_MS;
// Resend allows about 2 requests per second.
const STATUS_CHECK_DELAY_MS = 600;

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

function completedModuleA(candidate) {
  return Boolean(candidate.submittedAt || candidate.status === CANDIDATE_STATUSES.EVALUATION_COMPLETED);
}

/** Module A answered, reviewed and published: the company has the profile to decide. */
function eligibleForModuleB(candidate) {
  return completedModuleA(candidate)
    && candidate.reviewStatus === 'REVIEWED'
    && candidate.moduleB?.status !== MODULE_B_STATUSES.COMPLETED;
}

/** Module B progress belongs to the evaluation, not to one link: a resent link resumes it. */
const progressIdOf = (invitation) => `${invitation.eventId}_${invitation.candidateId}_${invitation.module || MODULES.A}`;

class InvitationService {
  constructor({
    invitationRepo, candidateService, candidateRepo, eventService, organizationRepo, emailService, frontendUrl,
    macrocaseService, sleep = wait, now = () => new Date(),
  }) {
    this.now = now;
    this.invitationRepo = invitationRepo;
    this.candidateService = candidateService;
    this.candidateRepo = candidateRepo;
    this.eventService = eventService;
    this.organizationRepo = organizationRepo;
    this.emailService = emailService;
    this.frontendUrl = frontendUrl;
    this.macrocaseService = macrocaseService;
    this.sleep = sleep;
  }

  /**
   * Module A: contacts every candidate still pending. Online events send
   * the access link; onsite events send a citation to the venue instead,
   * without any link or code (access is handed out there).
   */
  async publishForEvent(eventId, orgId) {
    const event = await this.eventService.getEvent(eventId, orgId);
    const onsite = isOnsite(event);
    if (!onsite) this.requireFrontendUrl();
    const candidates = await this.candidateService.listByEvent(eventId, orgId);
    const pending = candidates.filter((item) => item.status === CANDIDATE_STATUSES.INVITED_PENDING);
    const organization = await this.organizationRepo.findById(orgId);
    const results = [];

    for (const candidate of pending) {
      results.push(onsite
        ? await this.citeOne({ candidate, event, organization, module: MODULES.A, appointment: event.onsite })
        : await this.publishOne({ candidate, event, organization, orgId, module: MODULES.A }));
    }

    return this.summarize(results);
  }

  /**
   * Module B: sends the macrocase to the candidates the company selected
   * after reading their Module A profile. The first time, one of the active
   * macrocases of the bank is picked at random and copied into the event, so
   * every candidate of the process gets the same case and later edits in the
   * bank do not change it. Sending again to a candidate
   * who has not answered yet replaces their previous link.
   *
   * Onsite events cite the candidates to a Module B session instead
   * (`citation`: venue and time); Module B needs Module A reviewed and
   * published first, so it cannot share Module A's appointment.
   */
  async sendModuleB(eventId, orgId, candidateIds, citation) {
    let event = await this.eventService.getEvent(eventId, orgId);
    const onsite = isOnsite(event);
    if (!modulesOf(event).includes(MODULES.B)) {
      throw new ValidationError('Este evento no incluye el Módulo B.');
    }
    if (onsite && !citation) {
      throw new ValidationError('Indica la sede, la ubicación y el horario de la citación al Módulo B.');
    }
    if (!onsite && citation) {
      throw new ValidationError('Las citaciones solo aplican a eventos presenciales.');
    }
    if (!onsite) this.requireFrontendUrl();
    if (!event.evaluationsPublishedAt && event.status !== 'PUBLISHED') {
      throw new ValidationError('El Módulo B se habilita cuando se publiquen los resultados del Módulo A.');
    }

    const candidates = await this.candidateRepo.findByEvent(eventId, orgId);
    const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
    const selected = [...new Set(candidateIds)].map((id) => byId.get(id));
    if (selected.some((candidate) => !candidate)) {
      throw new ValidationError('Uno o más candidatos no pertenecen a este evento.');
    }
    const notEligible = selected.filter((candidate) => !eligibleForModuleB(candidate));
    if (notEligible.length) {
      throw new ValidationError(`No se puede enviar el Módulo B a: ${notEligible.map((item) => item.nombreCompleto).join(', ')}. `
        + 'Solo a candidatos con el Módulo A revisado que aún no hayan respondido el Módulo B.');
    }

    if (!event.moduleB?.macrocase) {
      const macrocase = await this.macrocaseService.pickSnapshotForModuleB();
      event = await this.eventService.assignModuleB(eventId, orgId, macrocase);
    }

    const organization = await this.organizationRepo.findById(orgId);
    const appointment = onsite ? toAppointment(citation) : null;
    const results = [];
    for (const candidate of selected) {
      results.push(onsite
        ? await this.citeOne({ candidate, event, organization, module: MODULES.B, appointment })
        : await this.publishOne({ candidate, event, organization, orgId, module: MODULES.B }));
    }
    return this.summarize(results);
  }

  /**
   * Sends one onsite citation and records it apart from the evaluation
   * status: Module A in `candidate.citation` (status CITED), Module B in
   * `candidate.moduleB.citation`. No invitation or token is created, so
   * nothing in the e-mail can open the evaluation.
   */
  async citeOne({ candidate, event, organization, module, appointment }) {
    const now = new Date();
    try {
      const delivery = await this.emailService.sendCitation({ candidate, event, organization, module, appointment });
      const citation = { status: CITATION_STATUSES.SENT, sentAt: now, providerId: delivery.id, appointment };
      await this.candidateRepo.update(candidate.id, module === MODULES.B
        ? { moduleB: { status: MODULE_B_STATUSES.CITED, invitedAt: now, citation } }
        : { status: CANDIDATE_STATUSES.CITED, citation });
      return { candidateId: candidate.id, sent: true };
    } catch (error) {
      // Module A keeps the failure visible (the candidate stays pending, so
      // the next send retries it); Module B keeps whatever it had.
      if (module === MODULES.A) {
        await this.candidateRepo.update(candidate.id, {
          citation: { status: CITATION_STATUSES.FAILED, failedAt: now, error: error.message },
        }).catch(() => {});
      }
      return { candidateId: candidate.id, sent: false, message: error.message };
    }
  }

  /**
   * Asks the e-mail provider for the latest delivery event of every
   * citation sent for this event (Module A and B) and stores it in
   * `citation.delivery`. One request at a time, within the provider's rate
   * limit.
   */
  async refreshCitationStatus(eventId, orgId) {
    const event = await this.eventService.getEvent(eventId, orgId);
    if (!isOnsite(event)) throw new ValidationError('Este evento no es presencial: no tiene citaciones.');
    const candidates = await this.candidateRepo.findByEvent(eventId, orgId);
    let checked = 0;
    let failed = 0;
    let first = true;

    const check = async (citation) => {
      if (!citation?.providerId) return citation;
      if (!first) await this.sleep(STATUS_CHECK_DELAY_MS);
      first = false;
      try {
        const { lastEvent } = await this.emailService.getEmailStatus(citation.providerId);
        checked += 1;
        return { ...citation, delivery: { status: lastEvent || 'unknown', checkedAt: new Date() } };
      } catch {
        failed += 1;
        return citation;
      }
    };

    for (const candidate of candidates) {
      const changes = {};
      if (candidate.citation?.providerId) changes.citation = await check(candidate.citation);
      if (candidate.moduleB?.citation?.providerId) {
        changes.moduleB = { ...candidate.moduleB, citation: await check(candidate.moduleB.citation) };
      }
      if (Object.keys(changes).length) await this.candidateRepo.update(candidate.id, changes);
    }
    return { checked, failed };
  }

  async validateAccess(token) {
    return (await this.resolveAccess(token)).result;
  }

  /**
   * Validates an access token. `result` is what the candidate's browser
   * gets; `invitation`, `event` and `candidate` are only set when the
   * access is VALID, for the operations that act on it.
   */
  async resolveAccess(token) {
    const closed = (result) => ({ result });
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
      return closed({ state: 'INVALID' });
    }

    const tokenHash = hashToken(token);
    const invitation = await this.invitationRepo.findByTokenHash(tokenHash);
    if (!invitation) return closed({ state: 'INVALID' });
    if (invitation.status === INVITATION_STATUSES.COMPLETED) {
      return closed({ state: 'COMPLETED', submittedAt: invitation.submittedAt });
    }
    if (invitation.status === INVITATION_STATUSES.CANCELLED) return closed({ state: 'CANCELLED' });
    if (invitation.status === INVITATION_STATUSES.EXPIRED) return closed({ state: 'EXPIRED' });

    const expiresAt = new Date(invitation.expiresAt);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt <= this.now()) {
      await this.invitationRepo.update(invitation.id, {
        status: INVITATION_STATUSES.EXPIRED,
        expiredAt: this.now(),
      });
      return closed({ state: 'EXPIRED' });
    }

    const candidate = await this.candidateRepo.findById(invitation.candidateId);
    let event;
    try {
      event = await this.eventService.getEvent(invitation.eventId, invitation.orgId);
    } catch {
      return closed({ state: 'INVALID' });
    }
    if (!candidate || candidate.eventId !== event.id || candidate.orgId !== invitation.orgId) {
      return closed({ state: 'INVALID' });
    }
    // Onsite evaluations are never opened through an e-mailed link, only
    // through a session opened at the venue with an enabled code.
    const onsiteSession = invitation.channel === ACCESS_CHANNELS.ONSITE;
    if (isOnsite(event) !== onsiteSession) return closed({ state: 'INVALID' });

    const module = invitation.module || MODULES.A;
    if (module === MODULES.B && !event.moduleB?.macrocase) return closed({ state: 'INVALID' });

    // An onsite session is available as soon as it opens: the applicator
    // already decided when by enabling the code.
    const availableFrom = new Date(module === MODULES.B || onsiteSession
      ? invitation.availableAt || invitation.createdAt
      : candidate.fechaHoraCita || event.availableFrom);
    if (Number.isNaN(availableFrom.getTime())) return closed({ state: 'INVALID' });
    const organization = await this.organizationRepo.findById(invitation.orgId);
    const context = {
      module,
      candidate: { nombreCompleto: candidate.nombreCompleto },
      event: {
        nombre: event.name || event.title || event.eventName || 'Proceso de evaluación',
        puesto: event.position || event.positionName || '',
        availableFrom,
      },
      organization: {
        nombre: organization?.companyName || organization?.name || 'La empresa',
      },
      expiresAt,
    };

    if (availableFrom > this.now()) {
      return closed({ state: 'NOT_YET_AVAILABLE', ...context });
    }
    // Module B: only the overview here; the content arrives one stage at a
    // time through `getMacrocaseStage` / `advanceMacrocase`.
    const result = module === MODULES.B
      ? { state: 'VALID', ...context, macrocase: publicOverview(toSectionedMacrocase(event.moduleB.macrocase)) }
      : { state: 'VALID', ...context };
    return { result, invitation: { ...invitation, module }, event, candidate };
  }

  /** Resolves a VALID Module B access, or returns the closed state to show instead. */
  async resolveMacrocaseAccess(token) {
    const access = await this.resolveAccess(token);
    if (access.result.state !== 'VALID') return { closed: access.result };
    if (access.invitation.module !== MODULES.B) {
      throw new ValidationError('Esta invitación no corresponde a esta evaluación.');
    }
    return { ...access, macrocase: toSectionedMacrocase(access.event.moduleB.macrocase) };
  }

  /** Module B: the stage the candidate is on (resumes after a reload). */
  async getMacrocaseStage(token) {
    const access = await this.resolveMacrocaseAccess(token);
    if (access.closed) return access.closed;
    const progress = await this.invitationRepo.findProgress(progressIdOf(access.invitation));
    return { state: 'VALID', ...stageView(access.macrocase, progress) };
  }

  /**
   * Module B: applies one candidate action (start, finish reading a
   * section, start a question's timer, save a draft, answer) and returns
   * the resulting stage. The forward-only rules live in `applyAction`.
   */
  async advanceMacrocase(token, action) {
    const access = await this.resolveMacrocaseAccess(token);
    if (access.closed) return access.closed;
    const { invitation, macrocase } = access;
    const now = this.now();
    const progress = await this.invitationRepo.updateProgress(progressIdOf(invitation), (current) => ({
      ...applyAction(macrocase, current, action, now),
      invitationId: invitation.id,
      candidateId: invitation.candidateId,
      eventId: invitation.eventId,
      orgId: invitation.orgId,
      module: MODULES.B,
      instrumentVersion: `MACROCASE:${macrocase.id}:v${MACROCASE_SCHEMA_VERSION}`,
      startedAt: current?.startedAt ?? now,
      updatedAt: now,
    }));
    return { state: 'VALID', ...stageView(macrocase, progress, now) };
  }

  /**
   * Module A: `answers` = Likert values. Module B: `finalize` = confirm the
   * answers already saved stage by stage. Which one is required depends on
   * the invitation.
   */
  async submitEvaluation(token, { answers, finalize } = {}) {
    const access = await this.resolveAccess(token);
    if (access.result.state !== 'VALID') return access.result;

    const tokenHash = hashToken(token);
    const { invitation, candidate } = access;

    if (invitation.module === MODULES.B) {
      if (finalize !== true) throw new ValidationError('Confirma el envío de tu evaluación.');
      if (candidate.moduleB?.status === MODULE_B_STATUSES.COMPLETED) {
        return { state: 'COMPLETED', submittedAt: candidate.moduleB.submittedAt, alreadySubmitted: true };
      }
      const macrocase = toSectionedMacrocase(access.event.moduleB.macrocase);
      const progress = await this.invitationRepo.findProgress(progressIdOf(invitation));
      const result = await this.invitationRepo.completeWithSubmission(tokenHash, {
        module: MODULES.B,
        instrumentVersion: `MACROCASE:${macrocase.id}:v${MACROCASE_SCHEMA_VERSION}`,
        answers: finalAnswers(macrocase, progress),
      });
      if (result.state === 'COMPLETED' && !result.alreadySubmitted) {
        await this.candidateRepo.update(invitation.candidateId, {
          moduleB: { ...candidate.moduleB, status: MODULE_B_STATUSES.COMPLETED, submittedAt: result.submittedAt },
        });
      }
      return result;
    }

    if (!answers) throw new ValidationError('Envía las respuestas de tu evaluación.');
    const result = await this.invitationRepo.completeWithSubmission(tokenHash, {
      module: MODULES.A,
      instrumentVersion: 'DEMO_A_V1',
      answers,
    });
    if (result.state === 'COMPLETED' && !result.alreadySubmitted && invitation) {
      await this.candidateRepo.update(invitation.candidateId, {
        status: CANDIDATE_STATUSES.EVALUATION_COMPLETED,
        submittedAt: result.submittedAt,
      });
    }
    return result;
  }

  async publishOne({ candidate, event, organization, orgId, module }) {
    let invitation;
    try {
      const previous = await this.invitationRepo.findActiveByCandidate(candidate.id, event.id, module);
      if (previous) {
        await this.invitationRepo.update(previous.id, {
          status: INVITATION_STATUSES.CANCELLED,
          cancelledAt: new Date(),
        });
      }

      const token = crypto.randomBytes(32).toString('base64url');
      const now = Date.now();
      const availableAt = module === MODULES.B
        ? now
        : new Date(candidate.fechaHoraCita || event.availableFrom).getTime();
      const expiresAt = new Date(module === MODULES.B
        ? now + MODULE_B_VALIDITY_MS
        : Math.max(now, availableAt) + DAY_MS);
      invitation = await this.invitationRepo.create({
        candidateId: candidate.id,
        eventId: event.id,
        orgId,
        module,
        tokenHash: hashToken(token),
        status: INVITATION_STATUSES.ACTIVE,
        availableAt: new Date(availableAt),
        expiresAt,
      });

      const accessUrl = new URL('/evaluation/access', this.frontendUrl);
      accessUrl.searchParams.set('token', token);
      const delivery = await this.emailService.sendInvitation({
        candidate,
        event,
        organization,
        accessUrl: accessUrl.toString(),
        module,
        expiresAt,
      });
      await this.candidateRepo.update(candidate.id, module === MODULES.B
        ? {
            moduleB: {
              status: MODULE_B_STATUSES.INVITATION_SENT,
              invitationId: invitation.id,
              invitedAt: new Date(),
              emailProviderId: delivery.id,
            },
          }
        : {
            status: CANDIDATE_STATUSES.INVITATION_SENT,
            invitationId: invitation.id,
            invitedAt: new Date(),
            emailProviderId: delivery.id,
          });
      return { candidateId: candidate.id, sent: true };
    } catch (error) {
      if (invitation) {
        await this.invitationRepo.update(invitation.id, {
          status: INVITATION_STATUSES.CANCELLED,
          cancelledAt: new Date(),
        }).catch(() => {});
      }
      return { candidateId: candidate.id, sent: false, message: error.message };
    }
  }

  summarize(results) {
    return {
      total: results.length,
      sent: results.filter((item) => item.sent).length,
      failed: results.filter((item) => !item.sent).length,
      failures: results.filter((item) => !item.sent).map(({ candidateId, message }) => ({ candidateId, message })),
    };
  }

  requireFrontendUrl() {
    if (!this.frontendUrl) {
      throw new ValidationError('FRONTEND_URL no está configurada en el backend.');
    }
  }
}

module.exports = InvitationService;
