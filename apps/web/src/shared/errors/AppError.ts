export type ErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'CONFLICT'
  | 'INSUFFICIENT_FUNDS'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'SESSION_LIMIT_EXCEEDED'
  | 'INVALID_BET_LEVEL'
  | 'PROVIDER_FORBIDDEN';

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly message: string,
    public readonly statusCode: number,
    public readonly detail?: string,
  ) {
    super(message);
    this.name = 'AppError';
  }

  static unauthorized(detail?: string) {
    return new AppError('UNAUTHORIZED', 'Unauthorized', 401, detail);
  }
  static forbidden(detail?: string) {
    return new AppError('FORBIDDEN', 'Forbidden', 403, detail);
  }
  static notFound(resource: string) {
    return new AppError('NOT_FOUND', `${resource} not found`, 404);
  }
  static validation(detail: string) {
    return new AppError('VALIDATION_ERROR', 'Validation error', 400, detail);
  }
  static conflict(detail: string) {
    return new AppError('CONFLICT', 'Conflict', 409, detail);
  }
  static insufficientFunds() {
    return new AppError('INSUFFICIENT_FUNDS', 'Insufficient funds', 422);
  }
  static rateLimited() {
    return new AppError('RATE_LIMITED', 'Too many requests', 429);
  }
  static internal(detail?: string) {
    return new AppError('INTERNAL_ERROR', 'Internal server error', 500, detail);
  }
  static sessionLimitExceeded() {
    return new AppError('SESSION_LIMIT_EXCEEDED', 'Maximum active sessions reached', 403);
  }
  static providerForbidden() {
    // S-01: block mock provider in production
    return new AppError('PROVIDER_FORBIDDEN', 'Mock provider is not allowed in production', 403);
  }
}
