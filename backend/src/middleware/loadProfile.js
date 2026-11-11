const { ForbiddenError } = require('../utils/errors');
function loadProfile(authService) {
  return async (req, _res, next) => {
    try {
      const profile = await authService.getProfile(req.user.uid);
      if (['disabled', 'deleted', 'deletion_pending'].includes(profile.status)) throw new ForbiddenError('Esta cuenta está desactivada. Contacta al propietario.');
      req.profile = profile;
      req.user.role = profile.role;
      req.user.orgId = profile.orgId ?? null;
      return next();
    } catch (error) { next(error); }
  };
}
module.exports = { loadProfile };
