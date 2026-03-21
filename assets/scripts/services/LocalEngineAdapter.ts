/**
 * LocalEngineAdapter.ts
 * IEngineAdapter 的單機版實作 — 直接呼叫 SlotEngine.simulateSpin()
 */
import { SlotEngine } from '../SlotEngine';
import { IEngineAdapter }       from '../contracts/IEngineAdapter';
import { SpinRequest, SpinResponse } from '../contracts/types';
import { FG_MULTIPLIERS }       from '../GameConfig';

export class LocalEngineAdapter implements IEngineAdapter {

    constructor(private readonly _engine: SlotEngine) {}

    async spin(req: SpinRequest): Promise<SpinResponse> {
        const fgMult   = FG_MULTIPLIERS[req.fgMultIndex] ?? 1;
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
            newMarks:     [...marks],
        };
    }
}
