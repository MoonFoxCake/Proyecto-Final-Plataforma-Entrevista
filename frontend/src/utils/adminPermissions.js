import catalog from '../../../backend/src/config/admin-permissions.json';
export { catalog as ADMIN_PERMISSION_CATALOG };
export function permissionsOf(profile) {
  if (profile?.role !== 'admin' || ['disabled', 'deleted', 'deletion_pending'].includes(profile.status)) return [];
  if (['owner', 'full'].includes(profile.adminAccess)) return catalog.map((entry) => entry.id);
  return (profile.permissions || []).filter((id) => catalog.some((entry) => entry.id === id));
}
export const can = (profile, permission) => permissionsOf(profile).includes(permission);
export const canAny = (profile, permissions) => permissions.some((permission) => can(profile, permission));
const SECTIONS = {
  dashboard: ['dashboard.view'], companies: ['companies.view'], processes: ['processes.view', 'evaluations.review', 'evaluations.publish'],
  'question-bank': ['questions.manage'], macrocasos: ['macrocases.manage'], microcasos: ['microcases.manage'],
  results: ['results.view', 'results.deliver'], accounts: ['admins.view', 'admins.create', 'admins.manage', 'admins.delete', 'users.view', 'users.delete'],
};
export const canSection = (profile, section) => canAny(profile, SECTIONS[section] || []);
export function canManageAccount(actor, target) {
  if (target.id === actor?.id || target.adminAccess === 'owner') return false;
  if (['owner', 'full'].includes(actor?.adminAccess)) return true;
  return target.adminAccess === 'restricted' && (target.permissions || []).every((permission) => can(actor, permission));
}
