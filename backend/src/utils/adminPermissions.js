const catalog = require('../config/admin-permissions.json');
const { ForbiddenError } = require('./errors');
const ALL_PERMISSIONS = catalog.map((permission) => permission.id);
const ADMIN_EMAIL_DOMAIN = 'admin.nexoperfil.invalid';
const adminEmail = (username) => `${username}@${ADMIN_EMAIL_DOMAIN}`;
function permissionsOf(profile) {
  if (profile?.role !== 'admin' || ['disabled', 'deleted', 'deletion_pending'].includes(profile.status)) return [];
  if (['owner', 'full'].includes(profile.adminAccess)) return [...ALL_PERMISSIONS];
  return (profile.permissions || []).filter((permission) => ALL_PERMISSIONS.includes(permission));
}
const hasPermission = (profile, permission) => permissionsOf(profile).includes(permission);
function requirePermission(profile, permission) {
  if (!hasPermission(profile, permission)) throw new ForbiddenError('Tu cuenta no tiene permiso para realizar esta acción.');
}
function canDelegate(actor, target) {
  if (actor?.role !== 'admin' || !permissionsOf(actor).length) return false;
  if (target.adminAccess === 'owner') return false;
  if (['owner', 'full'].includes(actor.adminAccess)) return true;
  return (target.adminAccess || 'restricted') === 'restricted' && (target.permissions || []).every((permission) => permissionsOf(actor).includes(permission));
}
module.exports = { catalog, ALL_PERMISSIONS, ADMIN_EMAIL_DOMAIN, adminEmail, permissionsOf, hasPermission, requirePermission, canDelegate };
