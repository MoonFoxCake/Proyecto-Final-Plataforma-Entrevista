const {
  AUDIT_ACTIONS, CANDIDATE_STATUSES, CITATION_STATUSES, CREDENTIAL_STATUSES, MODULE_B_STATUSES, MODULES,
} = require('../utils/constants');
const { ExternalServiceError, NotFoundError, ValidationError } = require('../utils/errors');
const { isOnsite, modulesOf } = require('../utils/eventModality');
const { endOfAppointmentDay, generateAccessCode, hashAccessCode } = require('../utils/accessCode');

const MAX_CODE_ATTEMPTS = 5;
// Printable or usable: an assignment with one of these already has a code.
const LIVE = [CREDENTIAL_STATUSES.GENERATED, CREDENTIAL_STATUSES.ENABLED];

const byName = (a, b) => a.nombreCompleto.localeCompare(b.nombreCompleto, 'es', { sensitivity: 'base' });

/** "Concurso Analista 2026" → "concurso-analista-2026", for file names. */
const slug = (text = '') => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'evento';

/**
 * Temporary access credentials for onsite evaluations, prepared ahead of
 * the appointment and printed on cards.
 *
 * - One code per candidate and module, valid until the end of the
 *   appointment's day (Guatemala time) and only once (used at login).
 * - The code is returned only in the response that issues it; the server
 *   keeps its HMAC. A lost card is revoked and reissued, never re-printed.
 * - Issuing for everyone again skips whoever already has a code, so a
 *   repeated click cannot regenerate the batch.
 * - Who issued or revoked each credential, and when, is stored on the
 *   credential and in the audit log (never the code).
 */
class AccessCredentialService {
  constructor({
    credentialRepo, auditRepo, candidateRepo, eventService, printableService, pepper, now = () => new Date(), generateCode = generateAccessCode,
  }) {
    this.credentialRepo = credentialRepo;
    this.auditRepo = auditRepo;
    this.candidateRepo = candidateRepo;
    this.eventService = eventService;
    this.printableService = printableService;
    this.pepper = pepper;
    this.now = now;
    this.generateCode = generateCode;
  }

  /** Status as of now: an unused credential past its day reads as EXPIRED. */
  static effectiveStatus(credential, now) {
    if (LIVE.includes(credential.status) && new Date(credential.expiresAt) <= now) return CREDENTIAL_STATUSES.EXPIRED;
    return credential.status;
  }

  /** Each assignment's current (latest) credential, keyed `${candidateId}_${module}`. */
  static latestByAssignment(credentials, orgId) {
    const latest = new Map();
    for (const credential of credentials.filter((item) => item.orgId === orgId)) {
      const key = `${credential.candidateId}_${credential.module}`;
      if (!latest.has(key) || new Date(credential.createdAt) > new Date(latest.get(key).createdAt)) latest.set(key, credential);
    }
    return latest;
  }

  /** What the company may see of a credential: never the code or its hash. */
  static toPublic(credential, now) {
    const { codeHash, ...rest } = credential;
    return { ...rest, status: AccessCredentialService.effectiveStatus(credential, now) };
  }

  /**
   * Credentials of an onsite event, one row per candidate and module (the
   * current credential, or none), alphabetical, with counts per module.
   */
  async summary(eventId, orgId) {
    const event = await this.requireOnsiteEvent(eventId, orgId);
    const now = this.now();
    const [candidates, credentials] = await Promise.all([
      this.candidateRepo.findByEvent(eventId, orgId),
      this.credentialRepo.findByEvent(eventId),
    ]);
    const latest = AccessCredentialService.latestByAssignment(credentials, orgId);

    const modules =modulesOf(event).map((module) => {
      const rows = candidates
        .filter((candidate) => module === MODULES.A || candidate.moduleB?.citation || latest.has(`${candidate.id}_${module}`))
        .sort(byName)
        .map((candidate) => {
          const credential = latest.get(`${candidate.id}_${module}`);
          const eligibility = this.eligibility(event, candidate, module, now);
          return {
            candidateId: candidate.id,
            nombreCompleto: candidate.nombreCompleto,
            credential: credential ? AccessCredentialService.toPublic(credential, now) : null,
            canIssue: !eligibility.problem,
            ...(eligibility.problem ? { blockedReason: eligibility.problem } : {}),
          };
        });
      const count = (status) => rows.filter((row) => row.credential?.status === status).length;
      return {
        module,
        rows,
        counts: {
          total: rows.length,
          prepared: count(CREDENTIAL_STATUSES.GENERATED),
          enabled: count(CREDENTIAL_STATUSES.ENABLED),
          used: count(CREDENTIAL_STATUSES.USED),
          revoked: count(CREDENTIAL_STATUSES.REVOKED),
          expired: count(CREDENTIAL_STATUSES.EXPIRED),
          // Without a code that can still be printed or used.
          pending: rows.filter((row) => !row.credential
            || (!LIVE.includes(row.credential.status) && row.credential.status !== CREDENTIAL_STATUSES.USED)).length,
        },
      };
    });
    return { eventId, modules };
  }

  /**
   * Issues codes for the selected candidates. Candidates who already have
   * a code are skipped (`skipped`); those who cannot get one are reported
   * (`rejected`). The codes are in `issued`, alphabetical — the only time
   * they are ever available.
   */
  async issueBatch(eventId, orgId, { module, candidateIds, paper }, actorUid) {
    this.requirePepper();
    const event = await this.requireOnsiteEvent(eventId, orgId);
    const candidates = await this.selectCandidates(eventId, orgId, candidateIds);
    const now = this.now();
    const issued = [];
    const skipped = [];
    const rejected = [];

    for (const candidate of candidates) {
      const eligibility = this.eligibility(event, candidate, module, now);
      if (eligibility.problem) {
        rejected.push({ candidateId: candidate.id, nombreCompleto: candidate.nombreCompleto, reason: eligibility.problem });
        continue;
      }
      const result = await this.issueOne({ event, candidate, module, eligibility, actorUid, now });
      if (result.skipped) {
        skipped.push({ candidateId: candidate.id, nombreCompleto: candidate.nombreCompleto, status: AccessCredentialService.effectiveStatus(result.current, now) });
      } else {
        issued.push(result.issued);
      }
    }

    return this.withCards(event, {
      module, issued: issued.sort(byName), skipped: skipped.sort(byName), rejected: rejected.sort(byName),
    }, paper);
  }

  /**
   * Adds the printable cards PDF (base64) to an issuing result. It is built
   * in memory from the codes just issued and travels only in this response:
   * no copy is kept, and the codes never come back to the server to be
   * printed later.
   */
  async withCards(event, result, paper) {
    if (!result.issued.length || !this.printableService) return result;
    const pdf = await this.printableService.accessCards({ eventName: event.name || 'Evaluación presencial', items: result.issued, paper });
    return {
      ...result,
      cardsPdf: {
        fileName: `tarjetas-acceso-${slug(event.name)}-modulo-${result.module.toLowerCase()}.pdf`,
        contentType: 'application/pdf',
        base64: pdf.toString('base64'),
      },
    };
  }

  /**
   * Attendance sheet (PDF) of the candidates cited to a module: name,
   * internal id and appointment time, alphabetical. It holds no access
   * codes, so it can be downloaded any time.
   *
   * @returns {Promise<{ fileName: string, pdf: Buffer }>}
   */
  async attendanceSheet(eventId, orgId, module, paper) {
    const event = await this.requireOnsiteEvent(eventId, orgId);
    if (!modulesOf(event).includes(module)) throw new ValidationError(`Este evento no incluye el Módulo ${module}.`);
    const candidates = await this.candidateRepo.findByEvent(eventId, orgId);
    const rows = candidates
      .map((candidate) => {
        const citation = module === MODULES.A ? candidate.citation : candidate.moduleB?.citation;
        if (citation?.status !== CITATION_STATUSES.SENT) return null;
        const appointment = module === MODULES.A ? event.onsite : citation.appointment;
        return { nombreCompleto: candidate.nombreCompleto, internalId: candidate.id, appointmentAt: appointment?.startsAt, appointment };
      })
      .filter(Boolean)
      .sort(byName);
    // Module B candidates may have been cited to different sessions.
    const sameSession = rows.every((row) => String(row.appointment?.startsAt) === String(rows[0]?.appointment?.startsAt));
    const session = module === MODULES.A ? event.onsite : sameSession ? rows[0]?.appointment : null;

    const pdf = await this.printableService.attendanceList({
      eventName: event.name || 'Evaluación presencial', module, session, rows, paper, generatedAt: this.now(),
    });
    return { fileName: `lista-asistencia-${slug(event.name)}-modulo-${module.toLowerCase()}.pdf`, pdf };
  }

  /**
   * Controlled replacement of one credential (e.g. a lost card): revokes it
   * and issues a new code for the same assignment. The evaluation itself is
   * not duplicated — it belongs to the candidate, not to the code.
   */
  async reissue(eventId, orgId, credentialId, actorUid, reason, paper) {
    this.requirePepper();
    const event = await this.requireOnsiteEvent(eventId, orgId);
    const credential = await this.requireCredential(credentialId, eventId, orgId);
    const now = this.now();
    if (AccessCredentialService.effectiveStatus(credential, now) === CREDENTIAL_STATUSES.USED) {
      throw new ValidationError('Esta credencial ya se utilizó para iniciar la evaluación: no se puede reemitir.');
    }
    const candidate = await this.candidateRepo.findById(credential.candidateId);
    const eligibility = this.eligibility(event, candidate, credential.module, now);
    if (eligibility.problem) throw new ValidationError(`No se puede reemitir: ${eligibility.problem}`);

    const result = await this.issueOne({
      event, candidate, module: credential.module, eligibility, actorUid, now, replaceId: credential.id, reason,
    });
    return this.withCards(event, { module: credential.module, issued: [result.issued], skipped: [], rejected: [] }, paper);
  }

  /** Revokes a credential that has not been used, so its code stops working. */
  async revoke(eventId, orgId, credentialId, actorUid, reason) {
    await this.requireOnsiteEvent(eventId, orgId);
    const now = this.now();
    const updated = await this.credentialRepo.update(credentialId, (current) => {
      if (!current || current.eventId !== eventId || current.orgId !== orgId) throw new NotFoundError('Credencial no encontrada.');
      if (!LIVE.includes(AccessCredentialService.effectiveStatus(current, now))) {
        throw new ValidationError('Solo se pueden revocar credenciales generadas o habilitadas que no hayan vencido.');
      }
      return {
        status: CREDENTIAL_STATUSES.REVOKED, revokedAt: now, revokedBy: actorUid, revokeReason: reason || '',
      };
    });
    await this.audit({ action: AUDIT_ACTIONS.CREDENTIAL_REVOKED, credential: updated, actorUid, at: now, reason });
    return AccessCredentialService.toPublic(updated, now);
  }

  // ------------------------------------------------------------- internal

  async issueOne({ event, candidate, module, eligibility, actorUid, now, replaceId = null, reason = '' }) {
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
      const code = this.generateCode();
      let revokedCurrent = false;
      const result = await this.credentialRepo.issue({
        orgId: event.orgId ?? event.recruiterOrgId,
        eventId: event.id,
        candidateId: candidate.id,
        module,
        codeHash: hashAccessCode(code, this.pepper),
        status: CREDENTIAL_STATUSES.GENERATED,
        expiresAt: eligibility.expiresAt,
        appointmentStartsAt: eligibility.appointment.startsAt,
        createdAt: now,
        createdBy: actorUid,
      }, (current) => {
        const decision = this.decide(current, { replaceId, now, actorUid, reason });
        revokedCurrent = Boolean(decision.currentChanges);
        return decision;
      });
      if (result.clash) continue;
      if (result.skipped) return result;

      if (revokedCurrent) {
        await this.audit({ action: AUDIT_ACTIONS.CREDENTIAL_REVOKED, credential: result.current, actorUid, at: now, reason });
      }
      await this.audit({
        action: replaceId ? AUDIT_ACTIONS.CREDENTIAL_REISSUED : AUDIT_ACTIONS.CREDENTIAL_ISSUED,
        credential: result.issued,
        actorUid,
        at: now,
        reason: replaceId ? reason : undefined,
      });
      return {
        issued: {
          credentialId: result.issued.id,
          candidateId: candidate.id,
          nombreCompleto: candidate.nombreCompleto,
          module,
          code,
          expiresAt: eligibility.expiresAt,
          appointment: eligibility.appointment,
        },
      };
    }
    throw new ExternalServiceError('No se pudo generar un código único. Intenta nuevamente.');
  }

  /** Inside the issuing transaction: skip, issue, or replace the current credential. */
  decide(current, { replaceId, now, actorUid, reason }) {
    const status = current && AccessCredentialService.effectiveStatus(current, now);
    if (!replaceId) {
      return [...LIVE, CREDENTIAL_STATUSES.USED].includes(status) ? { action: 'skip' } : { action: 'issue' };
    }
    if (current?.id !== replaceId) {
      throw new ValidationError('Esta credencial ya fue reemplazada por otra. Actualiza la lista.');
    }
    if (status === CREDENTIAL_STATUSES.USED) {
      throw new ValidationError('Esta credencial ya se utilizó para iniciar la evaluación: no se puede reemitir.');
    }
    return {
      action: 'issue',
      currentChanges: LIVE.includes(status)
        ? { status: CREDENTIAL_STATUSES.REVOKED, revokedAt: now, revokedBy: actorUid, revokeReason: reason || 'Reemitida' }
        : null,
    };
  }

  /**
   * Whether a candidate can get a code for a module now, and until when it
   * would be valid. Module A uses the event's session; Module B the
   * candidate's own Module B citation.
   */
  eligibility(event, candidate, module, now) {
    if (!modulesOf(event).includes(module)) return { problem: `Este evento no incluye el Módulo ${module}.` };
    let appointment;
    if (module === MODULES.A) {
      if (candidate.status === CANDIDATE_STATUSES.EVALUATION_COMPLETED || candidate.submittedAt) return { problem: 'ya completó el Módulo A' };
      appointment = event.onsite;
    } else {
      if (candidate.moduleB?.status === MODULE_B_STATUSES.COMPLETED) return { problem: 'ya completó el Módulo B' };
      if (candidate.moduleB?.status !== MODULE_B_STATUSES.CITED || !candidate.moduleB.citation?.appointment) {
        return { problem: 'no tiene citación al Módulo B' };
      }
      appointment = candidate.moduleB.citation.appointment;
    }
    if (!appointment?.startsAt) return { problem: 'la cita no tiene fecha' };
    const expiresAt = endOfAppointmentDay(appointment.startsAt);
    if (expiresAt <= now) return { problem: 'la jornada de su cita ya concluyó' };
    return {
      expiresAt,
      appointment: {
        venue: appointment.venue, room: appointment.room, startsAt: appointment.startsAt, endsAt: appointment.endsAt,
      },
    };
  }

  async selectCandidates(eventId, orgId, candidateIds) {
    const candidates = await this.candidateRepo.findByEvent(eventId, orgId);
    const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
    const selected = [...new Set(candidateIds)].map((id) => byId.get(id));
    if (selected.some((candidate) => !candidate)) {
      throw new ValidationError('Uno o más candidatos no pertenecen a este evento.');
    }
    return selected;
  }

  async requireOnsiteEvent(eventId, orgId) {
    const event = await this.eventService.getEvent(eventId, orgId);
    if (!isOnsite(event)) throw new ValidationError('Los accesos temporales solo aplican a eventos presenciales.');
    return event;
  }

  async requireCredential(credentialId, eventId, orgId) {
    const credential = await this.credentialRepo.findById(credentialId);
    if (!credential || credential.eventId !== eventId || credential.orgId !== orgId) {
      throw new NotFoundError('Credencial no encontrada.');
    }
    return credential;
  }

  requirePepper() {
    if (!this.pepper) {
      throw new ExternalServiceError('ACCESS_CODE_PEPPER no está configurada en el backend: no se pueden generar accesos.');
    }
  }

  /**
   * Best effort: the credential itself already records who issued or
   * revoked it, and failing here after issuing would lose a code that
   * exists. Only ids are logged on failure, never codes.
   */
  async audit({ action, credential, actorUid, at, reason }) {
    try {
      await this.auditRepo.record({
        orgId: credential.orgId,
        eventId: credential.eventId,
        candidateId: credential.candidateId,
        module: credential.module,
        credentialId: credential.id,
        action,
        actorUid,
        at,
        ...(reason ? { reason } : {}),
      });
    } catch (error) {
      console.error(`No se pudo registrar ${action} de la credencial ${credential.id} en auditLog:`, error.message);
    }
  }
}

module.exports = AccessCredentialService;
