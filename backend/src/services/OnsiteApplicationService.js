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
 * appointment: the roster of cited candidates, with when their codes work,
 * and marking who is present.
 *
 * - Any company user of the organization can act as applicator (D9); the
 *   event must belong to their organization.
 * - Codes are not enabled by hand: each one works by itself from the start
 *   of the appointment, during its entry window. Attendance is the
 *   applicator's own record and does not gate access.
 * - Attendance is only accepted on the appointment's day, and every mark
 *   records who did it and when.
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
   * with attendance, access window, access and evaluation status, and counts.
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
        const appointment = this.appointmentOf(event, candidate, module);
        return {
          candidateId: candidate.id,
          nombreCompleto: candidate.nombreCompleto,
          // To check against the candidate's ID document.
          cedula: candidate.cedula,
          appointmentAt: appointment?.startsAt ?? null,
          accessWindow: AccessCredentialService.accessWindow(appointment, now),
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
      accessWindow: module === MODULES.A ? AccessCredentialService.accessWindow(event.onsite, now) : null,
      isAppointmentDay: module === MODULES.A ? isAppointmentDay(event.onsite.startsAt, now) : null,
      rows,
      counts: {
        cited: rows.length,
        present: count((row) => row.attendance?.status === ATTENDANCE_STATUSES.PRESENT),
        withCode: count((row) => row.credential && row.credential.status !== CREDENTIAL_STATUSES.REVOKED),
        inProgress: count((row) => row.evaluation === 'IN_PROGRESS'),
        completed: count((row) => row.evaluation === 'COMPLETED'),
      },
    };
  }

  /**
   * Marks a candidate present (after checking their identity) or undoes it.
   * Undoing is refused once their code was used: they did come.
   */
  async setAttendance(eventId, orgId, { module, candidateId, present }, actorUid) {
    const event = await this.requireOnsiteEvent(eventId, orgId, module);
    const candidate = await this.requireCandidate(eventId, orgId, candidateId);
    const now = this.now();
    this.requireAppointmentDay(event, candidate, module, now);

    if (!present) {
      const credential = await this.currentCredential(eventId, orgId, candidateId, module);
      const status = credential && AccessCredentialService.effectiveStatus(credential, now);
      if (status === CREDENTIAL_STATUSES.USED) {
        throw new ValidationError('No se puede quitar la asistencia: el candidato ya utilizó su acceso.');
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

  // ------------------------------------------------------------- internal

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
      throw new ValidationError(`La asistencia solo se registra el día de la cita (${formatDay(appointment.startsAt)}).`);
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
