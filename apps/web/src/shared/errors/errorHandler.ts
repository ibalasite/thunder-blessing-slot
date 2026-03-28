import { AppError } from './AppError';
import { ZodError } from 'zod';

export interface HttpErrorResponse {
  statusCode: number;
  body: { error: string; message: string; detail?: string };
}

export function toHttpError(error: unknown): HttpErrorResponse {
  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      body: {
        error: error.code,
        message: error.message,
        ...(error.detail ? { detail: error.detail } : {}),
      },
    };
  }
  if (error instanceof ZodError) {
    return {
      statusCode: 400,
      body: {
        error: 'VALIDATION_ERROR',
        message: error.errors[0]?.message ?? 'Validation error',
      },
    };
  }
  const isDev = process.env.NODE_ENV === 'development';
  console.error('[API Error]', error);
  return {
    statusCode: 500,
    body: {
      error: 'INTERNAL_ERROR',
      message: 'Internal server error',
      ...(isDev && error instanceof Error ? { detail: error.message } : {}),
    },
  };
}

// Legacy alias for compatibility during transition
export { toHttpError as handleError };
