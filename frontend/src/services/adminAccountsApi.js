import api from './api.js';
export const listAdminAccounts = async () => (await api.get('/admin/accounts')).data.data.accounts;
export const listUserAccounts = async () => (await api.get('/admin/users')).data.data;
export const createAdminAccount = async (payload) => (await api.post('/admin/accounts', payload)).data.data;
export const updateAdminAccount = async (account, payload) => (await api.put(`/admin/accounts/${encodeURIComponent(account.id)}`, { ...payload, revision: account.revision })).data.data;
export const setAdminStatus = async (account, status) => (await api.patch(`/admin/accounts/${encodeURIComponent(account.id)}/status`, { status, revision: account.revision })).data.data;
export const resetAdminPassword = async (account, password) => (await api.post(`/admin/accounts/${encodeURIComponent(account.id)}/password`, { password, revision: account.revision })).data.data;
export const deleteAccount = async (account, confirmation) => (await api.delete(`/admin/${account.role === 'admin' ? 'accounts' : 'users'}/${encodeURIComponent(account.id)}`, { data: { confirmation, revision: account.revision } })).data.data;
