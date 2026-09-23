/**
 * Custom application error classes. Each carries an HTTP `statusCode` so
 * `errorHandler` middleware can translate it into the right response
 * without needing to know about domain specifics.
 */

class AppError extends Error {
  /**
   * @param {string} message
   * @param {number} statusCode
   */
  constructor(message, statusCode) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404);
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401);
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403);
  }
}

class ValidationError extends AppError {
  /**
   * @param {string} message
   * @param {unknown} [details] formatted validation issues
   */
  constructor(message = 'Validation error', details) {
    super(message, 400);
    this.details = details;
  }
}

class ExternalServiceError extends AppError {
  constructor(message = 'External service error', details) {
    super(message, 502);
    this.details = details;
  }
}

module.exports = {
  AppError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ValidationError,
  ExternalServiceError,
};
