const {
  ATTENDANCE_STATUSES, AUDIT_ACTIONS, CANDIDATE_STATUSES, CITATION_STATUSES, CREDENTIAL_STATUSES, MODULE_B_STATUSES, MODULES,
} = require('../utils/constants');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { isOnsite, modulesOf } = require('../utils/eventModality');
const { isAppointmentDay } = require('../utils/accessCode');
const AccessCredentialService = require('./AccessCredentialService');

const byName = (a, b) => a.nombreCompleto.localeCompare(b.nombreCompleto, 'es', { sensitivity: 'base' });
const formatDay = (value) => new Intl.DateTimeFormat('es-GT', { dateStyle: 'long', timeZone: 'America/Guatemala' }).format(new Date(value));

/**
 * The applicator's side of an onsite evaluation, on the day of the
 * appointment: the roster of cited candidates, marking who is present
 * (after checking their identity) and enabling their access codes.
 *
 * - Any company user of the organization can act as applicator (D9); the
 *   event must belong to their organization.
 * - A code is only enabled for a candidate marked present: absent
 *   candidates keep their code unused until it expires (D10).
 * - Attendance and enabling are only accepted on the appointment's day, so
 *   a code cannot be enabled days before and used from anywhere.
 * - Every mark and every enabling records who did it and when.
 */
class OnsiteApplicationService {
  constructor({
    eventService, candidateRepo, credentialRepo, auditRepo, now = () => new Date(),
  }) {
    this.eventService = eventService;
    this.candidateRepo = candidateRepo;
    this.credentialRepo = credentialRepo;
    this.auditRepo = auditRepo;
    this.now = now;
  }

  /**
   * Candidates cited to a module (or holding a code for it), alphabetical,
   * with attendance, access and evaluation status, and counts.
   */
  async roster(eventId, orgId, module) {
    const event = await this.requireOnsiteEvent(eventId, orgId, module);
    const now = this.now();
    const [candidates, credentials] = await Promise.all([
      this.candidateRepo.findByEvent(eventId, orgId),
      this.credentialRepo.findByEvent(eventId),
    ]);
    const latest = AccessCredentialService.latestByAssignment(credentials, orgId);

    const rows = candidates
      .map((candidate) => {
        const credential = latest.get(`${candidate.id}_${module}`);
        const citation = module === MODULES.A ? candidate.citation : candidate.moduleB?.citation;
        if (citation?.status !== CITATION_STATUSES.SENT && !credential) return null;
        const publicCredential = credential ? AccessCredentialService.toPublic(credential, now) : null;
        return {
          candidateId: candidate.id,
          nombreCompleto: candidate.nombreCompleto,
          // To check against the candidate's ID document.
          cedula: candidate.cedula,
          appointmentAt: this.appointmentOf(event, candidate, module)?.startsAt ?? null,
          attendance: candidate.attendance?.[module] ?? null,
          credential: publicCredential,
          evaluation: this.evaluationStatus(candidate, module, publicCredential),
        };
      })
      .filter(Boolean)
      .sort(byName);

    const count = (predicate) => rows.filter(predicate).length;
    return {
      eventId,
      module,
      session: module === MODULES.A ? event.onsite : null,
      isAppointmentDay: module === MODULES.A ? isAppointmentDay(event.onsite.startsAt, now) : null,
      rows,
      counts: {
        cited: rows.length,
        present: count((row) => row.attendance?.status === ATTENDANCE_STATUSES.PRESENT),
        withCode: count((row) => row.credential && row.credential.status !== CREDENTIAL_STATUSES.REVOKED),
        enabled: count((row) => row.credential?.status === CREDENTIAL_STATUSES.ENABLED),
        inProgress: count((row) => row.evaluation === 'IN_PROGRESS'),
        completed: count((row) => row.evaluation === 'COMPLETED'),
        // Present, with a code ready to enable: what "enable present" would do.
        readyToEnable: count((row) => row.attendance?.status === ATTENDANCE_STATUSES.PRESENT
          && row.credential?.status === CREDENTIAL_STATUSES.GENERATED),
      },
    };
  }

  /**
   * Marks a candidate present (after checking their identity) or undoes it.
   * Undoing is refused once their code was enabled or used.
   */
  async setAttendance(eventId, orgId, { module, candidateId, present }, actorUid) {
    const event = await this.requireOnsiteEvent(eventId, orgId, module);
    const candidate = await this.requireCandidate(eventId, orgId, candidateId);
    const now = this.now();
    this.requireAppointmentDay(event, candidate, module, now);

    if (!present) {
      const credential = await this.currentCredential(eventId, orgId, candidateId, module);
      const status = credential && AccessCredentialService.effectiveStatus(credential, now);
      if ([CREDENTIAL_STATUSES.ENABLED, CREDENTIAL_STATUSES.USED].includes(status)) {
        throw new ValidationError('No se puede quitar la asistencia: su acceso ya fue habilitado o utilizado. Si es necesario, revoca el acceso.');
      }
    }

    const attendance = { ...(candidate.attendance || {}) };
    if (present) attendance[module] = { status: ATTENDANCE_STATUSES.PRESENT, markedAt: now, markedBy: actorUid };
    else delete attendance[module];
    await this.candidateRepo.update(candidateId, { attendance });
    await this.audit({
      action: present ? AUDIT_ACTIONS.ATTENDANCE_MARKED : AUDIT_ACTIONS.ATTENDANCE_UNMARKED,
      orgId, eventId, candidateId, module, actorUid, at: now,
    });
    return attendance[module] ?? null;
  }

  /**
   * Enables the codes of the given candidates (one or many). Only candidates
   * marked present with a code that is prepared and not expired are
   * enabled; the rest are reported with the reason, so a mass action can
   * never enable an absent candidate.
   */
  async enable(eventId, orgId, { module, candidateIds }, actorUid) {
    const event = await this.requireOnsiteEvent(eventId, orgId, module);
    const now = this.now();
    const candidates = await this.candidateRepo.findByEvent(eventId, orgId);
    const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
    const selected = [...new Set(candidateIds)].map((id) => byId.get(id));
    if (selected.some((candidate) => !candidate)) {
      throw new ValidationError('Uno o más candidatos no pertenecen a este evento.');
    }
    const latest = AccessCredentialService.latestByAssignment(await this.credentialRepo.findByEvent(eventId), orgId);
    const enabled = [];
    const skipped = [];

    for (const candidate of selected.sort(byName)) {
      const skip = (reason) => skipped.push({ candidateId: candidate.id, nombreCompleto: candidate.nombreCompleto, reason });
      const appointment = this.appointmentOf(event, candidate, module);
      if (!appointment?.startsAt || !isAppointmentDay(appointment.startsAt, now)) {
        skip('hoy no es el día de su cita');
        continue;
      }
      if (candidate.attendance?.[module]?.status !== ATTENDANCE_STATUSES.PRESENT) {
        skip('no está marcado como presente');
        continue;
      }
      const credential = latest.get(`${candidate.id}_${module}`);
      if (!credential) {
        skip('no tiene un acceso preparado');
        continue;
      }
      try {
        const updated = await this.credentialRepo.update(credential.id, (current) => {
          const status = AccessCredentialService.effectiveStatus(current, now);
          if (status !== CREDENTIAL_STATUSES.GENERATED) throw new ValidationError(this.notEnableableReason(status));
          return { status: CREDENTIAL_STATUSES.ENABLED, enabledAt: now, enabledBy: actorUid };
        });
        await this.audit({
          action: AUDIT_ACTIONS.CREDENTIAL_ENABLED, orgId, eventId, candidateId: candidate.id, module, credentialId: updated.id, actorUid, at: now,
        });
        enabled.push({ candidateId: candidate.id, nombreCompleto: candidate.nombreCompleto, credentialId: updated.id });
      } catch (error) {
        if (!(error instanceof ValidationError)) throw error;
        skip(error.message);
      }
    }
    return { module, enabled, skipped };
  }

  // ------------------------------------------------------------- internal

  notEnableableReason(status) {
    return {
      [CREDENTIAL_STATUSES.ENABLED]: 'su acceso ya está habilitado',
      [CREDENTIAL_STATUSES.USED]: 'su acceso ya se utilizó',
      [CREDENTIAL_STATUSES.REVOKED]: 'su acceso fue revocado; reemítelo',
      [CREDENTIAL_STATUSES.EXPIRED]: 'su acceso venció',
    }[status] || 'su acceso no se puede habilitar';
  }

  evaluationStatus(candidate, module, credential) {
    const completed = module === MODULES.A
      ? candidate.status === CANDIDATE_STATUSES.EVALUATION_COMPLETED || Boolean(candidate.submittedAt)
      : candidate.moduleB?.status === MODULE_B_STATUSES.COMPLETED;
    if (completed) return 'COMPLETED';
    return credential?.status === CREDENTIAL_STATUSES.USED ? 'IN_PROGRESS' : 'PENDING';
  }

  appointmentOf(event, candidate, module) {
    return module === MODULES.A ? event.onsite : candidate.moduleB?.citation?.appointment;
  }

  requireAppointmentDay(event, candidate, module, now) {
    const appointment = this.appointmentOf(event, candidate, module);
    if (!appointment?.startsAt) throw new ValidationError('El candidato no tiene una cita para este módulo.');
    if (!isAppointmentDay(appointment.startsAt, now)) {
      throw new ValidationError(`La asistencia y la habilitación solo se registran el día de la cita (${formatDay(appointment.startsAt)}).`);
    }
  }

  async currentCredential(eventId, orgId, candidateId, module) {
    const latest = AccessCredentialService.latestByAssignment(await this.credentialRepo.findByEvent(eventId), orgId);
    return latest.get(`${candidateId}_${module}`) ?? null;
  }

  async requireOnsiteEvent(eventId, orgId, module) {
    const event = await this.eventService.getEvent(eventId, orgId);
    if (!isOnsite(event)) throw new ValidationError('La aplicación presencial solo aplica a eventos presenciales.');
    if (!modulesOf(event).includes(module)) throw new ValidationError(`Este evento no incluye el Módulo ${module}.`);
    return event;
  }

  async requireCandidate(eventId, orgId, candidateId) {
    const candidate = await this.candidateRepo.findById(candidateId);
    if (!candidate || candidate.eventId !== eventId || candidate.orgId !== orgId) throw new NotFoundError('Candidato no encontrado.');
    return candidate;
  }

  /** Best effort, like credential audits: the record itself also stores who and when. */
  async audit(entry) {
    try {
      await this.auditRepo.record(entry);
    } catch (error) {
      console.error(`No se pudo registrar ${entry.action} en auditLog:`, error.message);
    }
  }
}

module.exports = OnsiteApplicationService;
