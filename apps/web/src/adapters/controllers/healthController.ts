import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

export async function healthController(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_req: FastifyRequest, reply: FastifyReply) => {
    reply.send({ status: 'ok' });
  });
}
