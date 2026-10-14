/**
 * Application-wide constants, frozen to prevent accidental mutation.
 */

const ROLES = Object.freeze({
  ADMIN: 'admin',
  COMPANY: 'company',
  CANDIDATE: 'candidate',
});

// Evaluation lifecycle. Online events send a link (INVITATION_SENT); onsite
// events send a citation without any access (CITED). Delivery details of the
// citation live apart, in `candidate.citation`.
const CANDIDATE_STATUSES = Object.freeze({
  INVITED_PENDING: 'INVITED_PENDING',
  INVITATION_SENT: 'INVITATION_SENT',
  CITED: 'CITED',
  EVALUATION_COMPLETED: 'EVALUATION_COMPLETED',
});

// event.modality. Events created before modalities existed are online.
const MODALITIES = Object.freeze({
  ONLINE: 'online',
  ONSITE: 'onsite',
});

// candidate.citation.status (and candidate.moduleB.citation.status)
const CITATION_STATUSES = Object.freeze({
  SENT: 'SENT',
  FAILED: 'FAILED',
});

// Evaluation stages. Module A (questionnaire) goes to every candidate; after
// its results are published, the company picks who takes Module B (macrocase).
const MODULES = Object.freeze({
  A: 'A',
  B: 'B',
});

// candidate.moduleB.status
const MODULE_B_STATUSES = Object.freeze({
  INVITATION_SENT: 'INVITATION_SENT',
  CITED: 'CITED',
  COMPLETED: 'COMPLETED',
});

const INVITATION_STATUSES = Object.freeze({
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
});

// accessCredentials.status. GENERATED (printed, not usable yet) → ENABLED
// (the applicator verified the candidate) → USED (a session was opened).
// REVOKED at any point before use. EXPIRED is not stored: a GENERATED or
// ENABLED credential past `expiresAt` reads as expired.
const CREDENTIAL_STATUSES = Object.freeze({
  GENERATED: 'GENERATED',
  ENABLED: 'ENABLED',
  USED: 'USED',
  REVOKED: 'REVOKED',
  EXPIRED: 'EXPIRED',
});

// auditLog.action
const AUDIT_ACTIONS = Object.freeze({
  CREDENTIAL_ISSUED: 'CREDENTIAL_ISSUED',
  CREDENTIAL_REISSUED: 'CREDENTIAL_REISSUED',
  CREDENTIAL_REVOKED: 'CREDENTIAL_REVOKED',
  CREDENTIAL_ENABLED: 'CREDENTIAL_ENABLED',
  ATTENDANCE_MARKED: 'ATTENDANCE_MARKED',
  ATTENDANCE_UNMARKED: 'ATTENDANCE_UNMARKED',
  ONSITE_SESSION_STARTED: 'ONSITE_SESSION_STARTED',
});

// invitations.channel: how an access session was opened. Missing = the
// e-mailed link (online events); `onsite` = a code typed at the venue.
const ACCESS_CHANNELS = Object.freeze({
  ONSITE: 'onsite',
});

// candidate.attendance[module].status — set by the applicator after
// checking the candidate's identity at the venue.
const ATTENDANCE_STATUSES = Object.freeze({
  PRESENT: 'PRESENT',
});

module.exports = {
  ROLES,
  CANDIDATE_STATUSES,
  INVITATION_STATUSES,
  MODULES,
  MODULE_B_STATUSES,
  MODALITIES,
  CITATION_STATUSES,
  CREDENTIAL_STATUSES,
  AUDIT_ACTIONS,
  ATTENDANCE_STATUSES,
  ACCESS_CHANNELS,
};
