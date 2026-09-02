const { z } = require('zod');
const { ROLES } = require('../utils/constants');

/**
 * Payload for POST /auth/register.
 *
 * This is candidate self-registration (see RegisterPage's wizard on the
 * frontend): the account always comes out with role `candidate` and no
 * organization. The profile fields beyond email/password/displayName are
 * optional so the endpoint stays usable from simpler callers/tests too.
 */
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1),
  phone: z.string().min(1).optional(),
  city: z.string().min(1).optional(),
  country: z.string().min(1).optional(),
  academicLevel: z.string().min(1).optional(),
  professionalArea: z.string().min(1).optional(),
});

const companyUserSchema = z.object({
  companyName: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1),
  phone: z.string().min(1).optional(),
});

const candidateUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1),
  phone: z.string().min(1).optional(),
  city: z.string().min(1).optional(),
  country: z.string().min(1).optional(),
  academicLevel: z.string().min(1).optional(),
  professionalArea: z.string().min(1).optional(),
});

/**
 * Payload for POST /auth/set-role
 */
const setRoleSchema = z.object({
  uid: z.string().min(1),
  role: z.nativeEnum(ROLES),
  orgId: z.string().min(1).optional(),
});

module.exports = { registerSchema, companyUserSchema, candidateUserSchema, setRoleSchema };
