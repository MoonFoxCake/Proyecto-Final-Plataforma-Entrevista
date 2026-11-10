import api from './api.js';
const path = '/admin/question-groups';
export const listQuestionGroups = async () => (await api.get(path)).data.data;
export const createQuestionGroup = async (payload) => (await api.post(path, payload)).data.data;
export const updateQuestionGroup = async (id, payload) => (await api.put(`${path}/${encodeURIComponent(id)}`, payload)).data.data;
export const setQuestionGroupActive = async (group, active) => (await api.patch(`${path}/${encodeURIComponent(group.id)}/status`, { active, baseVersion: group.version })).data.data;
export const getQuestionGroupVersions = async (id) => (await api.get(`${path}/${encodeURIComponent(id)}/versions`)).data.data;
