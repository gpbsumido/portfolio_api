export class AppError extends Error {
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(message: string, statusCode: number, details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

// The defaults below are user-facing: the frontend shows the message directly,
// so a bare `new ForbiddenError()` reads as a plain sentence, not a status word.

export class NotFoundError extends AppError {
  constructor(message = "We couldn't find what you were looking for.", details?: unknown) {
    super(message, 404, details);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Some of the details you entered are not valid.', details?: unknown) {
    super(message, 400, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'You need to be signed in to do that.', details?: unknown) {
    super(message, 401, details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You don't have permission to do that.", details?: unknown) {
    super(message, 403, details);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'That conflicts with something that already exists.', details?: unknown) {
    super(message, 409, details);
  }
}

export class RateLimitError extends AppError {
  constructor(message = "You're doing that too often. Please wait a moment and try again.", details?: unknown) {
    super(message, 429, details);
  }
}
