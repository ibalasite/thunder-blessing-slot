/**
 * money.ts — Unified currency arithmetic utilities.
 * All monetary values stored/displayed as numbers with consistent rounding.
 *
 * Convention:
 *   - Internal calculations: 4 decimal places (prevent cascade accumulation errors)
 *   - Display values: 2 decimal places
 *   - Storage (wallet): 4 decimal places
 */

/** Round to 4 decimal places for internal calculations */
export function round4(value: number): number {
    return parseFloat(value.toFixed(4));
}

/** Round to 2 decimal places for display */
export function round2(value: number): number {
    return parseFloat(value.toFixed(2));
}

/** Add two monetary values with 4dp precision */
export function addMoney(a: number, b: number): number {
    return round4(a + b);
}

/** Subtract two monetary values with 4dp precision */
export function subtractMoney(a: number, b: number): number {
    return round4(a - b);
}

/** Multiply a monetary value by a multiplier, round to 4dp */
export function multiplyMoney(value: number, multiplier: number): number {
    return round4(value * multiplier);
}
