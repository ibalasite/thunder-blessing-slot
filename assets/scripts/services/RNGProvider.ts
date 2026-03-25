/**
 * RNGProvider.ts
 * 統一亂數來源 — Production 使用 CSPRNG，測試可注入 seeded RNG。
 *
 * Production 路徑：
 *   Browser → crypto.getRandomValues (Web Crypto API)
 *   Node.js → crypto.randomBytes
 *
 * 禁止在任何 production 路徑使用 Math.random()。
 */

export type RNGFunction = () => number;

/**
 * 建立 CSPRNG 亂數產生器。
 * 回傳值為 [0, 1) 的浮點數，行為等同 Math.random()，但使用系統 entropy。
 */
export function createCSPRNG(): RNGFunction {
    // Browser: Web Crypto API
    if (typeof globalThis !== 'undefined' &&
        typeof globalThis.crypto?.getRandomValues === 'function') {
        const buf = new Uint32Array(1);
        return () => {
            globalThis.crypto.getRandomValues(buf);
            return buf[0] / 0x100000000;
        };
    }

    // Node.js fallback
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const nodeCrypto = require('crypto') as typeof import('crypto');
        return () => nodeCrypto.randomBytes(4).readUInt32BE(0) / 0x100000000;
    } catch {
        throw new Error(
            'No CSPRNG available. ' +
            'Requires browser with Web Crypto API or Node.js with crypto module.',
        );
    }
}
