import catalog from '../../../backend/src/config/admin-permissions.json';
// Old permission ids (from before Procesos and Resultados were merged) and their current equivalent.
import aliases from '../../../backend/src/config/admin-permission-aliases.json';

export { catalog as ADMIN_PERMISSION_CATALOG };
const ALL = catalog.map((entry) => entry.id);
export const normalizePermissions = (permissions = []) => [...new Set(permissions.map((id) => aliases[id] || id))].filter((id) => ALL.includes(id));
export function permissionsOf(profile) {
  if (profile?.role !== 'admin' || ['disabled', 'deleted', 'deletion_pending'].includes(profile.status)) return [];
  if (['owner', 'full'].includes(profile.adminAccess)) return [...ALL];
  return normalizePermissions(profile.permissions || []);
}
export const can = (profile, permission) => permissionsOf(profile).includes(permission);
export const canAny = (profile, permissions) => permissions.some((permission) => can(profile, permission));
export const RESULTS_PERMISSIONS = ['results.view', 'results.deliver'];
const SECTIONS = {
  dashboard: ['dashboard.view'], companies: ['companies.view'],
  'question-bank': ['questions.manage'], macrocasos: ['macrocases.manage'], microcasos: ['microcases.manage'],
  results: RESULTS_PERMISSIONS, settings: ['settings.manage'], accounts: ['admins.view', 'admins.create', 'admins.manage', 'admins.delete', 'users.view', 'users.delete'],
};
export const canSection = (profile, section) => canAny(profile, SECTIONS[section] || []);
export function canManageAccount(actor, target) {
  if (target.id === actor?.id || target.adminAccess === 'owner') return false;
  if (['owner', 'full'].includes(actor?.adminAccess)) return true;
  return target.adminAccess === 'restricted' && normalizePermissions(target.permissions || []).every((permission) => can(actor, permission));
}
