/*
 Custom error types used across the CAI Platform.
 Every error extends BaseError which adds an HTTP-style statusCode and optional inner error.
 This single module centralises error definitions so that imports such as
   const { ProviderError } = require('../../utils/errors');
 or using the fromRoot helper will resolve correctly.
*/

class BaseError extends Error {
  /**
   * @param {string} message – human-readable error message
   * @param {number} [statusCode=500] – HTTP-style status code to expose via API layer
   * @param {Error}  [cause] – underlying error that triggered this error
   */
  constructor(message, statusCode = 500, cause) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    if (cause) {
      this.cause = cause;
    }
    Error.captureStackTrace?.(this, this.constructor);
  }
}

class ValidationError extends BaseError {
  constructor(message = 'Validation failed', cause) {
    super(message, 400, cause);
  }
}

class AuthenticationError extends BaseError {
  constructor(message = 'Authentication failed', cause) {
    super(message, 401, cause);
  }
}

class AuthorizationError extends BaseError {
  constructor(message = 'Not authorised', cause) {
    super(message, 403, cause);
  }
}

class NotFoundError extends BaseError {
  constructor(message = 'Resource not found', cause) {
    super(message, 404, cause);
  }
}

class RateLimitError extends BaseError {
  constructor(message = 'Rate limit exceeded', cause) {
    super(message, 429, cause);
  }
}

class ProviderError extends BaseError {
  constructor(message = 'Provider error', statusCode = 502, cause) {
    super(message, statusCode, cause);
  }
}

class ConfigurationError extends BaseError {
  constructor(message = 'Configuration error', cause) {
    super(message, 500, cause);
  }
}

module.exports = {
  BaseError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  RateLimitError,
  ProviderError,
  ConfigurationError
};
