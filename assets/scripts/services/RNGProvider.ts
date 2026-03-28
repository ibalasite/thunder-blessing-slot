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

    // Node.js fallback with entropy buffer (256 uint32s per syscall)
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const nodeCrypto = require('crypto') as typeof import('crypto');
        let buf = Buffer.alloc(0);
        let bufOffset = 0;
        return () => {
            if (bufOffset + 4 > buf.length) {
                buf = nodeCrypto.randomBytes(1024); // 256 uint32s per syscall
                bufOffset = 0;
            }
            const val = buf.readUInt32BE(bufOffset);
            bufOffset += 4;
            return val / 0x100000000;
        };
    } catch {
        throw new Error(
            'No CSPRNG available. ' +
            'Requires browser with Web Crypto API or Node.js with crypto module.',
        );
    }
}
