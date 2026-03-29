/**
 * IUIController
 * UI 顯示合約 — 供 GameFlowController 呼叫，
 * 實作由 UIController（Cocos Component）提供；測試中以 jest.fn() mock
 */
export interface IUIController {
    /** 刷新押注、WIN 等數字標籤（不含餘額） */
    refresh(): void;
    /**
     * 設定 UI 上顯示的餘額（跟隨動畫，非實際帳務）。
     * Controller 在不同時機設定不同值：
     *   spin 開始：actualBalance - wagered（扣款動畫）
     *   cascade 中：startBalance + accumulatedWin（贏分遞增）
     *   spin 結束：actualBalance（同步實際帳務）
     */
    setDisplayBalance(balance: number): void;
    /** 設置狀態列文字 */
    setStatus(msg: string, color?: string): void;
    /** 每步 cascade 的中獎彈出動畫：stepWin=本步獎金, roundWin=累計 */
    showWinPop(stepWin: number, roundWin: number): void;
    /** 啟用/禁用 Spin 按鈕 */
    enableSpin(enabled: boolean): void;
    /** 更新 Extra Bet 按鈕外觀 */
    updateExtraBetUI(): void;
    /** 更新閃電（Turbo）按鈕外觀 */
    updateTurboUI(): void;
    /** FREE 字母亮燈（依 rows 數量決定幾個亮，fourthE 為觸發 Coin Toss 前的第四盞） */
    updateFreeLetters(rows: number, fourthE?: boolean): void;

    // ── Panels（Promise 式，等待玩家互動後 resolve）──────────
    /** 顯示 Buy Free Game 確認面板；玩家確認回傳 true，取消回傳 false */
    showBuyPanel(): Promise<boolean>;
    /** 顯示硬幣拋擲動畫；heads 回傳 true */
    showCoinToss(isFGContext: boolean, headsProb?: number): Promise<boolean>;
    /** 播放已決定結果的硬幣動畫（atomic spin 用，不含隨機） */
    playCoinToss(isFGContext: boolean, result: boolean): Promise<void>;
    /** 顯示 Total Win 統計面板，等待玩家關閉 */
    showTotalWin(amount: number): Promise<void>;
    /** 顯示雷霆祝福動畫，等待完成 */
    showThunderBlessing(): Promise<void>;

    // ── FG 倍率顯示 ───────────────────────────────────────────
    /** 顯示 FG 倍率條（高亮 activeIdx 級） */
    showFGBar(activeIdx: number): void;
    /** 隱藏 FG 倍率條 */
    hideFGBar(): void;
    /** 更新倍率條高亮（showFGBar 內部呼叫，也可獨立呼叫） */
    updateMultBar(activeIdx: number): void;

    // ── Auto Spin ─────────────────────────────────────────────
    /** 顯示旋轉次數選單 */
    showAutoSpinPanel(): void;
    /** 更新自動旋轉剩餘次數標籤（0 = 空字串, -1 = ∞） */
    updateAutoSpinLabel(count: number): void;

    // ── Deposit ───────────────────────────────────────────────
    /** 顯示儲值面板；resolve 時面板已關閉（儲值成功或取消） */
    showDepositPanel(): Promise<void>;
    /** 關閉儲值面板並 resolve 等待中的 promise */
    hideDepositPanel(): void;
}
