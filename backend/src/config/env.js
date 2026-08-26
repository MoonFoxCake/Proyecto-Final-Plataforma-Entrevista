const { z } = require('zod');

/**
 * Schema describing and validating the environment variables the backend
 * requires. Fails fast at startup if a required variable is missing or
 * malformed, instead of failing later inside a request handler.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().default('3000'),
  FIREBASE_PROJECT_ID: z.string().min(1, 'FIREBASE_PROJECT_ID is required'),
  FIREBASE_PRIVATE_KEY: z.string().min(1, 'FIREBASE_PRIVATE_KEY is required'),
  FIREBASE_CLIENT_EMAIL: z.string().email('FIREBASE_CLIENT_EMAIL must be a valid email'),
});

/**
 * Parses and validates `process.env` against `envSchema`.
 *
 * @returns {z.infer<typeof envSchema>} the validated environment variables
 * @throws {z.ZodError} if validation fails
 */
function loadEnv() {
  // TODO: decide whether to call this eagerly at app startup (recommended)
  // or lazily on first access.
  return envSchema.parse(process.env);
}

module.exports = { envSchema, loadEnv };
