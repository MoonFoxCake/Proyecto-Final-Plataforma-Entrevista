import api from './api';

export async function validateInvitationAccess(token) {
  const { data } = await api.get('/invitations/access', { params: { token } });
  return data?.data ?? { state: 'INVALID' };
}

export async function submitEvaluation(token, answers) {
  const { data } = await api.post('/invitations/access/submit', { token, answers });
  return data?.data ?? null;
}

/** Module B: the stage the candidate is on (resumes after a reload). */
export async function getMacrocaseStage(token) {
  const { data } = await api.post('/invitations/access/macrocase/stage', { token });
  return data?.data ?? { state: 'INVALID' };
}

/**
 * Module B: one candidate action (`START`, `FINISH_NARRATIVE`,
 * `START_TIMER`, `SAVE_DRAFT`, `ANSWER`); resolves with the resulting stage.
 */
export async function advanceMacrocase(token, action) {
  const { data } = await api.post('/invitations/access/macrocase/advance', { token, action });
  return data?.data ?? { state: 'INVALID' };
}

/** Confirms the answers saved stage by stage as the final submission. */
export async function finalizeEvaluation(token) {
  const { data } = await api.post('/invitations/access/submit', { token, finalize: true });
  return data?.data ?? null;
}

export const finalizeMacrocase = finalizeEvaluation;

/** Timed evaluations: stage, saved answers and remaining time (resumes after a reload). */
export async function getTimedState(token) {
  const { data } = await api.post('/invitations/access/timed/state', { token });
  return data?.data ?? { state: 'INVALID' };
}

/** Timed evaluations: one candidate action (`START`, `STORY_DONE`, `ANSWER`). */
export async function advanceTimed(token, action) {
  const { data } = await api.post('/invitations/access/timed/advance', { token, action });
  return data?.data ?? { state: 'INVALID' };
}
