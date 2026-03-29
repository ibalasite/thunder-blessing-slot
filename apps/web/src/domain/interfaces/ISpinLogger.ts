import type { SpinLog } from './ISpinLogRepository';

/**
 * ISpinLogger — async spin audit log interface.
 *
 * logAsync() is fire-and-forget: the caller does NOT await it.
 * Implementations MUST catch and swallow all errors internally
 * so a logging failure never blocks the spin response.
 */
export interface ISpinLogger {
  logAsync(log: SpinLog): void;
}
