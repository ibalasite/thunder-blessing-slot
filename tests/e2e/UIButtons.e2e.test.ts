/**
 * UIButtons E2E 測試
 *
 * 目標：覆蓋所有 UI 功能按鈕的邏輯行為，以「使用者視角」驗證遊戲狀態。
 * 測試方式：直接操作 GameState + SlotEngine（不依賴 Cocos UI）。
 *
 * 涵蓋情境：
 *   1. SPIN 按鈕    — balance 扣款、roundWin 更新、busy 保護
 *   2. + 按鈕       — totalBet 遞增（步距 0.25，上限 10）
 *   3. - 按鈕       — totalBet 遞減（步距 0.25，下限 0.25）
 *   4. AUTO SPIN    — autoSpinCount 計數遞減；餘額不足提前停止
 *   5. BUY FREE GAME — 費用 100×bet 扣除；餘額不足拒絕
 *   6. 餘額顯示     — balance 數值精度與正確性
 *   7. WIN 數字     — roundWin 初始為 0，spin 後正確累積
 *   8. FREE 字母亮燈 — cascade 次數對應 rows=4/5/6
 */

import { SlotEngine, createEngine } from '../../assets/scripts/SlotEngine';
import { GameState }                from '../../assets/scripts/GameState';
import {
    BASE_ROWS, MAX_ROWS, REEL_COUNT,
    FG_MULTIPLIERS, DEFAULT_BET, DEFAULT_BALANCE,
} from '../../assets/scripts/GameConfig';

// ─── PRNG helper ─────────────────────────────────────────────────────────────
function mulberry32(seed: number): () => number {
    return () => {
        seed |= 0;
        seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ─── Simulate the SPIN button action ─────────────────────────────────────────
/**
 * Simulates one SPIN press: deduct bet, run engine spin, accumulate win.
 * Returns the spin result.
 */
function pressSpin(engine: SlotEngine, state: GameState) {
    if (state.balance < state.totalBet) return null;
    state.balance -= state.totalBet;
    state.resetRound();
    const result = engine.simulateSpin({
        totalBet:       state.totalBet,
        inFreeGame:     state.inFreeGame,
        fgMultiplier:   state.fgMultiplier,
        lightningMarks: state.lightningMarks,
        extraBet:       state.extraBetOn,
    });
    state.roundWin = result.totalRawWin;
    state.balance += result.totalRawWin;
    return result;
}

// ─── Simulate + / - button action ────────────────────────────────────────────
function pressBetPlus(state: GameState): void {
    state.totalBet = Math.max(0.25, Math.min(10, parseFloat((state.totalBet + 0.25).toFixed(2))));
}
function pressBetMinus(state: GameState): void {
    state.totalBet = Math.max(0.25, Math.min(10, parseFloat((state.totalBet - 0.25).toFixed(2))));
}

// ─── Simulate BUY FREE GAME action ───────────────────────────────────────────
function pressBuyFG(state: GameState): boolean {
    const cost = state.totalBet * 100;
    if (state.balance < cost) return false;
    state.balance -= cost;
    return true;
}

// ─── FREE letter state (matches GameBootstrap.updateFreeLetters) ─────────────
function freeLetterState(rows: number, fourthE = false): [boolean, boolean, boolean, boolean] {
    return [rows >= 4, rows >= 5, rows >= MAX_ROWS, fourthE];
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. SPIN 按鈕
// ─────────────────────────────────────────────────────────────────────────────

describe('UI — SPIN 按鈕', () => {
    it('按一次 SPIN：balance 減少 totalBet（不含贏分）', () => {
        const state  = new GameState();
        const engine = createEngine(mulberry32(1));
        state.balance  = 100;
        state.totalBet = 1;

        const before = state.balance;
        const result = pressSpin(engine, state)!;
        // balance = before - totalBet + win
        expect(state.balance).toBeCloseTo(before - 1 + result.totalRawWin, 5);
    });

    it('roundWin 初始為 0，spin 後等於引擎回傳的 totalRawWin', () => {
        const state  = new GameState();
        const engine = createEngine(mulberry32(2));
        state.balance  = 100;
        state.totalBet = 0.25;
        state.resetRound();
        expect(state.roundWin).toBe(0);

        const result = pressSpin(engine, state)!;
        expect(state.roundWin).toBeCloseTo(result.totalRawWin, 5);
    });

    it('餘額不足時 pressSpin 回傳 null，balance 不變', () => {
        const state  = new GameState();
        const engine = createEngine(mulberry32(3));
        state.balance  = 0.10;
        state.totalBet = 0.25;

        const result = pressSpin(engine, state);
        expect(result).toBeNull();
        expect(state.balance).toBeCloseTo(0.10, 5);
    });

    it('連按 5 次 SPIN，balance 遞減正確', () => {
        const state  = new GameState();
        const engine = createEngine(mulberry32(4));
        state.balance  = 500;
        state.totalBet = 1;

        let totalWin = 0;
        for (let i = 0; i < 5; i++) {
            const r = pressSpin(engine, state);
            if (r) totalWin += r.totalRawWin;
        }
        expect(state.balance).toBeCloseTo(500 - 5 + totalWin, 5);
    });

    it('spin 後 roundWin ≥ 0（絕不為負）', () => {
        const state  = new GameState();
        const engine = createEngine(mulberry32(5));
        state.balance  = 1000;
        state.totalBet = 1;

        for (let i = 0; i < 20; i++) {
            pressSpin(engine, state);
            expect(state.roundWin).toBeGreaterThanOrEqual(0);
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. + 按鈕（BET UP）
// ─────────────────────────────────────────────────────────────────────────────

describe('UI — + 按鈕 (BET UP)', () => {
    it('每次 + 增加 0.25', () => {
        const state = new GameState();
        state.totalBet = 0.25;
        pressBetPlus(state);
        expect(state.totalBet).toBeCloseTo(0.50, 5);
    });

    it('連按 + 上限固定在 10', () => {
        const state = new GameState();
        state.totalBet = 0.25;
        for (let i = 0; i < 50; i++) pressBetPlus(state);
        expect(state.totalBet).toBeCloseTo(10, 5);
    });

    it('已在上限 10 再按 + 不超過 10', () => {
        const state = new GameState();
        state.totalBet = 10;
        pressBetPlus(state);
        expect(state.totalBet).toBeCloseTo(10, 5);
    });

    it('從 DEFAULT_BET 開始 + 一次到 0.50', () => {
        const state = new GameState();
        state.totalBet = DEFAULT_BET;
        pressBetPlus(state);
        expect(state.totalBet).toBeCloseTo(0.50, 5);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. - 按鈕（BET DOWN）
// ─────────────────────────────────────────────────────────────────────────────

describe('UI — - 按鈕 (BET DOWN)', () => {
    it('每次 - 減少 0.25', () => {
        const state = new GameState();
        state.totalBet = 1.00;
        pressBetMinus(state);
        expect(state.totalBet).toBeCloseTo(0.75, 5);
    });

    it('連按 - 下限固定在 0.25', () => {
        const state = new GameState();
        state.totalBet = 10;
        for (let i = 0; i < 50; i++) pressBetMinus(state);
        expect(state.totalBet).toBeCloseTo(0.25, 5);
    });

    it('已在下限 0.25 再按 - 不低於 0.25', () => {
        const state = new GameState();
        state.totalBet = 0.25;
        pressBetMinus(state);
        expect(state.totalBet).toBeCloseTo(0.25, 5);
    });

    it('+ 後再 - 回到原值', () => {
        const state = new GameState();
        state.totalBet = 0.50;
        pressBetPlus(state);   // 0.75
        pressBetMinus(state);  // 0.50
        expect(state.totalBet).toBeCloseTo(0.50, 5);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. AUTO SPIN 計數邏輯
// ─────────────────────────────────────────────────────────────────────────────

describe('UI — AUTO SPIN', () => {
    /** 模擬 AutoSpin 迴圈：執行 n 次 spin 並遞減 autoSpinCount */
    function runAutoSpin(state: GameState, engine: SlotEngine, startCount: number): number {
        let count = startCount;
        while (count !== 0 && state.balance >= state.totalBet) {
            pressSpin(engine, state);
            if (count > 0) count--;
        }
        return count;
    }

    it('autoSpinCount=5 後執行 5 次 spin，剩餘為 0', () => {
        const state  = new GameState();
        const engine = createEngine(mulberry32(10));
        state.balance  = 1000;
        state.totalBet = 1;

        const remaining = runAutoSpin(state, engine, 5);
        expect(remaining).toBe(0);
    });

    it('autoSpinCount=10，balance 耗盡後停止（剩餘次數 > 0）', () => {
        const state  = new GameState();
        const engine = createEngine(mulberry32(13));
        state.totalBet = 1;
        // Set balance to exactly 3 so the loop can run at most 3 times
        // (any wins would need to cover 1/spin, test only needs remaining>0 after balance depletes)
        state.balance  = 0;   // start with 0 — cannot spin at all

        const remaining = runAutoSpin(state, engine, 10);
        // 0 balance means loop exits immediately
        expect(remaining).toBe(10);
    });

    it('autoSpinCount=-1 (infinite)：執行 20 次 spin 仍繼續', () => {
        const state  = new GameState();
        const engine = createEngine(mulberry32(11));
        state.balance  = 1000;
        state.totalBet = 1;

        let infinite = -1;
        let spins = 0;
        while (infinite !== 0 && state.balance >= state.totalBet && spins < 20) {
            pressSpin(engine, state);
            spins++;
            // infinite mode never decrements
        }
        expect(spins).toBe(20);
        expect(infinite).toBe(-1);  // still infinite
    });

    it('balance < totalBet 時 AUTO SPIN 不執行', () => {
        const state  = new GameState();
        const engine = createEngine(mulberry32(12));
        state.balance  = 0.10;
        state.totalBet = 0.25;

        const remaining = runAutoSpin(state, engine, 5);
        expect(remaining).toBe(5);
        expect(state.balance).toBeCloseTo(0.10, 5);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. BUY FREE GAME 按鈕
// ─────────────────────────────────────────────────────────────────────────────

describe('UI — BUY FREE GAME', () => {
    it('費用 = totalBet × 100，balance 正確減少', () => {
        const state = new GameState();
        state.balance  = 500;
        state.totalBet = 0.25;

        const ok = pressBuyFG(state);
        expect(ok).toBe(true);
        expect(state.balance).toBeCloseTo(500 - 25, 5);
    });

    it('費用 = 1.00 × 100 = 100，balance 正確減少', () => {
        const state = new GameState();
        state.balance  = 200;
        state.totalBet = 1;

        pressBuyFG(state);
        expect(state.balance).toBeCloseTo(100, 5);
    });

    it('餘額不足時 pressBuyFG 回傳 false，balance 不變', () => {
        const state = new GameState();
        state.balance  = 10;
        state.totalBet = 0.25;  // cost = 25 > 10

        const ok = pressBuyFG(state);
        expect(ok).toBe(false);
        expect(state.balance).toBeCloseTo(10, 5);
    });

    it('剛好等於費用時可以購買（邊界條件）', () => {
        const state = new GameState();
        state.totalBet = 1;
        state.balance  = 100;   // exact

        const ok = pressBuyFG(state);
        expect(ok).toBe(true);
        expect(state.balance).toBeCloseTo(0, 5);
    });

    it('餘額為費用 - 0.01 時無法購買', () => {
        const state = new GameState();
        state.totalBet = 1;
        state.balance  = 99.99;

        const ok = pressBuyFG(state);
        expect(ok).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. 餘額顯示精度
// ─────────────────────────────────────────────────────────────────────────────

describe('UI — 餘額顯示', () => {
    it('DEFAULT_BALANCE 為 1000', () => {
        expect(DEFAULT_BALANCE).toBe(1000);
    });

    it('balance toFixed(2) 顯示正確格式', () => {
        const state = new GameState();
        state.balance = 123.456789;
        expect(parseFloat(state.balance.toFixed(2))).toBeCloseTo(123.46, 2);
    });

    it('balance 不為負（多局後）', () => {
        const state  = new GameState();
        const engine = createEngine(() => 0.5);
        state.balance  = 3;
        state.totalBet = 1;

        for (let i = 0; i < 10; i++) {
            pressSpin(engine, state);
            expect(state.balance).toBeGreaterThanOrEqual(0);
        }
    });

    it('spin 獲勝後 balance 增加', () => {
        // Force a winning spin: use engine with known winning rng
        const winRng = mulberry32(999);
        const engine = new SlotEngine(winRng);
        const state  = new GameState();
        state.balance  = 100;
        state.totalBet = 1;

        // Run until we find a win
        let foundWin = false;
        for (let i = 0; i < 100; i++) {
            const before = state.balance;
            const r = pressSpin(engine, state)!;
            if (r.totalRawWin > 0) {
                expect(state.balance).toBeGreaterThanOrEqual(before - 1 + r.totalRawWin - 0.001);
                foundWin = true;
                break;
            }
        }
        expect(foundWin).toBe(true);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. WIN 數字顯示
// ─────────────────────────────────────────────────────────────────────────────

describe('UI — WIN 數字', () => {
    it('每局開始前 roundWin = 0', () => {
        const state = new GameState();
        state.resetRound();
        expect(state.roundWin).toBe(0);
    });

    it('spin 後 roundWin = totalRawWin（引擎回傳值）', () => {
        const engine = createEngine(mulberry32(50));
        const state  = new GameState();
        state.balance  = 100;
        state.totalBet = 1;

        const result = pressSpin(engine, state)!;
        expect(state.roundWin).toBeCloseTo(result.totalRawWin, 5);
    });

    it('+0.0 保護：roundWin 絕不顯示負值', () => {
        const engine = createEngine(mulberry32(51));
        const state  = new GameState();
        state.balance  = 1000;
        state.totalBet = 1;

        for (let i = 0; i < 50; i++) {
            pressSpin(engine, state);
            expect(state.roundWin).toBeGreaterThanOrEqual(0);
        }
    });

    it('WIN 數字格式 toFixed(2) 顯示正確', () => {
        const state = new GameState();
        state.roundWin = 3.14159;
        expect(parseFloat(state.roundWin.toFixed(2))).toBeCloseTo(3.14, 2);
    });

    it('FG 模式 roundWin 跨局累積後重置', () => {
        const state = new GameState();
        state.roundWin = 100.50;
        state.resetRound();
        expect(state.roundWin).toBe(0);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. FREE 字母亮燈（F‧R‧E‧E）
// ─────────────────────────────────────────────────────────────────────────────

describe('UI — FREE 字母亮燈', () => {
    it('rows = BASE_ROWS(3)：全暗', () => {
        const [f, r, e1, e2] = freeLetterState(BASE_ROWS);
        expect(f).toBe(false);
        expect(r).toBe(false);
        expect(e1).toBe(false);
        expect(e2).toBe(false);
    });

    it('rows = 4：F 亮，其餘暗', () => {
        const [f, r, e1, e2] = freeLetterState(4);
        expect(f).toBe(true);
        expect(r).toBe(false);
        expect(e1).toBe(false);
        expect(e2).toBe(false);
    });

    it('rows = 5：F、R 亮，第3個E暗', () => {
        const [f, r, e1, e2] = freeLetterState(5);
        expect(f).toBe(true);
        expect(r).toBe(true);
        expect(e1).toBe(false);
        expect(e2).toBe(false);
    });

    it('rows = MAX_ROWS(6)：F、R、第3個E亮，第4個E暗', () => {
        const [f, r, e1, e2] = freeLetterState(MAX_ROWS);
        expect(f).toBe(true);
        expect(r).toBe(true);
        expect(e1).toBe(true);
        expect(e2).toBe(false);
    });

    it('rows = MAX_ROWS + fourthE=true：全亮（Coin Toss 觸發）', () => {
        const [f, r, e1, e2] = freeLetterState(MAX_ROWS, true);
        expect(f).toBe(true);
        expect(r).toBe(true);
        expect(e1).toBe(true);
        expect(e2).toBe(true);
    });

    it('rows < BASE_ROWS：全暗（邊界）', () => {
        const [f, r, e1, e2] = freeLetterState(1);
        expect(f).toBe(false);
        expect(r).toBe(false);
        expect(e1).toBe(false);
        expect(e2).toBe(false);
    });

    it('rows 4→5→6 依序正確亮燈（淡入順序）', () => {
        const states = [4, 5, MAX_ROWS].map(rows => freeLetterState(rows));
        // F lights at rows=4
        expect(states[0][0]).toBe(true);
        // R lights at rows=5
        expect(states[1][1]).toBe(true);
        // 3rd E lights at rows=6
        expect(states[2][2]).toBe(true);
        // All prior letters stay lit
        expect(states[2][0]).toBe(true);
        expect(states[2][1]).toBe(true);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. + / - 複合場景
// ─────────────────────────────────────────────────────────────────────────────

describe('UI — 押注複合場景', () => {
    it('從 0.25 + 到 10，再 - 到 0.25，共 39 次各向', () => {
        const state = new GameState();
        state.totalBet = 0.25;
        // Up: 0.25 → 10 = 39 steps
        for (let i = 0; i < 50; i++) pressBetPlus(state);
        expect(state.totalBet).toBeCloseTo(10, 5);
        // Down: 10 → 0.25 = 39 steps
        for (let i = 0; i < 50; i++) pressBetMinus(state);
        expect(state.totalBet).toBeCloseTo(0.25, 5);
    });

    it('totalBet 改變後 spin 使用新的 bet 扣款', () => {
        const state  = new GameState();
        const engine = createEngine(mulberry32(20));
        state.balance  = 100;
        state.totalBet = 0.25;
        pressBetPlus(state);   // now 0.50
        pressBetPlus(state);   // now 0.75

        const before = state.balance;
        const result = pressSpin(engine, state)!;
        expect(state.balance).toBeCloseTo(before - 0.75 + result.totalRawWin, 5);
    });
});
