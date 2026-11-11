const { randomBytes } = require('crypto');
const { z } = require('zod');
const { ForbiddenError, NotFoundError, ValidationError } = require('../utils/errors');
const {
  ALL_PERMISSIONS, catalog, adminEmail, normalizePermissions, permissionsOf, requirePermission, canDelegate,
} = require('../utils/adminPermissions');

const accessSchema = z.object({
  displayName: z.string().trim().min(2).max(120),
  adminAccess: z.enum(['full', 'restricted']),
  permissions: z.array(z.enum(ALL_PERMISSIONS)).max(ALL_PERMISSIONS.length).default([]),
}).strict();
const usernameSchema = z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9._-]{2,39}$/, 'Usa entre 3 y 40 letras, números, puntos, guiones o guiones bajos.');
const passwordSchema = z.string().min(12).max(128);
const parse = (schema, data) => {
  const result = schema.safeParse(data);
  if (!result.success) throw new ValidationError('Revisa los datos de la cuenta y los permisos seleccionados.', result.error.flatten());
  return result.data;
};
const safeAccount = (user) => ({
  id: user.id, username: user.username || '', email: user.email || '', displayName: user.displayName || '',
  role: user.role, companyName: user.companyName || '', status: user.status || 'active',
  adminAccess: user.adminAccess || 'restricted', permissions: normalizePermissions(user.permissions || []), revision: user.revision || 0,
  createdAt: user.createdAt || null,
});

class AdminAccountService {
  constructor({ userRepo, auditRepo, identity }) { this.users = userRepo; this.audit = auditRepo; this.identity = identity; }
  async actor(uid, permission) {
    const user = await this.users.findById(uid);
    requirePermission(user, permission);
    return user;
  }
  async target(actor, id) {
    if (!permissionsOf(actor).length) throw new ForbiddenError('Tu cuenta no tiene acceso administrativo.');
    const target = await this.users.findById(id);
    if (!target || target.status === 'deleted') throw new NotFoundError('Cuenta no encontrada.');
    if (target.adminAccess === 'owner') throw new ForbiddenError('La cuenta propietaria está protegida.');
    if (actor.id === id) throw new ForbiddenError('No puedes modificar o eliminar tu propia cuenta desde este panel.');
    if (target.role === 'admin' && !canDelegate(actor, target)) throw new ForbiddenError('Esta cuenta tiene permisos fuera de tu alcance.');
    return target;
  }
  access(actor, data) {
    const parsed = parse(accessSchema, data);
    const permissions = parsed.adminAccess === 'full' ? [] : [...new Set(parsed.permissions)];
    const target = { ...parsed, role: 'admin', status: 'active', permissions };
    if (!canDelegate(actor, target)) throw new ForbiddenError('No puedes otorgar control total o permisos superiores a los tuyos.');
    return { displayName: parsed.displayName, adminAccess: parsed.adminAccess, permissions };
  }
  async record(actor, targetId, action, detail = {}) {
    await this.audit.record({ actorUid: actor.id, targetUid: targetId, action, at: new Date().toISOString(), ...detail });
  }
  async listAdmins(uid) {
    const actor = await this.users.findById(uid);
    if (!['admins.view', 'admins.create', 'admins.manage', 'admins.delete'].some((permission) => permissionsOf(actor).includes(permission))) throw new ForbiddenError('No tienes permiso para consultar administradores.');
    return { accounts: (await this.users.findAll()).filter((user) => user.role === 'admin' && user.status !== 'deleted').map(safeAccount), catalog };
  }
  async listUsers(uid) {
    const actor = await this.users.findById(uid);
    if (!['users.view', 'users.delete'].some((permission) => permissionsOf(actor).includes(permission))) throw new ForbiddenError('No tienes permiso para consultar usuarios.');
    return (await this.users.findAll()).filter((user) => ['company', 'candidate'].includes(user.role) && user.status !== 'deleted').map(safeAccount);
  }
  async create(uid, data) {
    const actor = await this.actor(uid, 'admins.create');
    const { username: rawUsername, ...access } = data || {};
    const username = parse(usernameSchema, rawUsername);
    const granted = this.access(actor, access);
    const temporaryPassword = randomBytes(18).toString('base64url');
    let account;
    try { account = await this.identity.createUser({ email: adminEmail(username), password: temporaryPassword, displayName: granted.displayName }); }
    catch (error) { if (error.code === 'auth/email-already-exists') throw new ValidationError('Ese nombre de usuario ya está registrado.'); throw error; }
    try {
      const profile = await this.users.create({ uid: account.uid, email: adminEmail(username), username, role: 'admin', orgId: null, ...granted, status: 'active', revision: 1, createdBy: uid });
      await this.identity.setCustomUserClaims(account.uid, { role: 'admin', orgId: null });
      await this.record(actor, account.uid, 'ADMIN_CREATED', { adminAccess: granted.adminAccess, permissions: granted.permissions });
      // Credential returned once to the creator, never persisted or written to audit logs.
      return { account: safeAccount(profile), temporaryPassword };
    } catch (error) {
      await this.users.update(account.uid, { status: 'deleted' }).catch(() => {});
      await this.identity.deleteUser(account.uid).catch(() => {});
      throw error;
    }
  }
  async update(uid, id, data) {
    const actor = await this.actor(uid, 'admins.manage');
    const target = await this.target(actor, id);
    if (target.role !== 'admin') throw new ValidationError('Esta cuenta no es administrativa.');
    const { revision, ...input } = data || {};
    if (!Number.isInteger(revision) || revision < 0) throw new ValidationError('Indica la revisión de la cuenta.');
    const granted = this.access(actor, input);
    const saved = await this.users.changeAccount(id, granted, revision);
    await this.record(actor, id, 'ADMIN_PERMISSIONS_CHANGED', { adminAccess: granted.adminAccess, permissions: granted.permissions });
    return safeAccount(saved);
  }
  async setStatus(uid, id, data) {
    const actor = await this.actor(uid, 'admins.manage');
    const target = await this.target(actor, id);
    if (target.role !== 'admin' || !['active', 'disabled'].includes(data?.status) || !Number.isInteger(data?.revision)) throw new ValidationError('Estado o revisión no válidos.');
    if (target.status === 'deletion_pending') throw new ValidationError('Completa la eliminación pendiente antes de continuar.');
    // Persisted status is authoritative even while identity-provider changes are in flight.
    const saved = await this.users.changeAccount(id, { status: data.status }, data.revision);
    await this.identity.updateUser(id, { disabled: data.status === 'disabled' });
    await this.identity.revokeRefreshTokens(id);
    await this.record(actor, id, 'ADMIN_STATUS_CHANGED', { status: data.status });
    return safeAccount(saved);
  }
  async resetPassword(uid, id, data) {
    const actor = await this.actor(uid, 'admins.manage');
    const target = await this.target(actor, id);
    if (target.role !== 'admin' || target.status !== 'active') throw new ValidationError('Solo puedes restablecer una cuenta administrativa activa.');
    if (!Number.isInteger(data?.revision)) throw new ValidationError('Indica la revisión de la cuenta.');
    const password = parse(passwordSchema, data?.password);
    const saved = await this.users.changeAccount(id, {}, data.revision);
    await this.identity.updateUser(id, { password });
    await this.identity.revokeRefreshTokens(id);
    await this.record(actor, id, 'ADMIN_PASSWORD_RESET');
    return safeAccount(saved);
  }
  async delete(uid, id, data) {
    const actor = await this.users.findById(uid);
    const target = await this.target(actor, id);
    requirePermission(actor, target.role === 'admin' ? 'admins.delete' : 'users.delete');
    if (!['admin', 'company', 'candidate'].includes(target.role) || !Number.isInteger(data?.revision) || data?.confirmation !== (target.username || target.email)) throw new ValidationError('Escribe el identificador de la cuenta para confirmar su eliminación.');
    const pending = await this.users.changeAccount(id, { status: 'deletion_pending' }, data.revision);
    try { await this.identity.deleteUser(id); } catch (error) { if (error.code !== 'auth/user-not-found') throw error; }
    await this.users.changeAccount(id, { status: 'deleted', permissions: [] }, pending.revision);
    await this.record(actor, id, 'ACCOUNT_DELETED', { role: target.role });
    return { id, deleted: true };
  }
}
module.exports = AdminAccountService;
