import api from './api';

export async function validateInvitationAccess(token) {
  const { data } = await api.get('/invitations/access', { params: { token } });
  return data?.data ?? { state: 'INVALID' };
}

export async function submitEvaluation(token, answers) {
  const { data } = await api.post('/invitations/access/submit', { token, answers });
  return data?.data ?? null;
}

/** Module B: written answers to the macrocase questions. */
export async function submitMacrocaseAnswers(token, macrocaseAnswers) {
  const { data } = await api.post('/invitations/access/submit', { token, macrocaseAnswers });
  return data?.data ?? null;
}
