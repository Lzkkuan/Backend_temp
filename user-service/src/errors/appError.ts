export class AppError extends Error {
  statusCode: number;
  expose: boolean;
  details?: unknown;

  constructor(
    message: string,
    statusCode = 500,
    options?: { expose?: boolean; details?: unknown }
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.expose = options?.expose ?? statusCode < 500;
    this.details = options?.details;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

// Common specializations
export class BadRequestError extends AppError {
  constructor(message = "Bad Request", details?: unknown) {
    super(message, 400, { expose: true, details });
  }
}
export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized", details?: unknown) {
    super(message, 401, { expose: true, details });
  }
}
export class ForbiddenError extends AppError {
  constructor(message = "Forbidden", details?: unknown) {
    super(message, 403, { expose: true, details });
  }
}
export class NotFoundError extends AppError {
  constructor(message = "Not Found", details?: unknown) {
    super(message, 404, { expose: true, details });
  }
}
export class ConflictError extends AppError {
  constructor(message = "Conflict", details?: unknown) {
    super(message, 409, { expose: true, details });
  }
}
