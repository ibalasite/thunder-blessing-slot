/**
 * IEngineAdapter
 * 機率引擎合約 — 單機版由 LocalEngineAdapter 實作，Server 版由 RemoteEngineAdapter 實作
 */
import { SpinRequest, SpinResponse, GameMode, FullSpinOutcome } from './types';

export interface IEngineAdapter {
    /** Legacy: 單次 spin（保留向後相容） */
    spin(req: SpinRequest): Promise<SpinResponse>;

    /** Atomic: 一次算完整個 spin 含 FG chain，UI 只需播放 */
    fullSpin(mode: GameMode, totalBet: number): Promise<FullSpinOutcome>;
}
