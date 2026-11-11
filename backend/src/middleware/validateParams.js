const { ValidationError } = require('../utils/errors');

/**
 * Validates `req.params` against a Zod schema (route parameters such as the
 * evaluation phase).
 *
 * @param {import('zod').ZodTypeAny} schema
 * @returns {import('express').RequestHandler}
 */
function validateParams(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.params);
    if (!result.success) return next(new ValidationError('Invalid request parameters', result.error.flatten()));
    return next();
  };
}

module.exports = { validateParams };
