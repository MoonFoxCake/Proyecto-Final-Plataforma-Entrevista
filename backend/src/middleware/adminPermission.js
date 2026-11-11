const { ForbiddenError } = require('../utils/errors');
const { hasPermission } = require('../utils/adminPermissions');
function adminPermission(...permissions) {
  return (req, _res, next) => {
    if (req.profile?.role === 'admin' && permissions.some((permission) => hasPermission(req.profile, permission))) return next();
    return next(new ForbiddenError('Tu cuenta no tiene permiso para esta sección o acción.'));
  };
}
const ownerOnly = (req, _res, next) => req.profile?.adminAccess === 'owner' ? next() : next(new ForbiddenError('Esta acción está reservada al propietario.'));
module.exports = { adminPermission, ownerOnly };
