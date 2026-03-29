import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { container } from '../../container';

const RegisterSchema = z.object({ email: z.string().email(), password: z.string().min(6) });
const LoginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function authController(app: FastifyInstance): Promise<void> {
  app.post('/register', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = RegisterSchema.parse(req.body ?? {});
    const result = await container.registerUseCase.execute(body);
    reply.status(201).send(result);
  });

  app.post('/login', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = LoginSchema.parse(req.body ?? {});
    const { env } = await import('../../infrastructure/config/env');
    const result = await container.loginUseCase.execute({
      ...body,
      nodeEnv: process.env.NODE_ENV ?? /* istanbul ignore next */ 'development',
      rateLimitMax: env.AUTH_RATE_LIMIT_MAX,
      rateLimitWindowSeconds: env.AUTH_RATE_LIMIT_WINDOW_SECONDS,
    });
    reply.setCookie('refresh_token', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/v1/auth/refresh',
    });
    reply.send({ accessToken: result.accessToken });
  });

  app.post('/refresh', async (req: FastifyRequest, reply: FastifyReply) => {
    const refreshToken = req.cookies?.['refresh_token'];
    const result = await container.refreshTokenUseCase.execute({ refreshToken });
    reply.setCookie('refresh_token', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/v1/auth/refresh',
    });
    reply.send({ accessToken: result.accessToken });
  });

  app.post('/logout', async (req: FastifyRequest, reply: FastifyReply) => {
    const refreshToken = req.cookies?.['refresh_token'];
    await container.logoutUseCase.execute({ refreshToken });
    reply.clearCookie('refresh_token', { path: '/api/v1/auth/refresh' });
    reply.send({ success: true });
  });
}
