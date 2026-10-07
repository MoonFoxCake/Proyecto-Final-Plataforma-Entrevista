const crypto = require('crypto');
const {
  CANDIDATE_STATUSES, INVITATION_STATUSES, MODULES, MODULE_B_STATUSES,
} = require('../utils/constants');
const { ValidationError } = require('../utils/errors');

const DAY_MS = 24 * 60 * 60 * 1000;
// Module B is sent once Module A results are out, so it is available right
// away and stays open for a few days.
const MODULE_B_VALIDITY_MS = 3 * DAY_MS;

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

function completedModuleA(candidate) {
  return Boolean(candidate.submittedAt || candidate.status === CANDIDATE_STATUSES.EVALUATION_COMPLETED);
}

/** Module A answered, reviewed and published: the company has the profile to decide. */
function eligibleForModuleB(candidate) {
  return completedModuleA(candidate)
    && candidate.reviewStatus === 'REVIEWED'
    && candidate.moduleB?.status !== MODULE_B_STATUSES.COMPLETED;
}

/** What the candidate's browser needs to run Module B (no admin-only fields). */
function publicMacrocase(macrocase) {
  return {
    name: macrocase.name,
    description: macrocase.description || '',
    introduction: macrocase.introduction,
    maxCharacters: macrocase.maxCharacters,
    defaultTimeLimit: Number(macrocase.defaultTimeLimit) > 0 ? Number(macrocase.defaultTimeLimit) : 0,
    questions: macrocase.questions.map(({ id, order, text, audioUrl, visemes }) => ({
      id, order, text, audioUrl: audioUrl || '', visemes: visemes || [],
    })),
  };
}

class InvitationService {
  constructor({
    invitationRepo, candidateService, candidateRepo, eventService, organizationRepo, emailService, frontendUrl,
    macrocaseService,
  }) {
    this.invitationRepo = invitationRepo;
    this.candidateService = candidateService;
    this.candidateRepo = candidateRepo;
    this.eventService = eventService;
    this.organizationRepo = organizationRepo;
    this.emailService = emailService;
    this.frontendUrl = frontendUrl;
    this.macrocaseService = macrocaseService;
  }

  /** Module A: sends the invitation to every candidate still pending. */
  async publishForEvent(eventId, orgId) {
    this.requireFrontendUrl();
    const event = await this.eventService.getEvent(eventId, orgId);
    const candidates = await this.candidateService.listByEvent(eventId, orgId);
    const pending = candidates.filter((item) => item.status === CANDIDATE_STATUSES.INVITED_PENDING);
    const organization = await this.organizationRepo.findById(orgId);
    const results = [];

    for (const candidate of pending) {
      results.push(await this.publishOne({ candidate, event, organization, orgId, module: MODULES.A }));
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
   */
  async sendModuleB(eventId, orgId, candidateIds) {
    this.requireFrontendUrl();
    let event = await this.eventService.getEvent(eventId, orgId);
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
    const results = [];
    for (const candidate of selected) {
      results.push(await this.publishOne({ candidate, event, organization, orgId, module: MODULES.B }));
    }
    return this.summarize(results);
  }

  async validateAccess(token) {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
      return { state: 'INVALID' };
    }

    const tokenHash = hashToken(token);
    const invitation = await this.invitationRepo.findByTokenHash(tokenHash);
    if (!invitation) return { state: 'INVALID' };
    if (invitation.status === INVITATION_STATUSES.COMPLETED) {
      return { state: 'COMPLETED', submittedAt: invitation.submittedAt };
    }
    if (invitation.status === INVITATION_STATUSES.CANCELLED) return { state: 'CANCELLED' };
    if (invitation.status === INVITATION_STATUSES.EXPIRED) return { state: 'EXPIRED' };

    const expiresAt = new Date(invitation.expiresAt);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
      await this.invitationRepo.update(invitation.id, {
        status: INVITATION_STATUSES.EXPIRED,
        expiredAt: new Date(),
      });
      return { state: 'EXPIRED' };
    }

    const candidate = await this.candidateRepo.findById(invitation.candidateId);
    let event;
    try {
      event = await this.eventService.getEvent(invitation.eventId, invitation.orgId);
    } catch {
      return { state: 'INVALID' };
    }
    if (!candidate || candidate.eventId !== event.id || candidate.orgId !== invitation.orgId) {
      return { state: 'INVALID' };
    }

    const module = invitation.module || MODULES.A;
    if (module === MODULES.B && !event.moduleB?.macrocase) return { state: 'INVALID' };

    const availableFrom = new Date(module === MODULES.B
      ? invitation.availableAt || invitation.createdAt
      : candidate.fechaHoraCita || event.availableFrom);
    if (Number.isNaN(availableFrom.getTime())) return { state: 'INVALID' };
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

    if (availableFrom > new Date()) {
      return { state: 'NOT_YET_AVAILABLE', ...context };
    }
    if (module === MODULES.B) {
      return { state: 'VALID', ...context, macrocase: publicMacrocase(event.moduleB.macrocase) };
    }
    return { state: 'VALID', ...context };
  }

  /**
   * Module A: `answers` = Likert values. Module B: `macrocaseAnswers` =
   * written answers. Which one is required depends on the invitation.
   */
  async submitEvaluation(token, { answers, macrocaseAnswers } = {}) {
    const access = await this.validateAccess(token);
    if (access.state !== 'VALID') return access;

    const tokenHash = hashToken(token);
    const invitation = await this.invitationRepo.findByTokenHash(tokenHash);

    if (access.module === MODULES.B) {
      if (!macrocaseAnswers) throw new ValidationError('Esta invitación corresponde al Módulo B: envía las respuestas del macrocaso.');
      const event = await this.eventService.getEvent(invitation.eventId, invitation.orgId);
      const macrocase = event.moduleB.macrocase;
      const result = await this.invitationRepo.completeWithSubmission(tokenHash, {
        module: MODULES.B,
        instrumentVersion: `MACROCASE:${macrocase.id}`,
        answers: this.checkMacrocaseAnswers(macrocase, macrocaseAnswers),
      });
      if (result.state === 'COMPLETED' && !result.alreadySubmitted) {
        const candidate = await this.candidateRepo.findById(invitation.candidateId);
        await this.candidateRepo.update(invitation.candidateId, {
          moduleB: { ...candidate?.moduleB, status: MODULE_B_STATUSES.COMPLETED, submittedAt: result.submittedAt },
        });
      }
      return result;
    }

    if (!answers) throw new ValidationError('Esta invitación corresponde al Módulo A: envía las respuestas del cuestionario.');
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

  /**
   * One answer per macrocase question, within the character limit. An
   * answer may only be empty if its time ran out (`timedOut`, and only when
   * the macrocase has a time limit). Stores the question text too.
   */
  checkMacrocaseAnswers(macrocase, macrocaseAnswers) {
    const timed = Number(macrocase.defaultTimeLimit) > 0;
    const byId = new Map(macrocaseAnswers.map((answer) => [answer.questionId, {
      text: answer.text.trim(),
      timedOut: timed && answer.timedOut === true,
    }]));
    const complete = byId.size === macrocaseAnswers.length
      && macrocaseAnswers.length === macrocase.questions.length
      && macrocase.questions.every((question) => {
        const answer = byId.get(question.id);
        return answer && (answer.text || answer.timedOut);
      });
    if (!complete) {
      throw new ValidationError('Debes responder cada pregunta del macrocaso una sola vez.');
    }
    const limit = Number(macrocase.maxCharacters) > 0 ? Number(macrocase.maxCharacters) : Infinity;
    return macrocase.questions.map((question) => {
      const { text, timedOut } = byId.get(question.id);
      if (text.length > limit) {
        throw new ValidationError(`La respuesta a la pregunta ${question.order} supera los ${limit} caracteres.`);
      }
      return { questionId: question.id, question: question.text, text, ...(timedOut ? { timedOut: true } : {}) };
    });
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
