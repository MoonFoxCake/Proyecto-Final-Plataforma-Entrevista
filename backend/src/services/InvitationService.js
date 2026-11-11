const { instrumentOf } = require('../utils/moduleA');
const crypto = require('crypto');

const {
  CANDIDATE_STATUSES,
  INVITATION_STATUSES,
  MODULES,
  MODULE_B_STATUSES,
  MODULE_C_STATUSES,
  CITATION_STATUSES,
  ACCESS_CHANNELS,
} = require('../utils/constants');

const { ValidationError, ForbiddenError, NotFoundError } = require('../utils/errors');

const {
  MACROCASE_SCHEMA_VERSION,
  toSectionedMacrocase: getSectionedMacrocase,
  publicOverview,
  stageView,
  applyAction,
  finalAnswers,
} = require('../utils/macrocase');

const {
  isOnsite,
  modulesOf,
  toAppointment,
} = require('../utils/eventModality');

const {
  applyAction: applyTimedAction,
  canFinish,
  isExpired,
  stateView: timedStateView,
  GRACE_MS,
} = require('../utils/timedQuestionnaire');

const {
  WITHDRAWN,
  hasCompleted,
  inPhase,
  isWithdrawn,
  phaseState,
} = require('../utils/phases');

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// Used when no settings service is wired (tests); see SettingsService.
// Only for processes created before the company chose when each virtual
// phase closes: how long their links stayed open.
const LEGACY_VALIDITY = { moduleAHours: 24, laterPhaseDays: 3 };

/**
 * The opening and closing the company chose for a virtual phase
 * (`ventana`), checked: it must close after it opens and in the future.
 */
function toAccessWindow(ventana, now) {
  if (!ventana) throw new ValidationError('Indica la fecha y hora de apertura y de cierre del enlace.');
  const opensAt = new Date(ventana.fechaHoraApertura);
  const closesAt = new Date(ventana.fechaHoraCierre);
  if (Number.isNaN(opensAt.getTime()) || Number.isNaN(closesAt.getTime())) throw new ValidationError('Revisa la fecha y hora de apertura y de cierre.');
  if (closesAt <= opensAt) throw new ValidationError('El cierre debe ser posterior a la apertura.');
  if (closesAt <= now) throw new ValidationError('El cierre debe ser una fecha futura.');
  return { opensAt, closesAt };
}

// Resend allows about 2 requests per second.
const STATUS_CHECK_DELAY_MS = 600;

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

function completedModuleA(candidate) {
  return Boolean(
    candidate.submittedAt
    || candidate.status === CANDIDATE_STATUSES.EVALUATION_COMPLETED
  );
}

/** Module A answered, reviewed and published: the company has the profile to decide. */
function eligibleForModuleB(candidate) {
  return completedModuleA(candidate)
    && candidate.reviewStatus === 'REVIEWED'
    && candidate.moduleB?.status !== MODULE_B_STATUSES.COMPLETED
    && candidate.moduleB?.status !== WITHDRAWN;
}

/** Module B progress belongs to the evaluation, not to one link: a resent link resumes it. */
const progressIdOf = (invitation) =>
  `${invitation.eventId}_${invitation.candidateId}_${invitation.module || MODULES.A}`;

class InvitationService {
  constructor({
    invitationRepo,
    candidateService,
    candidateRepo,
    eventService,
    organizationRepo,
    emailService,
    frontendUrl,
    macrocaseService,
    microcaseService,
    settingsService,
    sleep = wait,
    now = () => new Date(),
  }) {
    this.now = now;
    this.settingsService = settingsService;
    this.invitationRepo = invitationRepo;
    this.candidateService = candidateService;
    this.candidateRepo = candidateRepo;
    this.eventService = eventService;
    this.organizationRepo = organizationRepo;
    this.emailService = emailService;
    this.frontendUrl = frontendUrl;
    this.macrocaseService = macrocaseService;
    this.microcaseService = microcaseService;
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

    if (!onsite) {
      this.requireFrontendUrl();
      this.requireOpenWindow(event);
    }

    const candidates = await this.candidateService.listByEvent(eventId, orgId);
    const pending = candidates.filter(
      (item) => item.status === CANDIDATE_STATUSES.INVITED_PENDING
    );

    const organization = await this.organizationRepo.findById(orgId);
    const results = [];

    for (const candidate of pending) {
      results.push(
        onsite
          ? await this.citeOne({
              candidate,
              event,
              organization,
              module: MODULES.A,
              appointment: event.onsite,
            })
          : await this.publishOne({
              candidate,
              event,
              organization,
              orgId,
              module: MODULES.A,
            })
      );
    }

    return this.summarize(results);
  }

  /** Prevents companies without the right plan from invoking Module B through the API. */
  async requireModuleBSubscription(orgId) {
    const organization = await this.organizationRepo.findById(orgId);

    const planId =
      organization?.subscription?.planId
      || organization?.subscriptionPlan
      || 'fase-a';

    const normalizedPlan =
      ({ A: 'fase-a', AB: 'fase-a-b', COMPLETE: 'completo' })[planId]
      || planId;

    if (!['fase-a-b', 'completo'].includes(normalizedPlan)) {
      throw new ForbiddenError(
        'Tu suscripción no incluye el Módulo B. Cambia al plan Fase A + B o Plan completo para habilitarlo.'
      );
    }
  }

  /**
   * Module B: sends the macrocase to the candidates the company selected
   * after reading their Module A profile. The first time, one of the active
   * macrocases of the bank is picked at random and copied into the event, so
   * every candidate of the process gets the same case and later edits in the
   * bank do not change it. Sending again to a candidate who has not answered
   * yet replaces their previous link.
   *
   * Onsite events cite the candidates to a Module B session instead
   * (citation: venue and time); Module B needs Module A reviewed and
   * published first, so it cannot share Module A's appointment.
   */
  async sendModuleB(eventId, orgId, candidateIds, citation, ventana) {
    // Validate the organization's subscription before allowing Module B.
    await this.requireModuleBSubscription(orgId);

    let event = await this.eventService.getEvent(eventId, orgId);
    const onsite = isOnsite(event);

    if (!modulesOf(event).includes(MODULES.B)) {
      throw new ValidationError('Este evento no incluye el Módulo B.');
    }

    if (onsite && !citation) {
      throw new ValidationError(
        'Indica la sede, la ubicación y el horario de la citación al Módulo B.'
      );
    }

    if (!onsite && citation) {
      throw new ValidationError(
        'Las citaciones solo aplican a eventos presenciales.'
      );
    }

    if (onsite && ventana) throw new ValidationError('La apertura y el cierre del enlace solo aplican a procesos virtuales.');
    const accessWindow = onsite ? null : toAccessWindow(ventana, this.now());

    if (!onsite) this.requireFrontendUrl();

    if (!event.evaluationsPublishedAt && event.status !== 'PUBLISHED') {
      throw new ValidationError(
        'El Módulo B se habilita cuando se publiquen los resultados del Módulo A.'
      );
    }

    // Processes created before phase reports existed keep their original rule.
    if (event.requiresPhaseReports && !event.moduleResults?.A?.deliveredAt) {
      throw new ValidationError(
        'El Módulo B se habilita cuando administración entregue el PDF de resultados de la Fase A.'
      );
    }

    const candidates = await this.candidateRepo.findByEvent(eventId, orgId);
    const byId = new Map(
      candidates.map((candidate) => [candidate.id, candidate])
    );

    const selected = [...new Set(candidateIds)].map((id) => byId.get(id));

    if (selected.some((candidate) => !candidate)) {
      throw new ValidationError(
        'Uno o más candidatos no pertenecen a este evento.'
      );
    }

    const notEligible = selected.filter(
      (candidate) => !eligibleForModuleB(candidate)
    );

    if (notEligible.length) {
      throw new ValidationError(
        `No se puede enviar el Módulo B a: ${notEligible
          .map((item) => item.nombreCompleto)
          .join(', ')}. `
        + 'Solo a candidatos con el Módulo A revisado que aún no hayan respondido el Módulo B.'
      );
    }

    if (!event.moduleB?.macrocase) {
      const macrocase = await this.macrocaseService.pickSnapshotForModuleB();
      event = await this.eventService.assignModuleB(
        eventId,
        orgId,
        macrocase
      );
    }

    const organization = await this.organizationRepo.findById(orgId);

    const moduleBAppointment = onsite
      ? toAppointment(citation)
      : null;

    const results = [];

    for (const candidate of selected) {
      results.push(
        onsite
          ? await this.citeOne({
              candidate,
              event,
              organization,
              module: MODULES.B,
              appointment: moduleBAppointment,
            })
          : await this.publishOne({
              candidate,
              event,
              organization,
              orgId,
              module: MODULES.B,
              accessWindow,
            })
      );
    }

    return this.summarize(results);
  }

  /**
   * Sends one onsite citation and records it apart from the evaluation
   * status: Module A in candidate.citation (status CITED), Module B in
   * candidate.moduleB.citation. No invitation or token is created, so
   * nothing in the e-mail can open the evaluation.
   */
  async requireModuleCSubscription(orgId) {
    const organization = await this.organizationRepo.findById(orgId);
    const planId = organization?.subscription?.planId || organization?.subscriptionPlan || 'fase-a';
    const normalized = ({ A: 'fase-a', AB: 'fase-a-b', COMPLETE: 'completo' })[planId] || planId;
    if (normalized !== 'completo') throw new ForbiddenError('Tu suscripción no incluye el Módulo C. Necesitas el Plan completo.');
  }

  async sendModuleC(eventId, orgId, candidateIds, citation, ventana) {
    await this.requireModuleCSubscription(orgId);
    let event = await this.eventService.getEvent(eventId, orgId);
    if (!modulesOf(event).includes(MODULES.C)) throw new ValidationError('Este proceso no incluye el Módulo C.');
    if (!event.moduleResults?.B?.deliveredAt) throw new ValidationError('La empresa debe recibir primero el PDF de resultados de la Fase B para abrir la Fase C.');
    if (!event.moduleC?.microcase || !event.moduleC.questions?.length) throw new ValidationError('Selecciona y guarda las habilidades a evaluar antes de invitar.');
    const onsite = isOnsite(event);
    if (onsite && !citation) throw new ValidationError('Indica la sede, ubicación y horario de la Fase C.');
    if (!onsite && citation) throw new ValidationError('Las citaciones solo aplican a procesos presenciales.');
    if (onsite && ventana) throw new ValidationError('La apertura y el cierre del enlace solo aplican a procesos virtuales.');
    const accessWindow = onsite ? null : toAccessWindow(ventana, this.now());
    if (!onsite) this.requireFrontendUrl();
    const candidates = await this.candidateRepo.findByEvent(eventId, orgId);
    const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
    const selected = [...new Set(candidateIds || [])].map((id) => byId.get(id));
    if (!selected.length || selected.some((candidate) => !candidate)) throw new ValidationError('Selecciona candidatos válidos de este proceso.');
    const invalid = selected.filter((candidate) => candidate.moduleB?.status !== MODULE_B_STATUSES.COMPLETED || candidate.moduleC?.status === MODULE_C_STATUSES.COMPLETED || candidate.moduleC?.status === WITHDRAWN);
    if (invalid.length) throw new ValidationError(`Solo pueden continuar quienes completaron la Fase B: ${invalid.map((c) => c.nombreCompleto).join(', ')}.`);
    const org = await this.organizationRepo.findById(orgId);
    const appointment = onsite ? toAppointment(citation) : null;
    // From the first send the skills and questions are frozen for everyone.
    if (!event.moduleC.lockedAt) {
      await this.eventService.eventRepo.update(eventId, { moduleC: { ...event.moduleC, lockedAt: new Date() } });
    }
    const results = [];
    for (const candidate of selected) {
      const assignedQuestions = event.moduleC.questions.map((question) => ({ ...question }));
      const moduleC = { status: onsite ? 'PENDING_CITATION' : MODULE_C_STATUSES.INVITATION_SENT, invitedAt: new Date(), citation: null, ...(onsite ? { appointment } : {}), assignedQuestions, microcaseId: event.moduleC.microcase.id };
      await this.candidateRepo.update(candidate.id, { moduleC });
      const updatedCandidate = { ...candidate, moduleC };
      results.push(onsite
        ? await this.citeOne({ candidate: updatedCandidate, event, organization: org, module: MODULES.C, appointment })
        : await this.publishOne({ candidate: updatedCandidate, event, organization: org, orgId, module: MODULES.C, accessWindow }));
    }
    return this.summarize(results);
  }

  async citeOne({ candidate, event, organization, module, appointment }) {
    const now = new Date();

    try {
      const delivery = await this.emailService.sendCitation({
        candidate,
        event,
        organization,
        module,
        appointment,
        templates: (await this.currentSettings()).emails,
      });

      const citation = {
        status: CITATION_STATUSES.SENT,
        sentAt: now,
        providerId: delivery.id,
        appointment,
      };

      await this.candidateRepo.update(candidate.id, module === MODULES.B ? { moduleB: { ...(candidate.moduleB || {}), status: MODULE_B_STATUSES.CITED, invitedAt: now, citation } } : module === MODULES.C ? { moduleC: { ...(candidate.moduleC || {}), status: MODULE_C_STATUSES.CITED, invitedAt: now, citation } } : { status: CANDIDATE_STATUSES.CITED, citation });

      return { candidateId: candidate.id, sent: true };
    } catch (error) {
      // Module A keeps the failure visible (the candidate stays pending, so
      // the next send retries it); Module B keeps whatever it had.
      if (module === MODULES.A) {
        await this.candidateRepo.update(candidate.id, { citation: { status: CITATION_STATUSES.FAILED, failedAt: now, error: error.message } }).catch(() => {});
      } else if (module === MODULES.C) {
        await this.candidateRepo.update(candidate.id, { moduleC: { ...(candidate.moduleC || {}), status: 'INVITATION_FAILED', citation: { status: CITATION_STATUSES.FAILED, failedAt: now, error: error.message, appointment } } }).catch(() => {});
      }

      return {
        candidateId: candidate.id,
        sent: false,
        message: error.message,
      };
    }
  }

  /**
   * Asks the e-mail provider for the latest delivery event of every
   * citation sent for this event (Module A and B) and stores it in
   * citation.delivery. One request at a time, within the provider's rate
   * limit.
   */
  async refreshCitationStatus(eventId, orgId) {
    const event = await this.eventService.getEvent(eventId, orgId);

    if (!isOnsite(event)) {
      throw new ValidationError(
        'Este evento no es presencial: no tiene citaciones.'
      );
    }

    const candidates = await this.candidateRepo.findByEvent(eventId, orgId);

    let checked = 0;
    let failed = 0;
    let first = true;

    const check = async (citation) => {
      if (!citation?.providerId) return citation;

      if (!first) await this.sleep(STATUS_CHECK_DELAY_MS);
      first = false;

      try {
        const { lastEvent } = await this.emailService.getEmailStatus(
          citation.providerId
        );

        checked += 1;

        return {
          ...citation,
          delivery: {
            status: lastEvent || 'unknown',
            checkedAt: new Date(),
          },
        };
      } catch {
        failed += 1;
        return citation;
      }
    };

    for (const candidate of candidates) {
      const changes = {};

      if (candidate.citation?.providerId) {
        changes.citation = await check(candidate.citation);
      }

      if (candidate.moduleB?.citation?.providerId) {
        changes.moduleB = {
          ...candidate.moduleB,
          citation: await check(candidate.moduleB.citation),
        };
      }

      if (candidate.moduleC?.citation?.providerId) {
        changes.moduleC = {
          ...candidate.moduleC,
          citation: await check(candidate.moduleC.citation),
        };
      }

      if (Object.keys(changes).length) {
        await this.candidateRepo.update(candidate.id, changes);
      }
    }

    return { checked, failed };
  }

  /**
   * A timed evaluation whose time ran out is closed here with whatever was
   * answered, so coming back after the deadline cannot reopen it.
   */
  async validateAccess(token) {
    const access = await this.resolveAccess(token);
    if (access.result.state !== 'VALID' || !this.isTimed(access)) return access.result;
    const definition = this.timedDefinition(access);
    const progress = await this.invitationRepo.findProgress(progressIdOf(access.invitation));
    if (isExpired(definition, progress, this.now(), GRACE_MS)) {
      return this.completeTimed(access, progress, hashToken(token));
    }
    return access.result;
  }

  // ------------------------------------------- timed Likert (A and C)

  /** Module C always has a total time; Module A only if its question group sets one. */
  isTimed({ invitation, event }) {
    if (invitation.module === MODULES.C) return true;
    return invitation.module === MODULES.A && Number(instrumentOf(event).timeLimitMinutes) > 0;
  }

  timedDefinition({ invitation, event, candidate }) {
    if (invitation.module === MODULES.C) {
      return {
        limitSeconds: Number(event.moduleC.microcase.timeLimitMinutes || 15) * 60,
        hasStory: true,
        questions: (candidate.moduleC?.assignedQuestions || []).map((question) => ({ id: question.questionId })),
      };
    }
    const instrument = instrumentOf(event);
    return {
      limitSeconds: Number(instrument.timeLimitMinutes) * 60,
      hasStory: false,
      questions: instrument.questions.map((question) => ({ id: question.id })),
    };
  }

  /** Resolves a VALID timed access, closing it first if its time is over. */
  async resolveTimedAccess(token) {
    const access = await this.resolveAccess(token);
    if (access.result.state !== 'VALID') return { closed: access.result };
    if (!this.isTimed(access)) throw new ValidationError('Esta invitación no corresponde a esta evaluación.');
    const definition = this.timedDefinition(access);
    const progress = await this.invitationRepo.findProgress(progressIdOf(access.invitation));
    if (isExpired(definition, progress, this.now(), GRACE_MS)) {
      return { closed: await this.completeTimed(access, progress, hashToken(token)) };
    }
    return { ...access, definition, progress };
  }

  /** The stage and remaining time of a timed evaluation (resumes after a reload). */
  async getTimedState(token) {
    const access = await this.resolveTimedAccess(token);
    if (access.closed) return access.closed;
    return timedStateView(access.definition, access.progress, this.now());
  }

  /** One candidate action (`START`, `STORY_DONE`, `ANSWER`); returns the resulting stage. */
  async advanceTimed(token, action) {
    const access = await this.resolveTimedAccess(token);
    if (access.closed) return access.closed;
    const { invitation, definition } = access;
    const now = this.now();
    const progress = await this.invitationRepo.updateProgress(progressIdOf(invitation), (current) => ({
      ...applyTimedAction(definition, current, action, now),
      invitationId: invitation.id,
      candidateId: invitation.candidateId,
      eventId: invitation.eventId,
      orgId: invitation.orgId,
      module: invitation.module,
      updatedAt: now,
    }));
    return timedStateView(definition, progress, now);
  }

  /** Stores the answers given so far; questions left unanswered go as timed out. */
  async completeTimed({ invitation, event, candidate }, progress, tokenHash) {
    const byId = new Map((progress?.answers || []).map((answer) => [answer.questionId, answer.value]));
    const valueOf = (id) => (byId.has(id) ? { value: byId.get(id) } : { value: null, timedOut: true });
    const isC = invitation.module === MODULES.C;
    const instrument = isC ? null : instrumentOf(event);
    const answers = isC
      ? (candidate.moduleC?.assignedQuestions || []).map((question) => ({ ...question, ...valueOf(question.questionId) }))
      : instrument.questions.map((question, index) => ({
        questionId: question.id,
        ...valueOf(question.id),
        ...(event.moduleA?.instrument ? { text: question.text, dimension: question.dimension || '', number: index + 1 } : {}),
      }));
    const result = await this.invitationRepo.completeWithSubmission(tokenHash, {
      module: invitation.module,
      instrumentVersion: isC ? `MICROCASE:${candidate.moduleC.microcaseId}` : instrument.instrumentVersion,
      answers,
    });
    if (result.state === 'COMPLETED' && !result.alreadySubmitted) {
      await this.candidateRepo.update(candidate.id, isC
        ? { moduleC: { ...candidate.moduleC, status: MODULE_C_STATUSES.COMPLETED, submittedAt: result.submittedAt } }
        : { status: CANDIDATE_STATUSES.EVALUATION_COMPLETED, submittedAt: result.submittedAt });
      await this.notifyIfPhaseReady(invitation.eventId, invitation.orgId, invitation.module);
    }
    return result;
  }

  // ----------------------------------------------------- phases

  async currentSettings() {
    if (!this.settingsService) return { emails: undefined };
    return this.settingsService.get();
  }

  /** Module A of a virtual process: its links stop working when the process closes. */
  requireOpenWindow(event) {
    if (event.availableUntil && new Date(event.availableUntil) <= this.now()) {
      throw new ValidationError('El enlace de la Fase A ya cerró: la fecha y hora de cierre del proceso pasó.');
    }
  }

  /**
   * Tells the administrators that a phase is ready for its PDF, once.
   * Best effort: the phase is listed in "Resultados" either way.
   */
  async notifyIfPhaseReady(eventId, orgId, module) {
    if (!this.settingsService) return;
    try {
      const [event, candidates, settings] = await Promise.all([
        this.eventService.getEvent(eventId, orgId),
        this.candidateRepo.findByEvent(eventId, orgId),
        this.settingsService.get(),
      ]);
      if (!phaseState(module, candidates).complete) return;
      if (event.moduleResults?.[module]?.deliveredAt || event.phaseReadyNotifiedAt?.[module]) return;
      const email = settings.notifications?.adminEmail;
      if (!email) return;
      const organization = await this.organizationRepo.findById(orgId);
      await this.emailService.sendPhaseReady({
        email,
        company: organization?.companyName || organization?.name || 'Empresa',
        eventName: event.name || event.title || 'Proceso',
        module,
        url: `${(this.frontendUrl || '').replace(/\/$/, '')}/admin-dashboard?section=results`,
      });
      await this.eventService.eventRepo.update(eventId, {
        phaseReadyNotifiedAt: { ...(event.phaseReadyNotifiedAt || {}), [module]: new Date() },
      });
    } catch (error) {
      console.error(`No se pudo avisar que la Fase ${module} está lista:`, error.message);
    }
  }

  async requireCandidate(eventId, orgId, candidateId) {
    const candidate = await this.candidateRepo.findById(candidateId);
    if (!candidate || candidate.eventId !== eventId || candidate.orgId !== orgId) {
      throw new NotFoundError('Candidato no encontrado.');
    }
    return candidate;
  }

  /** Module A: sends a new link or citation to someone who has not answered yet. */
  async resendModuleA(eventId, orgId, candidateId) {
    const event = await this.eventService.getEvent(eventId, orgId);
    const candidate = await this.requireCandidate(eventId, orgId, candidateId);
    if (event.evaluationsPublishedAt || event.status === 'PUBLISHED') throw new ValidationError('Esta fase ya se cerró: los resultados están publicados.');
    if (hasCompleted(candidate, MODULES.A)) throw new ValidationError('Este candidato ya respondió la evaluación.');
    if (isWithdrawn(candidate, MODULES.A)) throw new ValidationError('Este candidato fue retirado de la fase.');
    if (candidate.status === CANDIDATE_STATUSES.INVITED_PENDING) throw new ValidationError('Este candidato todavía no ha sido convocado: usa el envío general.');
    const organization = await this.organizationRepo.findById(orgId);
    if (isOnsite(event)) {
      if (new Date(event.onsite.endsAt) <= this.now()) throw new ValidationError('La cita presencial ya terminó. Puedes retirar al candidato de la fase.');
      return this.summarize([await this.citeOne({ candidate, event, organization, module: MODULES.A, appointment: event.onsite })]);
    }
    this.requireFrontendUrl();
    this.requireOpenWindow(event);
    return this.summarize([await this.publishOne({ candidate, event, organization, orgId, module: MODULES.A })]);
  }

  /** Takes a candidate out of a phase so it does not wait for them. Their link stops working. */
  async withdrawOne(event, candidate, module, actorUid) {
    const now = this.now();
    const session = await this.invitationRepo.findActiveByCandidate(candidate.id, event.id, module);
    if (session) {
      await this.invitationRepo.update(session.id, { status: INVITATION_STATUSES.CANCELLED, cancelledAt: now, cancelledBy: actorUid });
    }
    const mark = { status: WITHDRAWN, withdrawnAt: now, withdrawnBy: actorUid };
    await this.candidateRepo.update(candidate.id, module === MODULES.A
      ? mark
      : { [`module${module}`]: { ...candidate[`module${module}`], ...mark } });
  }

  requirePhaseOpen(event, module) {
    if (!modulesOf(event).includes(module)) throw new ValidationError(`Este proceso no incluye el Módulo ${module}.`);
    if (event.moduleResults?.[module]?.deliveredAt) throw new ValidationError(`La Fase ${module} ya se entregó.`);
  }

  async withdrawCandidate(eventId, orgId, candidateId, module, actorUid) {
    const event = await this.eventService.getEvent(eventId, orgId);
    this.requirePhaseOpen(event, module);
    const candidate = await this.requireCandidate(eventId, orgId, candidateId);
    if (!inPhase(candidate, module)) throw new ValidationError(`Este candidato no participa en el Módulo ${module}.`);
    if (hasCompleted(candidate, module)) throw new ValidationError('Este candidato ya respondió esta fase.');
    if (isWithdrawn(candidate, module)) return { withdrawn: false };
    await this.withdrawOne(event, candidate, module, actorUid);
    await this.notifyIfPhaseReady(eventId, orgId, module);
    return { withdrawn: true };
  }

  /**
   * Closes a phase with whoever answered: candidates whose time already ran
   * out are submitted with what they answered; everyone else still open is
   * withdrawn.
   */
  async closePhase(eventId, orgId, module, actorUid) {
    const event = await this.eventService.getEvent(eventId, orgId);
    this.requirePhaseOpen(event, module);
    const candidates = await this.candidateRepo.findByEvent(eventId, orgId);
    const open = candidates.filter((candidate) => inPhase(candidate, module)
      && !hasCompleted(candidate, module) && !isWithdrawn(candidate, module));
    let submitted = 0;
    for (const candidate of open) {
      if (await this.submitIfTimedOut(event, candidate, module)) submitted += 1;
      else await this.withdrawOne(event, candidate, module, actorUid);
    }
    const state = phaseState(module, await this.candidateRepo.findByEvent(eventId, orgId));
    if (!state.completed) throw new ValidationError('Nadie respondió esta fase: no hay resultados que entregar.');
    await this.notifyIfPhaseReady(eventId, orgId, module);
    return { closed: open.length - submitted, submitted, ...state };
  }

  /** @returns {Promise<boolean>} whether a timed evaluation left open past its deadline was closed */
  async submitIfTimedOut(event, candidate, module) {
    if (module === MODULES.B) return false;
    const invitation = await this.invitationRepo.findActiveByCandidate(candidate.id, event.id, module);
    if (!invitation) return false;
    const access = { invitation: { ...invitation, module }, event, candidate };
    if (!this.isTimed(access)) return false;
    const progress = await this.invitationRepo.findProgress(progressIdOf(access.invitation));
    if (!isExpired(this.timedDefinition(access), progress, this.now(), GRACE_MS)) return false;
    const result = await this.completeTimed(access, progress, invitation.tokenHash);
    return result.state === 'COMPLETED';
  }

  /**
   * Validates an access token. result is what the candidate's browser
   * gets; invitation, event and candidate are only set when the
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
      return closed({
        state: 'COMPLETED',
        submittedAt: invitation.submittedAt,
      });
    }

    if (invitation.status === INVITATION_STATUSES.CANCELLED) {
      return closed({ state: 'CANCELLED' });
    }

    if (invitation.status === INVITATION_STATUSES.EXPIRED) {
      return closed({ state: 'EXPIRED' });
    }

    const expiresAt = new Date(invitation.expiresAt);

    if (Number.isNaN(expiresAt.getTime()) || expiresAt <= this.now()) {
      await this.invitationRepo.update(invitation.id, {
        status: INVITATION_STATUSES.EXPIRED,
        expiredAt: this.now(),
      });

      return closed({ state: 'EXPIRED' });
    }

    // Independent reads, at once: every candidate action goes through here.
    const [candidate, event, organization] = await Promise.all([
      this.candidateRepo.findById(invitation.candidateId),
      this.eventService.getEvent(invitation.eventId, invitation.orgId).catch(() => null),
      this.organizationRepo.findById(invitation.orgId),
    ]);

    if (!event) return closed({ state: 'INVALID' });

    if (
      !candidate
      || candidate.eventId !== event.id
      || candidate.orgId !== invitation.orgId
    ) {
      return closed({ state: 'INVALID' });
    }

    // Onsite evaluations are never opened through an e-mailed link, only
    // through a session opened at the venue with an enabled code.
    const onsiteSession = invitation.channel === ACCESS_CHANNELS.ONSITE;

    if (isOnsite(event) !== onsiteSession) {
      return closed({ state: 'INVALID' });
    }

    const module = invitation.module || MODULES.A;

    if (module === MODULES.B && !event.moduleB?.macrocase) return closed({ state: 'INVALID' });
    if (module === MODULES.C && (!event.moduleC?.microcase || !candidate.moduleC?.assignedQuestions?.length)) return closed({ state: 'INVALID' });

    // An onsite session is available as soon as it opens: the applicator
    // already decided when by enabling the code.
    const availableFrom = new Date(
      module === MODULES.B || module === MODULES.C || onsiteSession
        ? invitation.availableAt || invitation.createdAt
        : candidate.fechaHoraCita || event.availableFrom
    );

    if (Number.isNaN(availableFrom.getTime())) {
      return closed({ state: 'INVALID' });
    }

    const context = {
      module,
      candidate: {
        nombreCompleto: candidate.nombreCompleto,
      },
      event: {
        nombre:
          event.name
          || event.title
          || event.eventName
          || 'Proceso de evaluación',
        puesto: event.position || event.positionName || '',
        availableFrom,
      },
      organization: {
        nombre:
          organization?.companyName
          || organization?.name
          || 'La empresa',
      },
      expiresAt,
    };

    if (availableFrom > this.now()) {
      return closed({
        state: 'NOT_YET_AVAILABLE',
        ...context,
      });
    }

    // Module B: only the overview here; the content arrives one stage at a
    // time through getMacrocaseStage / advanceMacrocase.
    const result = module === MODULES.C
      ? { state: 'VALID', ...context, microcase: { name: event.moduleC.microcase.name, story: event.moduleC.microcase.story, timeLimitMinutes: event.moduleC.microcase.timeLimitMinutes || 15, questions: candidate.moduleC?.assignedQuestions || [] } }
      : module === MODULES.B
      ? {
          state: 'VALID',
          ...context,
          macrocase: publicOverview(
            getSectionedMacrocase(event.moduleB.macrocase)
          ),
        }
      : {
          state: 'VALID',
          ...context,
          questionnaire: instrumentOf(event),
        };

    return {
      result,
      invitation: {
        ...invitation,
        module,
      },
      event,
      candidate,
    };
  }

  /** Resolves a VALID Module B access, or returns the closed state to show instead. */
  async resolveMacrocaseAccess(token) {
    const access = await this.resolveAccess(token);

    if (access.result.state !== 'VALID') {
      return { closed: access.result };
    }

    if (access.invitation.module !== MODULES.B) {
      throw new ValidationError(
        'Esta invitación no corresponde a esta evaluación.'
      );
    }

    return {
      ...access,
      macrocase: getSectionedMacrocase(access.event.moduleB.macrocase),
    };
  }

  /** Module B: the stage the candidate is on (resumes after a reload). */
  async getMacrocaseStage(token) {
    const access = await this.resolveMacrocaseAccess(token);

    if (access.closed) return access.closed;

    const progress = await this.invitationRepo.findProgress(
      progressIdOf(access.invitation)
    );

    return {
      state: 'VALID',
      ...stageView(access.macrocase, progress),
    };
  }

  /**
   * Module B: applies one candidate action (start, finish reading a
   * section, start a question's timer, save a draft, answer) and returns
   * the resulting stage. The forward-only rules live in applyAction.
   */
  async advanceMacrocase(token, action) {
    const access = await this.resolveMacrocaseAccess(token);

    if (access.closed) return access.closed;

    const { invitation, macrocase } = access;
    const now = this.now();

    const progress = await this.invitationRepo.updateProgress(
      progressIdOf(invitation),
      (current) => ({
        ...applyAction(macrocase, current, action, now),
        invitationId: invitation.id,
        candidateId: invitation.candidateId,
        eventId: invitation.eventId,
        orgId: invitation.orgId,
        module: MODULES.B,
        instrumentVersion: `MACROCASE:${macrocase.id}:v${MACROCASE_SCHEMA_VERSION}`,
        startedAt: current?.startedAt ?? now,
        updatedAt: now,
      })
    );

    return {
      state: 'VALID',
      ...stageView(macrocase, progress, now),
    };
  }

  /**
   * Module A: answers = Likert values. Module B: finalize = confirm the
   * answers already saved stage by stage. Which one is required depends
   * on the invitation.
   */
  async submitEvaluation(token, { answers, finalize } = {}) {
    const access = await this.resolveAccess(token);

    if (access.result.state !== 'VALID') {
      return access.result;
    }

    const tokenHash = hashToken(token);
    const { invitation, candidate } = access;

    if (this.isTimed(access)) {
      if (finalize !== true) throw new ValidationError('Confirma el envío de tu evaluación.');
      const definition = this.timedDefinition(access);
      const progress = await this.invitationRepo.findProgress(progressIdOf(invitation));
      if (!canFinish(definition, progress, this.now())) {
        throw new ValidationError('Debes responder todas las preguntas antes de enviar la evaluación.');
      }
      return this.completeTimed(access, progress, tokenHash);
    }

    if (invitation.module === MODULES.B) {
      if (finalize !== true) {
        throw new ValidationError(
          'Confirma el envío de tu evaluación.'
        );
      }

      if (candidate.moduleB?.status === MODULE_B_STATUSES.COMPLETED) {
        return {
          state: 'COMPLETED',
          submittedAt: candidate.moduleB.submittedAt,
          alreadySubmitted: true,
        };
      }

      const macrocase = getSectionedMacrocase(
        access.event.moduleB.macrocase
      );

      const progress = await this.invitationRepo.findProgress(
        progressIdOf(invitation)
      );

      const result = await this.invitationRepo.completeWithSubmission(
        tokenHash,
        {
          module: MODULES.B,
          instrumentVersion: `MACROCASE:${macrocase.id}:v${MACROCASE_SCHEMA_VERSION}`,
          answers: finalAnswers(macrocase, progress),
        }
      );

      if (result.state === 'COMPLETED' && !result.alreadySubmitted) {
        await this.candidateRepo.update(invitation.candidateId, {
          moduleB: {
            ...candidate.moduleB,
            status: MODULE_B_STATUSES.COMPLETED,
            submittedAt: result.submittedAt,
          },
        });
        await this.notifyIfPhaseReady(invitation.eventId, invitation.orgId, MODULES.B);
      }

      return result;
    }

    if (!answers) {
      throw new ValidationError('Envía las respuestas de tu evaluación.');
    }
    const instrument = instrumentOf(access.event);
    const questions = instrument.questions;
    if (!Array.isArray(answers) || answers.length !== questions.length
      || new Set(answers.map((answer) => answer.questionId)).size !== questions.length
      || questions.some((question) => !answers.some((answer) => answer.questionId === question.id))
      || answers.some((answer) => !Number.isInteger(answer.value) || answer.value < 1 || answer.value > 5)) {
      throw new ValidationError(`El Módulo A requiere responder las ${questions.length} preguntas asignadas, una sola vez y con valores de 1 a 5.`);
    }
    // Keep authoritative question text beside each answer for historical reviews.
    const normalizedAnswers = questions.map((question, index) => ({
      questionId: question.id, value: answers.find((answer) => answer.questionId === question.id).value,
      ...(access.event.moduleA?.instrument ? { text: question.text, dimension: question.dimension || '', number: index + 1 } : {}),
    }));

    const result = await this.invitationRepo.completeWithSubmission(
      tokenHash,
      {
        module: MODULES.A,
        instrumentVersion: instrument.instrumentVersion,
        answers: normalizedAnswers,
      }
    );

    if (result.state === 'COMPLETED' && !result.alreadySubmitted && invitation) {
      await this.candidateRepo.update(invitation.candidateId, {
        status: CANDIDATE_STATUSES.EVALUATION_COMPLETED,
        submittedAt: result.submittedAt,
      });
      await this.notifyIfPhaseReady(invitation.eventId, invitation.orgId, MODULES.A);
    }

    return result;
  }

  /**
   * Sends one virtual invitation. The link works from the opening to the
   * closing the company chose: for Module A, the process's
   * `availableFrom`–`availableUntil`; for B and C, the `accessWindow` given
   * when sending them.
   */
  async publishOne({ candidate, event, organization, orgId, module, accessWindow }) {
    let invitation;

    try {
      const settings = await this.currentSettings();

      const previous = await this.invitationRepo.findActiveByCandidate(
        candidate.id,
        event.id,
        module
      );

      if (previous) {
        await this.invitationRepo.update(previous.id, {
          status: INVITATION_STATUSES.CANCELLED,
          cancelledAt: new Date(),
        });
      }

      const token = crypto.randomBytes(32).toString('base64url');
      const now = Date.now();
      const laterPhase = module === MODULES.B || module === MODULES.C;

      const availableAt = laterPhase
        ? (accessWindow ? accessWindow.opensAt.getTime() : now)
        : new Date(
            candidate.fechaHoraCita || event.availableFrom
          ).getTime();

      const expiresAt = new Date(
        laterPhase
          ? (accessWindow ? accessWindow.closesAt.getTime() : now + LEGACY_VALIDITY.laterPhaseDays * DAY_MS)
          : (event.availableUntil ? new Date(event.availableUntil).getTime() : Math.max(now, availableAt) + LEGACY_VALIDITY.moduleAHours * HOUR_MS)
      );
      if (Number.isNaN(availableAt) || Number.isNaN(expiresAt.getTime())) {
        throw new Error('La apertura o el cierre del enlace no son fechas válidas.');
      }

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

      const accessUrl = new URL(
        '/evaluation/access',
        this.frontendUrl
      );

      accessUrl.searchParams.set('token', token);

      const delivery = await this.emailService.sendInvitation({
        candidate,
        event,
        organization,
        accessUrl: accessUrl.toString(),
        module,
        availableAt: new Date(availableAt),
        expiresAt,
        templates: settings.emails,
      });
      const window = { opensAt: new Date(availableAt), closesAt: expiresAt };

      await this.candidateRepo.update(
        candidate.id,
        module === MODULES.B
          ? { moduleB: { status: MODULE_B_STATUSES.INVITATION_SENT, invitationId: invitation.id, invitedAt: new Date(), emailProviderId: delivery.id, accessWindow: window } }
          : module === MODULES.C
            ? { moduleC: { ...(candidate.moduleC || {}), status: MODULE_C_STATUSES.INVITATION_SENT, invitationId: invitation.id, invitedAt: new Date(), emailProviderId: delivery.id, accessWindow: window } }
            : { status: CANDIDATE_STATUSES.INVITATION_SENT, invitationId: invitation.id, invitedAt: new Date(), emailProviderId: delivery.id }
      );

      return {
        candidateId: candidate.id,
        sent: true,
      };
    } catch (error) {
      if (invitation) {
        await this.invitationRepo.update(invitation.id, { status: INVITATION_STATUSES.CANCELLED, cancelledAt: new Date() }).catch(() => {});
      }
      if (module === MODULES.C) await this.candidateRepo.update(candidate.id, { moduleC: { ...(candidate.moduleC || {}), status: 'INVITATION_FAILED' } }).catch(() => {});

      return {
        candidateId: candidate.id,
        sent: false,
        message: error.message,
      };
    }
  }

  summarize(results) {
    return {
      total: results.length,
      sent: results.filter((item) => item.sent).length,
      failed: results.filter((item) => !item.sent).length,
      failures: results
        .filter((item) => !item.sent)
        .map(({ candidateId, message }) => ({
          candidateId,
          message,
        })),
    };
  }

  requireFrontendUrl() {
    if (!this.frontendUrl) {
      throw new ValidationError(
        'FRONTEND_URL no está configurada en el backend.'
      );
    }
  }
}

module.exports = InvitationService;


