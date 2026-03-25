/**
 * IWalletService — 錢包合約
 *
 * 設計原則：
 *   1. 實際帳務（ledger）與 UI 顯示餘額分離
 *   2. 一次 spin 為原子交易：beginSpin 扣款 → engine 運算 → completeSpin 入帳
 *   3. 斷線安全：扣款和入帳都是立即生效，UI 表演不影響帳務
 *
 * Phase 1: LocalWalletService（單機版，同步）
 * Phase 2: RemoteWalletService（client-server，呼叫 server API）
 * Phase 3: ThirdPartyWalletService（第三方錢包整合）
 *
 * Controller 流程：
 *   1. canAfford(wagered) → 確認餘額
 *   2. beginSpin(wagered) → 立即扣款，回傳 SpinTx
 *   3. engine.fullSpin() → 取得 FullSpinOutcome
 *   4. completeSpin(tx, totalWin) → 立即入帳，回傳新餘額
 *   5. UI 表演動畫（純視覺，不影響帳務）
 *   6. UI syncBalance → 顯示最終餘額
 *
 * 如果在步驟 2-4 之間斷線：
 *   - server 版：server 知道扣款已完成但 spin 未結算 → getPendingTx 復原
 *   - 單機版：餘額已扣款，重新載入時 getPendingTx 檢查
 */

export interface SpinTx {
    txId:      string;
    wagered:   number;
    timestamp: number;
}

export interface IWalletService {
    /** 取得實際餘額（帳務層） */
    getBalance(): number;

    /** 檢查是否有足夠餘額 */
    canAfford(amount: number): boolean;

    /**
     * 開始一次 spin 交易：立即扣款。
     * 回傳 SpinTx 作為這次交易的憑證。
     * 如果餘額不足，拋出 InsufficientFundsError。
     */
    beginSpin(wagered: number): SpinTx;

    /**
     * 結算一次 spin：立即入帳 totalWin。
     * 回傳結算後的實際餘額。
     */
    completeSpin(tx: SpinTx, totalWin: number): number;

    /**
     * 檢查是否有未結算的 spin（斷線復原用）。
     * Phase 1 本地版：一般不會有（同步操作）。
     * Phase 2 server 版：server 可能有未完成的交易。
     */
    getPendingTx(): SpinTx | null;

    // ── 向後相容（逐步淘汰）────────────────────────
    /** @deprecated 用 beginSpin + completeSpin 取代 */
    debit(amount: number): void;
    /** @deprecated 用 completeSpin 取代 */
    credit(amount: number): void;
}
