import { AppError } from '../../../src/shared/errors/AppError';
import { toHttpError } from '../../../src/shared/errors/errorHandler';
import { ZodError, z } from 'zod';

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('toHttpError()', () => {
  it('returns AppError status and code', () => {
    const result = toHttpError(AppError.unauthorized('bad'));
    expect(result.statusCode).toBe(401);
    expect(result.body.error).toBe('UNAUTHORIZED');
    expect(result.body.message).toBe('Unauthorized');
    expect(result.body.detail).toBe('bad');
  });

  it('returns 404 for notFound error', () => {
    const result = toHttpError(AppError.notFound('Wallet'));
    expect(result.statusCode).toBe(404);
  });

  it('does not include detail when AppError has none', () => {
    const result = toHttpError(AppError.notFound('Thing'));
    expect(result.body.detail).toBeUndefined();
  });

  it('returns 400 VALIDATION_ERROR for ZodError', () => {
    const schema = z.object({ email: z.string().email() });
    let zodErr: ZodError | null = null;
    try { schema.parse({ email: 'bad' }); } catch (e) { zodErr = e as ZodError; }
    const result = toHttpError(zodErr!);
    expect(result.statusCode).toBe(400);
    expect(result.body.error).toBe('VALIDATION_ERROR');
    expect(result.body.message).toBeDefined();
  });

  it('returns 500 for unknown error', () => {
    const result = toHttpError(new Error('boom'));
    expect(result.statusCode).toBe(500);
    expect(result.body.error).toBe('INTERNAL_ERROR');
  });

  it('returns 500 for non-Error thrown value', () => {
    const result = toHttpError('something bad');
    expect(result.statusCode).toBe(500);
  });

  it('does not leak stack traces in production', () => {
    const original = process.env.NODE_ENV;
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', writable: true });
    const result = toHttpError(new Error('internal details'));
    expect(result.body.detail).toBeUndefined();
    Object.defineProperty(process.env, 'NODE_ENV', { value: original, writable: true });
  });

  it('includes detail in development', () => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'development', writable: true });
    const result = toHttpError(new Error('dev detail'));
    expect(result.body.detail).toBe('dev detail');
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'test', writable: true });
  });

  it('uses fallback message when ZodError has empty errors array', () => {
    // Construct a ZodError manually with empty issues to hit the ?? branch
    const zodErr = new ZodError([]);
    const result = toHttpError(zodErr);
    expect(result.statusCode).toBe(400);
    expect(result.body.error).toBe('VALIDATION_ERROR');
    expect(result.body.message).toBe('Validation error');
  });

  it('logs the error to console', () => {
    toHttpError(new Error('test log'));
    expect(console.error).toHaveBeenCalled();
  });
});
