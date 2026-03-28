import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../../src/infrastructure/fastify/app';
import { setupMockContainer } from './mockContainer';

export async function buildTestApp(overrides: Parameters<typeof setupMockContainer>[0] = {}): Promise<FastifyInstance> {
  setupMockContainer(overrides);
  const app = await buildApp();
  await app.ready();
  return app;
}

export function authHeader() {
  return { authorization: 'Bearer valid-token' };
}
