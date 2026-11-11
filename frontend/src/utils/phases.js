/** Where each phase stands. Mirrors backend/src/utils/phases.js. */

const statusOf = (candidate, module) => (module === 'A' ? candidate.status : candidate[`module${module}`]?.status);

export const isWithdrawn = (candidate, module) => statusOf(candidate, module) === 'WITHDRAWN';

export function hasCompleted(candidate, module) {
  if (module === 'A') return Boolean(candidate.submittedAt) || candidate.status === 'EVALUATION_COMPLETED';
  return statusOf(candidate, module) === 'COMPLETED';
}

export function inPhase(candidate, module) {
  if (module === 'A') return true;
  if (module === 'B') return Boolean(candidate.moduleB);
  return Boolean(candidate.moduleC?.assignedQuestions?.length);
}

export function phaseState(module, candidates) {
  const participants = candidates.filter((candidate) => inPhase(candidate, module));
  const withdrawn = participants.filter((candidate) => isWithdrawn(candidate, module)).length;
  const completed = participants.filter((candidate) => hasCompleted(candidate, module)).length;
  const open = participants.length - withdrawn - completed;
  return { total: participants.length, completed, open, withdrawn, complete: completed > 0 && open === 0 };
}

export const isOpenIn = (candidate, module) => inPhase(candidate, module) && !hasCompleted(candidate, module) && !isWithdrawn(candidate, module);
