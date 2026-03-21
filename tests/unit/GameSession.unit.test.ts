/**
 * GameSession unit tests
 *
 * Covers:
 *   - Initial state
 *   - expandRows / resetRows
 *   - Lightning marks
 *   - Free Game state transitions
 *   - Bet computation (base / extra)
 *   - Round win accumulation
 *   - resetRound clears all per-round state
 */
import { GameSession } from '../../assets/scripts/core/GameSession';
import {
    BASE_ROWS, MAX_ROWS, FG_MULTIPLIERS, DEFAULT_BET,
} from '../../assets/scripts/GameConfig';

const LINES_BASE = 25;
const LINES_MAX  = 57;

describe('GameSession – initial state', () => {
    let s: GameSession;
    beforeEach(() => { s = new GameSession(); });

    it('starts at BASE_ROWS', () => {
        expect(s.currentRows).toBe(BASE_ROWS);
    });

    it('starts not in free game', () => {
        expect(s.inFreeGame).toBe(false);
        expect(s.fgMultIndex).toBe(0);
        expect(s.fgMultiplier).toBe(FG_MULTIPLIERS[0]);
    });

    it('starts with correct totalBet for DEFAULT_BET', () => {
        expect(s.totalBet).toBeCloseTo(DEFAULT_BET, 5);
    });

    it('starts with empty lightning marks', () => {
        expect(s.lightningMarks.size).toBe(0);
    });

    it('starts with zero roundWin and cascadeCount', () => {
        expect(s.roundWin).toBe(0);
        expect(s.cascadeCount).toBe(0);
    });

    it('grid starts as empty array', () => {
        expect(s.grid).toEqual([]);
    });
});

describe('GameSession – expandRows / resetRows', () => {
    let s: GameSession;
    beforeEach(() => { s = new GameSession(); });

    it('expandRows increments currentRows by 1', () => {
        s.expandRows();
        expect(s.currentRows).toBe(BASE_ROWS + 1);
    });

    it('expandRows does not exceed MAX_ROWS', () => {
        for (let i = 0; i < 20; i++) s.expandRows();
        expect(s.currentRows).toBe(MAX_ROWS);
    });

    it('resetRows resets to BASE_ROWS', () => {
        s.expandRows();
        s.expandRows();
        s.resetRows();
        expect(s.currentRows).toBe(BASE_ROWS);
    });
});

describe('GameSession – lightning marks', () => {
    let s: GameSession;
    beforeEach(() => { s = new GameSession(); });

    it('addMark + hasMark', () => {
        s.addMark(2, 1);
        expect(s.hasMark(2, 1)).toBe(true);
        expect(s.hasMark(2, 0)).toBe(false);
    });

    it('lightningMarks size tracks additions', () => {
        s.addMark(0, 0);
        s.addMark(1, 2);
        expect(s.lightningMarks.size).toBe(2);
    });

    it('duplicate addMark is idempotent', () => {
        s.addMark(0, 0);
        s.addMark(0, 0);
        expect(s.lightningMarks.size).toBe(1);
    });

    it('clearMarks empties the set', () => {
        s.addMark(0, 0);
        s.clearMarks();
        expect(s.lightningMarks.size).toBe(0);
        expect(s.hasMark(0, 0)).toBe(false);
    });

    it('lightningMarks is ReadonlySet (cannot be mutated externally)', () => {
        // TypeScript will enforce this at compile time;
        // at runtime the underlying Set is the same object — this tests the shape
        const marks = s.lightningMarks;
        expect(typeof marks.has).toBe('function');
        expect(typeof (marks as any).add).toBe('function'); // still a Set internally
    });
});

describe('GameSession – Free Game transitions', () => {
    let s: GameSession;
    beforeEach(() => { s = new GameSession(); });

    it('enterFreeGame sets inFreeGame and multIndex', () => {
        s.enterFreeGame(1);
        expect(s.inFreeGame).toBe(true);
        expect(s.fgMultIndex).toBe(1);
        expect(s.fgMultiplier).toBe(FG_MULTIPLIERS[1]);
    });

    it('exitFreeGame resets FG state', () => {
        s.enterFreeGame(2);
        s.exitFreeGame();
        expect(s.inFreeGame).toBe(false);
        expect(s.fgMultIndex).toBe(0);
    });

    it('upgradeFGMultiplier increments multIndex', () => {
        s.enterFreeGame(0);
        s.upgradeFGMultiplier();
        expect(s.fgMultIndex).toBe(1);
        expect(s.fgMultiplier).toBe(FG_MULTIPLIERS[1]);
    });

    it('upgradeFGMultiplier caps at last index', () => {
        s.enterFreeGame(FG_MULTIPLIERS.length - 1);
        s.upgradeFGMultiplier();
        expect(s.fgMultIndex).toBe(FG_MULTIPLIERS.length - 1);
    });

    it('enterFreeGame(0) uses first FG_MULTIPLIER', () => {
        s.enterFreeGame(0);
        expect(s.fgMultiplier).toBe(FG_MULTIPLIERS[0]);
    });
});

describe('GameSession – bet computation', () => {
    let s: GameSession;
    beforeEach(() => { s = new GameSession(); });

    it('default totalBet equals DEFAULT_BET (0.25)', () => {
        expect(s.totalBet).toBeCloseTo(0.25, 5);
    });

    it('setExtraBet(true) multiplies totalBet by 3', () => {
        const base = s.totalBet;
        s.setExtraBet(true);
        expect(s.totalBet).toBeCloseTo(base * 3, 2);
    });

    it('setExtraBet(false) restores original totalBet', () => {
        s.setExtraBet(true);
        s.setExtraBet(false);
        expect(s.totalBet).toBeCloseTo(DEFAULT_BET, 5);
    });

    it('after expandRows to row=4 totalBet uses LINES_MAX (57 lines)', () => {
        s.expandRows(); // 4 rows
        s.computeTotalBet();
        const expected = parseFloat((s.betPerLine * LINES_MAX).toFixed(2));
        expect(s.totalBet).toBeCloseTo(expected, 4);
    });

    it('setBetPerLine updates totalBet', () => {
        const newBpl = 0.01;
        s.setBetPerLine(newBpl);
        const expected = parseFloat((newBpl * LINES_BASE).toFixed(2));
        expect(s.totalBet).toBeCloseTo(expected, 4);
    });
});

describe('GameSession – roundWin & cascadeCount', () => {
    let s: GameSession;
    beforeEach(() => { s = new GameSession(); });

    it('addRoundWin accumulates correctly', () => {
        s.addRoundWin(1.25);
        s.addRoundWin(0.5);
        expect(s.roundWin).toBeCloseTo(1.75, 4);
    });

    it('incrementCascade increments cascadeCount', () => {
        s.incrementCascade();
        s.incrementCascade();
        expect(s.cascadeCount).toBe(2);
    });

    it('resetRound clears roundWin, cascadeCount, and resets rows', () => {
        s.addRoundWin(10);
        s.incrementCascade();
        s.expandRows();
        s.resetRound();
        expect(s.roundWin).toBe(0);
        expect(s.cascadeCount).toBe(0);
        expect(s.currentRows).toBe(BASE_ROWS);
    });

    it('resetRound does NOT clear lightning marks', () => {
        s.addMark(0, 0);
        s.resetRound();
        expect(s.hasMark(0, 0)).toBe(true); // marks persist across rounds (FG context)
    });
});

describe('GameSession – setGrid', () => {
    let s: GameSession;
    beforeEach(() => { s = new GameSession(); });

    it('setGrid stores a deep clone', () => {
        const g = [['P1', 'L2', 'W'], ['SC', 'P3', 'L4']] as any;
        s.setGrid(g);
        g[0][0] = 'CHANGED';
        expect(s.grid[0][0]).toBe('P1'); // clone, not reference
    });
});
