import type { ISpinLogger } from '../../domain/interfaces/ISpinLogger';
import type { ISpinLogRepository, SpinLog } from '../../domain/interfaces/ISpinLogRepository';

/**
 * Wraps ISpinLogRepository with fire-and-forget semantics.
 * Errors are swallowed — a logging failure must never block a spin response.
 */
export class SupabaseSpinLogger implements ISpinLogger {
  constructor(private repo: ISpinLogRepository) {}

  logAsync(log: SpinLog): void {
    const { createdAt: _ts, ...rest } = log;
    this.repo
      .create(rest)
      .catch((err: unknown) => {
        console.error('[SupabaseSpinLogger] Failed to persist spin log', log.id, err);
      });
  }
}
