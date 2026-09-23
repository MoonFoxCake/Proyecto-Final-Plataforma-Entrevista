const { z } = require('zod');
const { ROLES } = require('../utils/constants');

/**
 * Payload for POST /auth/register.
 *
 * Public company registration. Candidates never create accounts here;
 * they access evaluations only through invitation links.
 */
const registerSchema = z.object({
  companyName: z.string().trim().min(2).max(160),
  industry: z.string().trim().min(2).max(120),
  companySize: z.enum(['1-10', '11-50', '51-200', '201-500', '501+']),
  website: z.string().trim().url().optional(),
  companyPhone: z.string().trim().min(5).max(30),
  city: z.string().trim().min(2).max(100),
  country: z.string().trim().min(2).max(100),
  email: z.string().trim().email(),
  password: z.string().min(8),
  displayName: z.string().trim().min(2).max(120),
  contactRole: z.string().trim().min(2).max(120),
  contactPhone: z.string().trim().min(5).max(30),
  acceptTerms: z.literal(true),
}).strict();

const companyUserSchema = z.object({
  companyName: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1),
  phone: z.string().min(1).optional(),
});

/**
 * Payload for POST /auth/set-role
 */
const setRoleSchema = z.object({
  uid: z.string().min(1),
  role: z.nativeEnum(ROLES),
  orgId: z.string().min(1).optional(),
});

module.exports = { registerSchema, companyUserSchema, setRoleSchema };
