const catalog = require('../config/admin-permissions.json');
// Permissions merged into others when Procesos and Resultados became one
// section: accounts that still store the old ids keep the same access.
const ALIASES = require('../config/admin-permission-aliases.json');
const { ForbiddenError } = require('./errors');
const ALL_PERMISSIONS = catalog.map((permission) => permission.id);
const ADMIN_EMAIL_DOMAIN = 'admin.nexoperfil.invalid';
const adminEmail = (username) => `${username}@${ADMIN_EMAIL_DOMAIN}`;
/** Stored permission ids as current catalog ids: old ids mapped, unknown ones dropped. */
function normalizePermissions(permissions = []) {
  return [...new Set(permissions.map((permission) => ALIASES[permission] || permission))].filter((permission) => ALL_PERMISSIONS.includes(permission));
}
function permissionsOf(profile) {
  if (profile?.role !== 'admin' || ['disabled', 'deleted', 'deletion_pending'].includes(profile.status)) return [];
  if (['owner', 'full'].includes(profile.adminAccess)) return [...ALL_PERMISSIONS];
  return normalizePermissions(profile.permissions || []);
}
const hasPermission = (profile, permission) => permissionsOf(profile).includes(permission);
function requirePermission(profile, permission) {
  if (!hasPermission(profile, permission)) throw new ForbiddenError('Tu cuenta no tiene permiso para realizar esta acción.');
}
function canDelegate(actor, target) {
  if (actor?.role !== 'admin' || !permissionsOf(actor).length) return false;
  if (target.adminAccess === 'owner') return false;
  if (['owner', 'full'].includes(actor.adminAccess)) return true;
  return (target.adminAccess || 'restricted') === 'restricted' && normalizePermissions(target.permissions || []).every((permission) => permissionsOf(actor).includes(permission));
}
module.exports = {
  catalog, ALL_PERMISSIONS, ADMIN_EMAIL_DOMAIN, adminEmail, normalizePermissions, permissionsOf, hasPermission, requirePermission, canDelegate,
};
