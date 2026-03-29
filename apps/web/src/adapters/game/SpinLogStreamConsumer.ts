import type { ICacheAdapter } from '../../domain/interfaces/ICacheAdapter';
import type { ISpinLogRepository } from '../../domain/interfaces/ISpinLogRepository';

const STREAM = 'spin_log_stream';
const BATCH_SIZE = 50;
const POLL_INTERVAL_MS = 2000;
const CONSUMER_CURSOR_KEY = 'spin_log_stream:cursor';

/**
 * SpinLogStreamConsumer (2A-20).
 *
 * Reads from `spin_log_stream` (Redis Stream) and bulk-inserts
 * spin logs into PostgreSQL via ISpinLogRepository.
 *
 * Usage: start() at server boot, stop() on graceful shutdown.
 */
export class SpinLogStreamConsumer {
  private _running = false;
  private _timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private cache: ICacheAdapter,
    private spinLogRepo: ISpinLogRepository,
  ) {}

  start(): void {
    if (this._running) return;
    this._running = true;
    this._schedule();
  }

  stop(): void {
    this._running = false;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  private _schedule(): void {
    this._timer = setTimeout(() => {
      this._poll().catch((err) => {
        console.error('[SpinLogStreamConsumer] poll error', err);
      }).finally(() => {
        if (this._running) this._schedule();
      });
    }, POLL_INTERVAL_MS);
  }

  private async _poll(): Promise<void> {
    const cursor = (await this.cache.get(CONSUMER_CURSOR_KEY)) ?? '0';
    const entries = await this.cache.xread(STREAM, cursor, BATCH_SIZE);
    if (entries.length === 0) return;

    for (const entry of entries) {
      const d = entry.data;
      try {
        await this.spinLogRepo.create({
          userId: d['userId'],
          sessionId: d['sessionId'],
          mode: d['mode'],
          currency: d['currency'] as 'USD' | 'TWD',
          betLevel: parseInt(d['betLevel'], 10),
          winLevel: parseInt(d['winLevel'], 10),
          baseUnit: d['baseUnit'],
          playerBet: d['playerBet'],
          playerWin: d['playerWin'],
          gridSnapshot: d['gridSnapshot'] ? JSON.parse(d['gridSnapshot']) : null,
          rngBytes: null,
          rngByteCount: parseInt(d['rngByteCount'], 10),
          serverSeed: d['serverSeed'],
          clientSeed: d['clientSeed'] || null,
        });
      } catch (err) {
        console.error('[SpinLogStreamConsumer] failed to insert spin log', entry.id, err);
      }
    }

    // Advance cursor past the last processed entry
    const lastId = entries[entries.length - 1].id;
    await this.cache.set(CONSUMER_CURSOR_KEY, lastId);
  }
}
