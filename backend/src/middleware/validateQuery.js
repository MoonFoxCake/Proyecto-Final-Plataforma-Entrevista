const { ValidationError } = require('../utils/errors');

/**
 * Middleware factory. Like `validateInput`, for `req.query`: validates it
 * against a Zod schema and replaces it with the parsed (coerced/defaulted)
 * value.
 *
 * @param {import('zod').ZodSchema} schema
 * @returns {import('express').RequestHandler}
 */
function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return next(new ValidationError('Invalid query', result.error.flatten()));
    }
    req.query = result.data;
    return next();
  };
}

module.exports = { validateQuery };
