/**
 * Application-wide constants, frozen to prevent accidental mutation.
 */

const ROLES = Object.freeze({
  ADMIN: 'admin',
  COMPANY: 'company',
  CANDIDATE: 'candidate',
});

const CANDIDATE_STATUSES = Object.freeze({
  INVITED_PENDING: 'INVITED_PENDING',
  INVITATION_SENT: 'INVITATION_SENT',
  EVALUATION_COMPLETED: 'EVALUATION_COMPLETED',
});

const INVITATION_STATUSES = Object.freeze({
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
});

module.exports = { ROLES, CANDIDATE_STATUSES, INVITATION_STATUSES };
