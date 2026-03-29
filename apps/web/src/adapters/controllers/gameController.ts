import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { container } from '../../container';
import { requireAuth } from '../../infrastructure/fastify/app';

type AuthedRequest = FastifyRequest & { user: { id: string } };

const SpinSchema = z.object({
  mode: z.enum(['main', 'extraBet', 'buyFG']),
  betLevel: z.number().int().positive(),
  currency: z.enum(['USD', 'TWD']),
  extraBetOn: z.boolean().optional().default(false),
  clientSeed: z.string().max(64).optional(),
  /** Optional client UUID for idempotency (2A-18). Same txId returns cached result. */
  txId: z.string().uuid().optional(),
});

export async function gameController(app: FastifyInstance): Promise<void> {
  app.get('/bet-range', { preHandler: [requireAuth] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const query = req.query as Record<string, string>;
    const result = await container.getBetRangeUseCase.execute({ currency: query['currency'] ?? '' });
    reply.send(result);
  });

  app.post('/spin', { preHandler: [requireAuth] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as AuthedRequest).user;
    const body = SpinSchema.parse(req.body);
    const sessionId = (req.headers['x-session-id'] as string) ?? 'unknown';
    const result = await container.spinUseCase.execute({
      userId: user.id,
      sessionId,
      mode: body.mode,
      betLevel: body.betLevel,
      currency: body.currency,
      extraBetOn: body.extraBetOn ?? false,
      clientSeed: body.clientSeed ?? null,
      txId: body.txId,
    });
    reply.send(result);
  });

  app.get('/:spinId/replay', { preHandler: [requireAuth] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as AuthedRequest).user;
    const { spinId } = req.params as { spinId: string };
    const result = await container.replayUseCase.execute({ spinId, userId: user.id });
    reply.send(result);
  });
}
