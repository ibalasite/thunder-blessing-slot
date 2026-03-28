import { NextRequest, NextResponse } from 'next/server';
import { container } from '../../../../../container';
import { handleError } from '../../../../../shared/errors/errorHandler';
import { AppError } from '../../../../../shared/errors/AppError';
import { env } from '../../../../../config/env';

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const refreshToken = req.cookies.get('refresh_token')?.value;
    if (!refreshToken) {
      throw AppError.unauthorized('Missing refresh token');
    }

    const tokens = await container.authProvider.refreshAccessToken(refreshToken);

    const response = NextResponse.json({ accessToken: tokens.accessToken });
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
