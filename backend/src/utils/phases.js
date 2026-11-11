/**
 * Where each evaluation phase of a process stands. A phase is finished when
 * everyone still in it has answered; candidates withdrawn from it (absent,
 * for example) no longer hold the process back.
 */

const WITHDRAWN = 'WITHDRAWN';

const hasResponse = (candidate) => Boolean(candidate.submittedAt || candidate.status === 'EVALUATION_COMPLETED');

const stageStatus = (candidate, module) => (module === 'A' ? candidate.status : candidate[`module${module}`]?.status);

const isWithdrawn = (candidate, module) => stageStatus(candidate, module) === WITHDRAWN;

const hasCompleted = (candidate, module) => (module === 'A' ? hasResponse(candidate) : stageStatus(candidate, module) === 'COMPLETED');

/** Module A goes to everyone; later modules only to whoever was sent them. */
function inPhase(candidate, module) {
  if (module === 'A') return true;
  if (module === 'B') return Boolean(candidate.moduleB);
  return Boolean(candidate.moduleC?.assignedQuestions?.length);
}

/** @returns {{ total: number, completed: number, open: number, withdrawn: number, complete: boolean }} */
function phaseState(module, candidates) {
  const participants = candidates.filter((candidate) => inPhase(candidate, module));
  const withdrawn = participants.filter((candidate) => isWithdrawn(candidate, module)).length;
  const completed = participants.filter((candidate) => hasCompleted(candidate, module)).length;
  const open = participants.length - withdrawn - completed;
  return { total: participants.length, completed, open, withdrawn, complete: completed > 0 && open === 0 };
}

module.exports = { WITHDRAWN, hasResponse, isWithdrawn, hasCompleted, inPhase, phaseState };
