import { NextRequest, NextResponse } from 'next/server';
import type { AuthUser } from '../../interfaces/IAuthProvider';
import { AppError } from '../errors/AppError';
import { handleError } from '../errors/errorHandler';
import { container } from '../../container';

export type AuthedHandler = (
  req: NextRequest,
  user: AuthUser,
  context?: { params: Record<string, string> },
) => Promise<NextResponse>;

/**
 * HOF that validates Bearer token and injects the authenticated user.
 * Keeps Route Handlers thin and fully testable via mock container injection.
 */
export function withAuth(handler: AuthedHandler) {
  return async (
    req: NextRequest,
    context?: { params: Record<string, string> },
  ): Promise<NextResponse> => {
    try {
      const authHeader = req.headers.get('authorization') ?? '';
      if (!authHeader.startsWith('Bearer ')) {
        throw AppError.unauthorized('Missing Bearer token');
      }
      const token = authHeader.slice(7);
      const user = await container.authProvider.verifyAccessToken(token);
      return await handler(req, user, context);
    } catch (err) {
      return handleError(err);
    }
  };
}

export function withAdminAuth(handler: AuthedHandler) {
  return withAuth(async (req, user, context) => {
    // S-12: Admin IP allowlist check
    const allowedIps = process.env.ADMIN_ALLOWED_IPS ?? '';
    if (allowedIps) {
      const clientIp =
        req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
        req.headers.get('x-real-ip') ??
        '';
      const allowed = allowedIps.split(',').map((ip) => ip.trim());
      if (!allowed.includes(clientIp)) {
        throw AppError.forbidden('Admin access denied from this IP');
      }
    }
    return handler(req, user, context);
  });
}
