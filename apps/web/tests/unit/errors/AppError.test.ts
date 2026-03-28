import { AppError } from '../../../src/shared/errors/AppError';

describe('AppError', () => {
  it('unauthorized() — 401', () => {
    const e = AppError.unauthorized('bad token');
    expect(e.statusCode).toBe(401);
    expect(e.code).toBe('UNAUTHORIZED');
    expect(e.detail).toBe('bad token');
  });

  it('forbidden() — 403', () => {
    const e = AppError.forbidden();
    expect(e.statusCode).toBe(403);
    expect(e.code).toBe('FORBIDDEN');
  });

  it('notFound() — 404', () => {
    const e = AppError.notFound('Wallet');
    expect(e.statusCode).toBe(404);
    expect(e.message).toContain('Wallet');
  });

  it('validation() — 400', () => {
    const e = AppError.validation('bad input');
    expect(e.statusCode).toBe(400);
    expect(e.code).toBe('VALIDATION_ERROR');
  });

  it('conflict() — 409', () => {
    const e = AppError.conflict('duplicate');
    expect(e.statusCode).toBe(409);
  });

  it('insufficientFunds() — 422', () => {
    const e = AppError.insufficientFunds();
    expect(e.statusCode).toBe(422);
    expect(e.code).toBe('INSUFFICIENT_FUNDS');
  });

  it('rateLimited() — 429', () => {
    const e = AppError.rateLimited();
    expect(e.statusCode).toBe(429);
  });

  it('internal() — 500', () => {
    const e = AppError.internal();
    expect(e.statusCode).toBe(500);
    expect(e.code).toBe('INTERNAL_ERROR');
  });

  it('sessionLimitExceeded() — 403', () => {
    const e = AppError.sessionLimitExceeded();
    expect(e.statusCode).toBe(403);
    expect(e.code).toBe('SESSION_LIMIT_EXCEEDED');
  });

  it('providerForbidden() — 403 (S-01)', () => {
    const e = AppError.providerForbidden();
    expect(e.statusCode).toBe(403);
    expect(e.code).toBe('PROVIDER_FORBIDDEN');
  });

  it('is instanceof AppError', () => {
    expect(AppError.unauthorized()).toBeInstanceOf(AppError);
    expect(AppError.unauthorized()).toBeInstanceOf(Error);
  });
});
