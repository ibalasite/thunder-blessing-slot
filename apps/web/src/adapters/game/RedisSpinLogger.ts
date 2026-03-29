import type { ISpinLogger } from '../../domain/interfaces/ISpinLogger';
import type { ICacheAdapter } from '../../domain/interfaces/ICacheAdapter';
import type { SpinLog } from '../../domain/interfaces/ISpinLogRepository';

/**
 * Redis Stream spin logger (2A-20).
 *
 * Publishes spin log data to `spin_log_stream` via XADD.
 * Fire-and-forget: errors are caught and logged, never rethrown.
 *
 * A companion SpinLogStreamConsumer (started at server boot) reads
 * from the stream and bulk-inserts to PostgreSQL.
 */
export class RedisSpinLogger implements ISpinLogger {
  constructor(private cache: ICacheAdapter) {}

  logAsync(log: SpinLog): void {
    this._publish(log).catch((err: unknown) => {
      console.error('[RedisSpinLogger] Failed to XADD spin_log_stream', log.id, err);
    });
  }

  private async _publish(log: SpinLog): Promise<void> {
    await this.cache.xadd('spin_log_stream', {
      id: log.id,
      userId: log.userId,
      sessionId: log.sessionId,
      mode: log.mode,
      currency: log.currency,
      betLevel: String(log.betLevel),
      winLevel: String(log.winLevel),
      baseUnit: log.baseUnit,
      playerBet: log.playerBet,
      playerWin: log.playerWin,
      serverSeed: log.serverSeed,
      clientSeed: log.clientSeed ?? '',
      rngByteCount: String(log.rngByteCount),
      // rngBytes: omitted from stream (large binary — persisted in DB consumer)
      gridSnapshot: JSON.stringify(log.gridSnapshot ?? null),
      createdAt: log.createdAt.toISOString(),
    });
  }
}
