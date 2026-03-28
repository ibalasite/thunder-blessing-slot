/**
 * logger.ts — Lightweight logger for game flow debugging.
 * Respects LOG_LEVEL environment variable.
 * In production builds, debug/info logs are stripped by tree-shaking.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
    debug: 0, info: 1, warn: 2, error: 3,
};

const currentLevel: LogLevel =
    (typeof process !== 'undefined' && (process.env['LOG_LEVEL'] as LogLevel)) || 'warn';

function shouldLog(level: LogLevel): boolean {
    return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[currentLevel];
}

export const logger = {
    debug: (msg: string, ...args: unknown[]) => {
        if (shouldLog('debug')) console.debug(`[DEBUG] ${msg}`, ...args);
    },
    info: (msg: string, ...args: unknown[]) => {
        if (shouldLog('info')) console.info(`[INFO] ${msg}`, ...args);
    },
    warn: (msg: string, ...args: unknown[]) => {
        if (shouldLog('warn')) console.warn(`[WARN] ${msg}`, ...args);
    },
    error: (msg: string, ...args: unknown[]) => {
        if (shouldLog('error')) console.error(`[ERROR] ${msg}`, ...args);
    },
};
