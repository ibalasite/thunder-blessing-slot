/**
 * IEngineAdapter
 * 機率引擎合約 — 單機版由 LocalEngineAdapter 實作，Server 版由 RemoteEngineAdapter 實作
 */
import { SpinRequest, SpinResponse } from './types';

export interface IEngineAdapter {
    spin(req: SpinRequest): Promise<SpinResponse>;
}
