import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import { container } from '../../container';
import { AppError } from '../../shared/errors/AppError';
import { toHttpError } from '../../shared/errors/errorHandler';

// ─── Auth preHandlers ───────────────────────────────────────────────────────

export async function requireAuth(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const header = request.headers.authorization ?? '';
  if (!header.startsWith('Bearer ')) throw AppError.unauthorized('Missing Bearer token');
  const token = header.slice(7);
  (request as FastifyRequest & { user: unknown }).user = await container.authProvider.verifyAccessToken(token);
}

export async function requireAdminIp(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const allowedIps = process.env.ADMIN_ALLOWED_IPS;
  if (!allowedIps) return;
  const clientIp = (request.headers['x-forwarded-for'] as string | undefined)
    ?.split(',')[0]?.trim() ?? request.ip;
  const allowed = allowedIps.split(',').map(s => s.trim());
  if (!allowed.includes(clientIp)) throw AppError.forbidden('Admin access denied from this IP');
}

// ─── Build App ──────────────────────────────────────────────────────────────

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });

  await app.register(cookie);
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
      },
    },
    crossOriginEmbedderPolicy: false,
  });
  await app.register(cors, {
    origin: process.env.ALLOWED_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
  });

  // Global error handler
  app.setErrorHandler((error, _request, reply) => {
    const { statusCode, body } = toHttpError(error);
    reply.status(statusCode).send(body);
  });

  // Routes
  const { authController } = await import('../../adapters/controllers/authController');
  const { walletController } = await import('../../adapters/controllers/walletController');
  const { gameController } = await import('../../adapters/controllers/gameController');
  const { healthController } = await import('../../adapters/controllers/healthController');

  await app.register(authController, { prefix: '/api/v1/auth' });
  await app.register(walletController, { prefix: '/api/v1/wallet' });
  await app.register(gameController, { prefix: '/api/v1/game' });
  await app.register(healthController, { prefix: '/api/v1' });

  return app;
}
