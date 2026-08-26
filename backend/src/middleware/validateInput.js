const { ValidationError } = require('../utils/errors');

/**
 * Middleware factory. `validateInput(schema)` validates `req.body`
 * against a Zod schema. On failure, forwards a 400 ValidationError with
 * formatted field errors. On success, replaces `req.body` with the
 * parsed (and coerced/defaulted) value.
 *
 * @param {import('zod').ZodSchema} schema
 * @returns {import('express').RequestHandler}
 */
function validateInput(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const details = result.error.flatten();
      return next(new ValidationError('Invalid request body', details));
    }

    req.body = result.data;
    return next();
  };
}

module.exports = { validateInput };
