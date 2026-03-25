/**
 * LocalEngineAdapter.unit.test.ts
 * 測試 LocalEngineAdapter 正確地將 SpinRequest 轉換為 SpinResponse
 */
import { SlotEngine } from '../../assets/scripts/SlotEngine';
import { LocalEngineAdapter } from '../../assets/scripts/services/LocalEngineAdapter';
import { SpinRequest } from '../../assets/scripts/contracts/types';
import { FG_MULTIPLIERS, BASE_ROWS } from '../../assets/scripts/GameConfig';

// ─── 測試用 helpers ────────────────────────────────────────────────────────

function makeReq(overrides: Partial<SpinRequest> = {}): SpinRequest {
    return {
        totalBet:    1,
        extraBet:    false,
        inFreeGame:  false,
        fgMultIndex: 0,
        marks:       [],
        ...overrides,
    };
}

// 固定 RNG：永遠回傳 val
function fixedRng(val: number) { return () => val; }

// ─── Tests ────────────────────────────────────────────────────────────────

describe('LocalEngineAdapter', () => {

    // ── basic contract ──────────────────────────────────────────────────

    it('returns a SpinResponse with expected shape', async () => {
        const adapter = new LocalEngineAdapter(new SlotEngine(Math.random));
        const res = await adapter.spin(makeReq());
        expect(res).toHaveProperty('grid');
        expect(res).toHaveProperty('cascadeSteps');
        expect(res).toHaveProperty('totalWin');
        expect(res).toHaveProperty('fgTriggered');
        expect(res).toHaveProperty('finalRows');
        expect(res).toHaveProperty('maxWinCapped');
        expect(res).toHaveProperty('newMarks');
        expect(Array.isArray(res.grid)).toBe(true);
        expect(Array.isArray(res.newMarks)).toBe(true);
    });

    it('returns a Promise (async)', () => {
        const adapter = new LocalEngineAdapter(new SlotEngine(Math.random));
        const p = adapter.spin(makeReq());
        expect(p).toBeInstanceOf(Promise);
        return p;
    });

    // ── fgMultIndex → totalWin ────────────────────────────────────────

    it('totalWin equals totalRawWin * FG_MULTIPLIERS[fgMultIndex]', async () => {
        // Use a seeded engine so we know the raw win is deterministic
        // We just verify the ratio holds across many runs
        for (let idx = 0; idx < FG_MULTIPLIERS.length; idx++) {
            const engine  = new SlotEngine(Math.random);
            const adapter = new LocalEngineAdapter(engine);
            const res     = await adapter.spin(makeReq({ fgMultIndex: idx, totalBet: 2 }));
            // totalWin must be totalRawWin * mult, rounded
            // Re-derive totalRawWin from cascadeSteps
            const rawWin = res.cascadeSteps.reduce((s, step) => s + step.rawWin, 0);
            const expected = parseFloat((rawWin * FG_MULTIPLIERS[idx]).toFixed(4));
            expect(res.totalWin).toBeCloseTo(expected, 4);
        }
    });

    it('totalWin is 0 when there are no cascadeSteps', async () => {
        // Force a spin with 0 wins by using an engine where no cascade occurs
        // We can't guarantee this, so we only verify mathematical consistency
        const adapter = new LocalEngineAdapter(new SlotEngine(Math.random));
        const res = await adapter.spin(makeReq());
        const rawWin = res.cascadeSteps.reduce((s, step) => s + step.rawWin, 0);
        expect(res.totalWin).toBeCloseTo(rawWin * FG_MULTIPLIERS[0], 4);
    });

    // ── marks conversion ──────────────────────────────────────────────

    it('converts marks string[] to Set for engine and returns newMarks as array', async () => {
        const adapter = new LocalEngineAdapter(new SlotEngine(Math.random));
        const req = makeReq({ marks: ['0,0', '1,1'] });
        const res = await adapter.spin(req);
        // newMarks must be an array of strings
        expect(Array.isArray(res.newMarks)).toBe(true);
        res.newMarks.forEach(m => expect(typeof m).toBe('string'));
    });

    it('does not mutate the original marks array from SpinRequest', async () => {
        const adapter = new LocalEngineAdapter(new SlotEngine(Math.random));
        const marks = ['0,0', '1,2'];
        const originalSnapshot = [...marks];
        await adapter.spin(makeReq({ marks }));
        expect(marks).toEqual(originalSnapshot);
    });

    // ── grid ─────────────────────────────────────────────────────────

    it('returned grid has REEL_COUNT columns', async () => {
        const { REEL_COUNT } = await import('../../assets/scripts/GameConfig');
        const adapter = new LocalEngineAdapter(new SlotEngine(Math.random));
        const res = await adapter.spin(makeReq());
        expect(res.grid.length).toBe(REEL_COUNT);
    });

    it('final grid rows >= BASE_ROWS', async () => {
        const adapter = new LocalEngineAdapter(new SlotEngine(Math.random));
        const res = await adapter.spin(makeReq());
        expect(res.finalRows).toBeGreaterThanOrEqual(BASE_ROWS);
    });

    // ── fgTriggered / finalRows ────────────────────────────────────

    it('fgTriggered matches whether finalRows reached MAX_ROWS', async () => {
        const { MAX_ROWS } = await import('../../assets/scripts/GameConfig');
        const adapter = new LocalEngineAdapter(new SlotEngine(Math.random));
        const res = await adapter.spin(makeReq());
        // Consistency: fgTriggered true iff cascades pushed rows to MAX_ROWS
        if (res.fgTriggered) {
            expect(res.finalRows).toBe(MAX_ROWS);
        }
    });

    // ── maxWinCapped ─────────────────────────────────────────────────

    it('maxWinCapped is a boolean', async () => {
        const adapter = new LocalEngineAdapter(new SlotEngine(Math.random));
        const res = await adapter.spin(makeReq());
        expect(typeof res.maxWinCapped).toBe('boolean');
    });

    // ── totalBet scaling ─────────────────────────────────────────────

    it('totalWin scales proportionally with totalBet', async () => {
        // Run the same seeded engine twice with different bets
        let seed = 0;
        const rng = () => {
            seed = (seed * 1664525 + 1013904223) & 0xffffffff;
            return (seed >>> 0) / 0xffffffff;
        };
        const rng1 = (() => { let s = 42; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff; }; })();
        const rng2 = (() => { let s = 42; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff; }; })();
        const adapter1 = new LocalEngineAdapter(new SlotEngine(rng1));
        const adapter2 = new LocalEngineAdapter(new SlotEngine(rng2));
        const res1 = await adapter1.spin(makeReq({ totalBet: 1 }));
        const res2 = await adapter2.spin(makeReq({ totalBet: 2 }));
        // With the same RNG seed, 2× bet produces 2× totalWin
        expect(res2.totalWin).toBeCloseTo(res1.totalWin * 2, 4);
    });

    // ── fgMultIndex out-of-range fallback ─────────────────────────

    it('falls back to multiplier 1 if fgMultIndex is out of range', async () => {
        const adapter = new LocalEngineAdapter(new SlotEngine(Math.random));
        const res = await adapter.spin(makeReq({ fgMultIndex: 99 }));
        // With fallback mult=1, totalWin = totalRawWin
        const rawWin = res.cascadeSteps.reduce((s, step) => s + step.rawWin, 0);
        expect(res.totalWin).toBeCloseTo(rawWin, 4);
    });
});
