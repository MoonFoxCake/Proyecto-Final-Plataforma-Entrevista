const { z } = require('zod');
const { ROLES } = require('../utils/constants');

/**
 * Payload for POST /auth/register
 */
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1),
});

/**
 * Payload for POST /auth/set-role
 */
const setRoleSchema = z.object({
  uid: z.string().min(1),
  role: z.nativeEnum(ROLES),
  orgId: z.string().min(1).optional(),
});

module.exports = { registerSchema, setRoleSchema };
