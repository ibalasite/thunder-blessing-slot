/**
 * WinChecker & Paylines unit tests
 *
 * Covers:
 *   - Payline counts per row-expansion tier (25/33/45/57)
 *   - No duplicate paylines within any set
 *   - Superset relationship between tiers
 *   - Row bounds per tier (new lines only use valid row indices)
 *   - Win detection: 3/4/5-of-a-kind, exact cell paths
 *   - Wild substitution (leading Wild, mid Wild, all-Wild, mixed-type no-win)
 *   - Scatter never wins on a payline
 *   - Row-expansion: only active-tier paylines are scanned
 *   - calcWinAmount arithmetic
 */

import { checkWins, calcWinAmount } from '../../assets/scripts/WinChecker';
import {
    SYM, SymType,
    PAYLINES_25, PAYLINES_33, PAYLINES_45, PAYLINES_57,
    PAYLINES_BY_ROWS,
    PAYTABLE,
    REEL_COUNT, MAX_ROWS,
} from '../../assets/scripts/GameConfig';

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Create a grid [reel][row] filled with the given symbol */
function fillGrid(sym: SymType): SymType[][] {
    return Array.from({ length: REEL_COUNT }, () =>
        Array.from({ length: MAX_ROWS }, () => sym)
    );
}

/** Overwrite one full row (all reels) with a symbol */
function setRow(grid: SymType[][], row: number, sym: SymType): void {
    for (let ri = 0; ri < REEL_COUNT; ri++) grid[ri][row] = sym;
}

/** Overwrite grid cells along a payline path */
function setPayline(grid: SymType[][], rowPath: number[], sym: SymType): void {
    for (let ri = 0; ri < rowPath.length; ri++) grid[ri][rowPath[ri]] = sym;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Payline counts
// ─────────────────────────────────────────────────────────────────────────────

describe('Payline counts', () => {
    it('PAYLINES_25 has exactly 25 entries', () => {
        expect(PAYLINES_25.length).toBe(25);
    });
    it('PAYLINES_33 has exactly 33 entries', () => {
        expect(PAYLINES_33.length).toBe(33);
    });
    it('PAYLINES_45 has exactly 45 entries', () => {
        expect(PAYLINES_45.length).toBe(45);
    });
    it('PAYLINES_57 has exactly 57 entries', () => {
        expect(PAYLINES_57.length).toBe(57);
    });
    it('PAYLINES_BY_ROWS maps 3→PAYLINES_25', () => {
        expect(PAYLINES_BY_ROWS[3]).toBe(PAYLINES_25);
    });
    it('PAYLINES_BY_ROWS maps 4→PAYLINES_33', () => {
        expect(PAYLINES_BY_ROWS[4]).toBe(PAYLINES_33);
    });
    it('PAYLINES_BY_ROWS maps 5→PAYLINES_45', () => {
        expect(PAYLINES_BY_ROWS[5]).toBe(PAYLINES_45);
    });
    it('PAYLINES_BY_ROWS maps 6→PAYLINES_57', () => {
        expect(PAYLINES_BY_ROWS[6]).toBe(PAYLINES_57);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Payline structure: path length, no duplicates, superset chain
// ─────────────────────────────────────────────────────────────────────────────

describe('Payline structure', () => {
    const ALL_SETS = [
        { name: 'PAYLINES_25', lines: PAYLINES_25 },
        { name: 'PAYLINES_33', lines: PAYLINES_33 },
        { name: 'PAYLINES_45', lines: PAYLINES_45 },
        { name: 'PAYLINES_57', lines: PAYLINES_57 },
    ] as const;

    ALL_SETS.forEach(({ name, lines }) => {
        it(`${name}: every path has exactly ${REEL_COUNT} entries`, () => {
            lines.forEach((path, i) => {
                expect(path.length).toBe(REEL_COUNT);
            });
        });

        it(`${name}: no duplicate payline paths`, () => {
            const seen = new Set<string>();
            for (const path of lines) {
                const key = JSON.stringify(path);
                expect(seen.has(key)).toBe(false);
                seen.add(key);
            }
        });
    });

    it('PAYLINES_33 is a superset: first 25 entries match PAYLINES_25', () => {
        for (let i = 0; i < 25; i++) {
            expect(PAYLINES_33[i]).toEqual(PAYLINES_25[i]);
        }
    });

    it('PAYLINES_45 is a superset: first 33 entries match PAYLINES_33', () => {
        for (let i = 0; i < 33; i++) {
            expect(PAYLINES_45[i]).toEqual(PAYLINES_33[i]);
        }
    });

    it('PAYLINES_57 is a superset: first 45 entries match PAYLINES_45', () => {
        for (let i = 0; i < 45; i++) {
            expect(PAYLINES_57[i]).toEqual(PAYLINES_45[i]);
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Row bounds: each tier's new entries only use valid row indices
// ─────────────────────────────────────────────────────────────────────────────

describe('Payline row bounds per tier', () => {
    it('PAYLINES_25: all row indices in range [0,2]', () => {
        PAYLINES_25.forEach(path => {
            path.forEach(r => {
                expect(r).toBeGreaterThanOrEqual(0);
                expect(r).toBeLessThanOrEqual(2);
            });
        });
    });

    it('PAYLINES_33 new entries (26–33): row indices in range [0,3]', () => {
        for (let i = 25; i < 33; i++) {
            PAYLINES_33[i].forEach(r => {
                expect(r).toBeLessThan(4);
            });
        }
    });

    it('PAYLINES_45 new entries (34–45): row indices in range [0,4]', () => {
        for (let i = 33; i < 45; i++) {
            PAYLINES_45[i].forEach(r => {
                expect(r).toBeLessThan(5);
            });
        }
    });

    it('PAYLINES_45 new entries include at least one that uses row 4', () => {
        const usesRow4 = PAYLINES_45.slice(33).some(path => path.includes(4));
        expect(usesRow4).toBe(true);
    });

    it('PAYLINES_57 new entries (46–57): row indices in range [0,5]', () => {
        for (let i = 45; i < 57; i++) {
            PAYLINES_57[i].forEach(r => {
                expect(r).toBeLessThan(6);
            });
        }
    });

    it('PAYLINES_57 new entries include at least one that uses row 5', () => {
        const usesRow5 = PAYLINES_57.slice(45).some(path => path.includes(5));
        expect(usesRow5).toBe(true);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. checkWins — basic win detection
// ─────────────────────────────────────────────────────────────────────────────

describe('checkWins – basic detection (rows=3)', () => {
    const BET = 1.0;

    it('all-same grid: returns wins for all 25 paylines', () => {
        const grid = fillGrid(SYM.L4);
        const wins = checkWins(grid, 3, BET);
        expect(wins.length).toBe(25);
    });

    it('5-of-a-kind P1 on middle row (line index 0)', () => {
        const grid = fillGrid(SYM.L4);
        setRow(grid, 1, SYM.P1);
        const wins = checkWins(grid, 3, BET);
        const hit = wins.find(w => w.lineIndex === 0);
        expect(hit).toBeDefined();
        expect(hit!.symbol).toBe(SYM.P1);
        expect(hit!.count).toBe(5);
    });

    it('3-of-a-kind: P1 on reels 0–2 of middle row, rest L4 → count=3', () => {
        const grid = fillGrid(SYM.L4);
        grid[0][1] = SYM.P1;
        grid[1][1] = SYM.P1;
        grid[2][1] = SYM.P1;
        const wins = checkWins(grid, 3, BET);
        const hit = wins.find(w => w.lineIndex === 0);
        expect(hit).toBeDefined();
        expect(hit!.count).toBe(3);
    });

    it('2-of-a-kind: no win (count < 3)', () => {
        const grid = fillGrid(SYM.L4);
        grid[0][1] = SYM.P1;
        grid[1][1] = SYM.P1;
        const wins = checkWins(grid, 3, BET);
        const hit = wins.find(w => w.lineIndex === 0);
        expect(hit).toBeUndefined();
    });

    it('win cells include correct reel/row coordinates', () => {
        const grid = fillGrid(SYM.L4);
        // Line 0 = [1,1,1,1,1] — middle row
        setRow(grid, 1, SYM.P2);
        const wins = checkWins(grid, 3, BET);
        const hit = wins.find(w => w.lineIndex === 0 && w.symbol === SYM.P2);
        expect(hit).toBeDefined();
        for (let ri = 0; ri < 5; ri++) {
            expect(hit!.cells[ri]).toEqual({ reel: ri, row: 1 });
        }
    });

    it('bottom-row flat line [0,0,0,0,0] at line index 1 wins', () => {
        const grid = fillGrid(SYM.L4);
        setRow(grid, 0, SYM.P3);
        const wins = checkWins(grid, 3, BET);
        const hit = wins.find(w => w.lineIndex === 1);
        expect(hit).toBeDefined();
        expect(hit!.symbol).toBe(SYM.P3);
    });

    it('top-row flat line [2,2,2,2,2] at line index 2 wins', () => {
        const grid = fillGrid(SYM.L4);
        setRow(grid, 2, SYM.P4);
        const wins = checkWins(grid, 3, BET);
        const hit = wins.find(w => w.lineIndex === 2);
        expect(hit).toBeDefined();
        expect(hit!.symbol).toBe(SYM.P4);
    });

    it('Scatter-only grid: zero payline wins', () => {
        const grid = fillGrid(SYM.SCATTER);
        const wins = checkWins(grid, 3, BET);
        expect(wins.length).toBe(0);
    });

    it('multiplier stored in result matches PAYTABLE', () => {
        const grid = fillGrid(SYM.P1);
        setRow(grid, 1, SYM.P1);
        const wins = checkWins(grid, 3, BET);
        wins.filter(w => w.symbol === SYM.P1 && w.count === 5).forEach(w => {
            expect(w.multiplier).toBe(PAYTABLE[SYM.P1][5]);
        });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. checkWins — row-expansion: each tier activates the right number of lines
// ─────────────────────────────────────────────────────────────────────────────

describe('checkWins – row-expansion payline activation', () => {
    const BET = 1.0;

    it('rows=3: exactly 25 wins on all-same grid', () => {
        const grid = fillGrid(SYM.L4);
        expect(checkWins(grid, 3, BET).length).toBe(25);
    });

    it('rows=4: exactly 33 wins on all-same grid', () => {
        const grid = fillGrid(SYM.L4);
        expect(checkWins(grid, 4, BET).length).toBe(33);
    });

    it('rows=5: exactly 45 wins on all-same grid', () => {
        const grid = fillGrid(SYM.L4);
        expect(checkWins(grid, 5, BET).length).toBe(45);
    });

    it('rows=6: exactly 57 wins on all-same grid', () => {
        const grid = fillGrid(SYM.L4);
        expect(checkWins(grid, 6, BET).length).toBe(57);
    });

    it('rows=3: paylines requiring row>=3 are not scanned', () => {
        const grid = fillGrid(SYM.L4);
        // Row 3 gets a different symbol; if any row-3 line were checked it would not win
        setRow(grid, 3, SYM.WILD); // WILD would yield more wins if scanned
        const wins = checkWins(grid, 3, BET);
        // Must still be exactly 25 wins (rows 0–2 only, all L4)
        expect(wins.length).toBe(25);
        // None should reference row 3
        const hasRow3 = wins.some(w => w.cells.some(c => c.row >= 3));
        expect(hasRow3).toBe(false);
    });

    it('rows=4: row-3 paylines fire when row 3 matches', () => {
        // Build a grid where rows 0–2 are all distinct non-winning clusters
        // but row 3 is all the same so [3,3,3,3,3] wins
        const grid = fillGrid(SYM.L2); // rows 0,1,2,3 all same → 33 wins
        const wins = checkWins(grid, 4, BET);
        expect(wins.length).toBe(33);
    });

    it('rows=4: paylines requiring row>=4 are NOT scanned', () => {
        const grid = fillGrid(SYM.L4);
        setRow(grid, 4, SYM.WILD); // visible only if rows>=5
        const wins = checkWins(grid, 4, BET);
        expect(wins.length).toBe(33);
        const hasRow4 = wins.some(w => w.cells.some(c => c.row >= 4));
        expect(hasRow4).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. checkWins — Wild substitution
// ─────────────────────────────────────────────────────────────────────────────

describe('checkWins – Wild substitution', () => {
    const BET = 1.0;

    it('leading Wild + 4× P1 → P1×5 win', () => {
        const grid = fillGrid(SYM.L4);
        grid[0][1] = SYM.WILD;
        grid[1][1] = SYM.P1;
        grid[2][1] = SYM.P1;
        grid[3][1] = SYM.P1;
        grid[4][1] = SYM.P1;
        const wins = checkWins(grid, 3, BET);
        const hit = wins.find(w => w.lineIndex === 0);
        expect(hit).toBeDefined();
        expect(hit!.symbol).toBe(SYM.P1);
        expect(hit!.count).toBe(5);
    });

    it('leading Wild + P1 + P2 + … → chain breaks at P2, count=2 → no win', () => {
        const grid = fillGrid(SYM.L4); // L4 as neutral filler
        // Middle row: WILD, P1, P2, L4, L4
        grid[0][1] = SYM.WILD;
        grid[1][1] = SYM.P1;
        grid[2][1] = SYM.P2; // breaks P1 chain
        grid[3][1] = SYM.L4;
        grid[4][1] = SYM.L4;
        const wins = checkWins(grid, 3, BET);
        // Line 0 (middle row) should NOT produce a P1 win
        const hit = wins.find(w => w.lineIndex === 0 && w.symbol === SYM.P1);
        expect(hit).toBeUndefined();
    });

    it('Wild in position 1: P1, WILD, P1, P1, P1 → P1×5 win', () => {
        const grid = fillGrid(SYM.L4);
        grid[0][1] = SYM.P1;
        grid[1][1] = SYM.WILD;
        grid[2][1] = SYM.P1;
        grid[3][1] = SYM.P1;
        grid[4][1] = SYM.P1;
        const wins = checkWins(grid, 3, BET);
        const hit = wins.find(w => w.lineIndex === 0);
        expect(hit).toBeDefined();
        expect(hit!.symbol).toBe(SYM.P1);
        expect(hit!.count).toBe(5);
    });

    it('P1, WILD, P2 breaks chain → no P1 win on line 0', () => {
        const grid = fillGrid(SYM.L4);
        grid[0][1] = SYM.P1;
        grid[1][1] = SYM.WILD;
        grid[2][1] = SYM.P2; // mismatch for P1
        grid[3][1] = SYM.L4;
        grid[4][1] = SYM.L4;
        const wins = checkWins(grid, 3, BET);
        const hit = wins.find(w => w.lineIndex === 0 && w.symbol === SYM.P1);
        expect(hit).toBeUndefined();
    });

    it('all-Wild row → WILD×5 win with WILD symbol in result', () => {
        const grid = fillGrid(SYM.L4);
        setRow(grid, 1, SYM.WILD);
        const wins = checkWins(grid, 3, BET);
        const wildWin = wins.find(w => w.lineIndex === 0 && w.symbol === SYM.WILD);
        expect(wildWin).toBeDefined();
        expect(wildWin!.count).toBe(5);
    });

    it('3 leading Wilds + 2 matching non-Wilds → symbol×5 win (Wild extends chain)', () => {
        // [WILD, WILD, WILD, L4, L4]: matchSym=L4 → Wilds count as L4 → L4×5
        const grid = fillGrid(SYM.L4);
        grid[0][1] = SYM.WILD;
        grid[1][1] = SYM.WILD;
        grid[2][1] = SYM.WILD;
        // grid[3][1] and grid[4][1] stay L4
        const wins = checkWins(grid, 3, BET);
        const hit = wins.find(w => w.lineIndex === 0);
        expect(hit).toBeDefined();
        expect(hit!.symbol).toBe(SYM.L4);
        expect(hit!.count).toBe(5);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. checkWins — Scatter exclusion
// ─────────────────────────────────────────────────────────────────────────────

describe('checkWins – Scatter exclusion', () => {
    it('Scatter on all reels in any row never produces a payline win', () => {
        const grid = fillGrid(SYM.SCATTER);
        expect(checkWins(grid, 3, 1.0).length).toBe(0);
    });

    it('Scatter on winning path mixed with normal symbols: only normal chain counts', () => {
        const BET = 1.0;
        const grid = fillGrid(SYM.L4);
        // Middle row: SC, P1, P1, P1, P1 — leading SC should prevent a win on line 0
        grid[0][1] = SYM.SCATTER;
        grid[1][1] = SYM.P1;
        grid[2][1] = SYM.P1;
        grid[3][1] = SYM.P1;
        grid[4][1] = SYM.P1;
        const wins = checkWins(grid, 3, BET);
        // Line 0 starts at reel 0 which is SC — match breaks immediately (count=1), no win
        const hit = wins.find(w => w.lineIndex === 0 && w.symbol === SYM.P1);
        expect(hit).toBeUndefined();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. calcWinAmount
// ─────────────────────────────────────────────────────────────────────────────

describe('calcWinAmount', () => {
    it('returns totalBet × multiplier, rounded to 4 decimal places', () => {
        const win = {
            lineIndex: 0,
            rowPath: [1, 1, 1, 1, 1],
            symbol: SYM.P1 as SymType,
            count: 5,
            multiplier: PAYTABLE[SYM.P1][5],
            cells: [],
        };
        const bet = 0.25;
        expect(calcWinAmount(win, bet)).toBeCloseTo(bet * PAYTABLE[SYM.P1][5], 4);
    });

    it('totalBet=0 returns 0', () => {
        const win = {
            lineIndex: 0, rowPath: [1,1,1,1,1], symbol: SYM.P1 as SymType,
            count: 5, multiplier: 1.17, cells: [],
        };
        expect(calcWinAmount(win, 0)).toBe(0);
    });

    it('multiplier=0 returns 0', () => {
        const win = {
            lineIndex: 0, rowPath: [1,1,1,1,1], symbol: SYM.L4 as SymType,
            count: 2, multiplier: 0, cells: [],
        };
        expect(calcWinAmount(win, 1.0)).toBe(0);
    });
});
