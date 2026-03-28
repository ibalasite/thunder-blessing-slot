/**
 * LocalEngineAdapter.ts
 * IEngineAdapter 的單機版實作 — 直接呼叫 SlotEngine
 */
import { SlotEngine } from '../SlotEngine';
import { IEngineAdapter }       from '../contracts/IEngineAdapter';
import { SpinRequest, SpinResponse, GameMode, FullSpinOutcome } from '../contracts/types';
import { FG_MULTIPLIERS }       from '../GameConfig';

export class LocalEngineAdapter implements IEngineAdapter {

    constructor(private readonly _engine: SlotEngine) {}

    /** Legacy single-spin */
    async spin(req: SpinRequest): Promise<SpinResponse> {
        if (req.fgMultIndex < 0 || req.fgMultIndex >= FG_MULTIPLIERS.length) {
            throw new RangeError(`Invalid fgMultIndex: ${req.fgMultIndex}, must be 0-${FG_MULTIPLIERS.length - 1}`);
        }
        const fgMult   = FG_MULTIPLIERS[req.fgMultIndex];
        const marks    = new Set<string>(req.marks);

        const result = this._engine.simulateSpin({
            extraBet:       req.extraBet,
            inFreeGame:     req.inFreeGame,
            fgMultiplier:   fgMult,
            lightningMarks: marks,
            totalBet:       req.totalBet,
        });

        return {
            grid:         result.finalGrid,
            cascadeSteps: result.cascadeSteps,
            tbStep:       result.tbStep,
            totalWin:     parseFloat((result.totalRawWin * fgMult).toFixed(4)),
            fgTriggered:  result.fgTriggered,
            finalRows:    result.finalRows,
            maxWinCapped: result.maxWinCapped,
            newMarks:     Array.from(marks),
        };
    }

    /** Atomic full-spin: 一次算完 base + FG chain */
    async fullSpin(mode: GameMode, totalBet: number, extraBetOn?: boolean): Promise<FullSpinOutcome> {
        return this._engine.computeFullSpin({ mode, totalBet, extraBetOn });
    }
}
