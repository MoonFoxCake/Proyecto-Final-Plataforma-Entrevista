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

// Evaluation stages. Module A (questionnaire) goes to every candidate; after
// its results are published, the company picks who takes Module B (macrocase).
const MODULES = Object.freeze({
  A: 'A',
  B: 'B',
});

// candidate.moduleB.status
const MODULE_B_STATUSES = Object.freeze({
  INVITATION_SENT: 'INVITATION_SENT',
  COMPLETED: 'COMPLETED',
});

const INVITATION_STATUSES = Object.freeze({
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
});

module.exports = { ROLES, CANDIDATE_STATUSES, INVITATION_STATUSES, MODULES, MODULE_B_STATUSES };
