import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { container } from '../../container';
import { requireAuth } from '../../infrastructure/fastify/app';

type AuthedRequest = FastifyRequest & { user: { id: string } };

const DepositSchema = z.object({ amount: z.string(), provider: z.string().optional() });
const WithdrawSchema = z.object({ amount: z.string() });

export async function walletController(app: FastifyInstance): Promise<void> {
  app.get('/', { preHandler: [requireAuth] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as AuthedRequest).user;
    const result = await container.getWalletUseCase.execute({ userId: user.id });
    reply.send(result);
  });

  app.post('/deposit', { preHandler: [requireAuth] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as AuthedRequest).user;
    const body = DepositSchema.parse(req.body ?? {});
    const result = await container.depositUseCase.execute({
      userId: user.id,
      amount: body.amount,
      provider: body.provider,
      nodeEnv: process.env.NODE_ENV ?? /* istanbul ignore next */ 'development',
    });
    reply.send(result);
  });

  app.post('/withdraw', { preHandler: [requireAuth] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as AuthedRequest).user;
    const body = WithdrawSchema.parse(req.body ?? {});
    const result = await container.withdrawUseCase.execute({ userId: user.id, amount: body.amount });
    reply.send(result);
  });

  app.get('/transactions', { preHandler: [requireAuth] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as AuthedRequest).user;
    const query = req.query as Record<string, string>;
    const limit = Math.min(parseInt(query['limit'] ?? '20', 10), 100);
    const offset = Math.max(parseInt(query['offset'] ?? '0', 10), 0);
    const result = await container.getTransactionsUseCase.execute({ userId: user.id, limit, offset });
    reply.send(result);
  });
}
