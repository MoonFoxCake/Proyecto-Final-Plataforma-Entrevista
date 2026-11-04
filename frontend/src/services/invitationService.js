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

/** Module B: confirms the answers saved stage by stage as the final submission. */
export async function finalizeMacrocase(token) {
  const { data } = await api.post('/invitations/access/submit', { token, finalize: true });
  return data?.data ?? null;
}
