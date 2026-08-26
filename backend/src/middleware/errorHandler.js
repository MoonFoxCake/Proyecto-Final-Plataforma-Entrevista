const { AppError } = require('../utils/errors');

/**
 * Global error-handling middleware. Must be mounted last, after all
 * routes. Captures thrown/next(error)-ed exceptions, logs them, and
 * returns a consistent JSON error response.
 *
 * @type {import('express').ErrorRequestHandler}
 */
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const message = err instanceof AppError ? err.message : 'Internal server error';

  // TODO: replace with a real logger (pino/winston) and include request context.
  console.error(err);

  const body = { error: { message, statusCode } };
  if (err.details) {
    body.error.details = err.details;
  }

  res.status(statusCode).json(body);
}

module.exports = { errorHandler };
