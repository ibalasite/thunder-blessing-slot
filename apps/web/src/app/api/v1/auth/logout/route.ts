import { NextRequest, NextResponse } from 'next/server';
import { container } from '../../../../../container';
import { handleError } from '../../../../../shared/errors/errorHandler';

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const refreshToken = req.cookies.get('refresh_token')?.value;
    if (refreshToken) {
      await container.authProvider.logout(refreshToken);
    }

    const response = NextResponse.json({ success: true });
    // Clear the HttpOnly cookie
    response.cookies.set('refresh_token', '', {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/api/v1/auth/refresh',
      maxAge: 0,
    });

    return response;
  } catch (err) {
    return handleError(err);
  }
}
