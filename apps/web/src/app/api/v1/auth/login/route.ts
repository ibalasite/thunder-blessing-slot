import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { container } from '../../../../../container';
import { handleError } from '../../../../../shared/errors/errorHandler';
import { AppError } from '../../../../../shared/errors/AppError';
import { env } from '../../../../../config/env';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // S-10: Rate limit auth attempts by email hash
    const body = await req.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw AppError.validation(parsed.error.errors[0]?.message /* istanbul ignore next */ ?? 'Invalid input');
    }

    const { email, password } = parsed.data;

    // Rate limit: track by hashed email (S-10)
    const crypto = await import('crypto');
    const emailHash = crypto.createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 16);
    const rateLimitKey = `rate:auth:email:${emailHash}`;
    const attempts = await container.cache.incr(rateLimitKey, env.AUTH_RATE_LIMIT_WINDOW_SECONDS);
    if (attempts > env.AUTH_RATE_LIMIT_MAX) {
      throw AppError.rateLimited();
    }

    const { user, tokens } = await container.authProvider.login(email, password);

    // Access token in response body; refresh token in HttpOnly cookie (S-A-2)
    const response = NextResponse.json({ accessToken: tokens.accessToken, userId: user.id });
    response.cookies.set('refresh_token', tokens.refreshToken, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/v1/auth/refresh',
      maxAge: env.JWT_REFRESH_TTL_SECONDS,
    });

    return response;
  } catch (err) {
    return handleError(err);
  }
}
