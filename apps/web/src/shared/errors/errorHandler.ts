import { NextResponse } from 'next/server';
import { AppError } from './AppError';

export function handleError(error: unknown): NextResponse {
  if (error instanceof AppError) {
    return NextResponse.json(
      { error: error.code, message: error.message },
      { status: error.statusCode },
    );
  }

  // S-05: Never leak internal error details (stack traces, DB errors) to client
  const isDev = process.env.NODE_ENV === 'development';
  console.error('[API Error]', error);

  return NextResponse.json(
    {
      error: 'INTERNAL_ERROR',
      message: 'Internal server error',
      ...(isDev && error instanceof Error ? { detail: error.message } : {}),
    },
    { status: 500 },
  );
}
