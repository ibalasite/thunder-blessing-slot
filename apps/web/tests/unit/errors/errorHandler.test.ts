import { NextResponse } from 'next/server';
import { AppError } from '../../../src/shared/errors/AppError';
import { handleError } from '../../../src/shared/errors/errorHandler';

// Mock console.error to suppress output in tests
beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('handleError()', () => {
  it('returns AppError status and code', async () => {
    const res = handleError(AppError.unauthorized('bad'));
    const body = await res.json();
    expect(res.status).toBe(401);
    expect(body.error).toBe('UNAUTHORIZED');
    expect(body.message).toBe('Unauthorized');
  });

  it('returns 404 for notFound error', async () => {
    const res = handleError(AppError.notFound('Wallet'));
    expect(res.status).toBe(404);
  });

  it('returns 500 for unknown error', async () => {
    const res = handleError(new Error('boom'));
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).toBe('INTERNAL_ERROR');
  });

  it('returns 500 for non-Error thrown value', async () => {
    const res = handleError('something bad');
    expect(res.status).toBe(500);
  });

  it('does not leak stack traces in production', async () => {
    const original = process.env.NODE_ENV;
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', writable: true });
    const res = handleError(new Error('internal details'));
    const body = await res.json();
    expect(body.detail).toBeUndefined();
    Object.defineProperty(process.env, 'NODE_ENV', { value: original, writable: true });
  });

  it('includes detail in development', async () => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'development', writable: true });
    const res = handleError(new Error('dev detail'));
    const body = await res.json();
    expect(body.detail).toBe('dev detail');
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'test', writable: true });
  });

  it('logs the error to console', () => {
    handleError(new Error('test log'));
    expect(console.error).toHaveBeenCalled();
  });
});
