# EDD — Thunder Blessing Slot：工程設計文件（合併版）

**文件版本**：v4.1
**日期**：2026-03-27
**狀態**：Code Review 全部修復完成 ✅ | Phase 2 規劃中 📋
**參考**：GDD_Thunder_Blessing_Slot.md、Probability_Design.md

> **本文件整合兩份 EDD**（原 docs/EDD-refactor-architecture.md v3.0 + Code Review EDD）。
> Phase 1 → 1.5C 及 Code Review 全部 20 項修復均已完成。Phase 2 為下一步執行內容。

---

## 目錄

1. [目前進度總覽](#1-目前進度總覽)
2. [背景與動機](#2-背景與動機)
3. [技術棧與系統架構](#3-技術棧與系統架構)
4. [Phase 1：MVC + DI 重構（✅ 完成）](#4-phase-1mvc--di-重構-完成)
5. [Phase 1.5：錢包 DI + 配獎分佈（✅ 完成）](#5-phase-15錢包-di--配獎分佈-完成)
6. [Phase 1.5B：Buy FG 配獎優化（✅ 完成）](#6-phase-15bbuy-fg-配獎優化-完成)
7. [Phase 1.5C：CSPRNG 安全強化（✅ 完成）](#7-phase-15ccsprng-安全強化-完成)
8. [Code Review 發現與修復清單（✅ 全部完成）](#8-code-review-發現與修復清單-全部完成)
9. [Phase 2：Client-Server 架構（📋 規劃中）](#9-phase-2client-server-架構-規劃中)
10. [測試策略與覆蓋現況](#10-測試策略與覆蓋現況)
11. [CI/CD 整合](#11-cicd-整合)
12. [決策記錄](#12-決策記錄)
13. [不在本次範圍](#13-不在本次範圍)

---

## 1. 目前進度總覽

### 1-1. 各階段狀態

| 階段 | 內容 | 狀態 | 測試數 | 完成日期 |
|------|------|:----:|:------:|---------|
| Phase 1 | MVC + DI 重構（God Class 解體）| ✅ 完成 | 384 | 2026-03-21 |
| Phase 1.5 | IWalletService + 配獎分佈框架 + FG Bug Fix | ✅ 完成 | 464+ | 2026-03-25 |
| Phase 1.5B | Buy FG 配獎優化（20× 保底、Tier 分佈）| ✅ 完成 | 549 | 2026-03-25 |
| Phase 1.5C | CSPRNG 安全強化（消除所有 Math.random）| ✅ 完成 | 549+ | 2026-03-25 |
| Code Review | P0~P3 全部 20 項修復（CR-01 ~ CR-20）| ✅ 完成 | 862 | 2026-03-27 |
| Phase 2 | Client-Server 架構（1,000 人同時在線）| 📋 規劃中 | — | — |

### 1-2. 關鍵指標現況

| 指標 | 目標 | 現況 |
|------|:----:|:----:|
| GameBootstrap.ts 行數 | < 100 行 | ✅ 54 行（從 1,400+ 行） |
| Math.random() 生產使用 | 0 處 | ✅ 0 處（CSPRNG 覆蓋） |
| Main Game RTP | 97.5%±0.5% | ✅ 97.84% |
| Buy FG RTP | 97.5%±0.5% | ✅ 97.41% |
| Extra Bet RTP | 97.5%±0.5% | ✅ 97.44% |
| EB+BuyFG RTP | 97.5%±0.5% | ✅ 97.45% |
| 全域 gs singleton | 0 個直讀 | ✅ 已消除 |
| 測試全部通過 | 100% | ✅ 888 tests（快速套件）|

### 1-3. 待修復問題概覽（Code Review）

| 優先級 | 數量 | 典型問題 |
|--------|:----:|---------|
| P0（安全/正確性）| 4 | ✅ 全部完成（CR-01~CR-04）|
| P1（邏輯問題）| 6 | ✅ 全部完成（CR-05~CR-10）|
| P2（品質）| 6 | ✅ 全部完成（CR-11~CR-16）|
| P3（架構重構）| 4 | ✅ 全部完成（CR-17~CR-20）|

---

## 2. 背景與動機

### 2-1. 原始問題（Phase 1 前）

| 問題 | 嚴重度 | 影響 |
|------|--------|------|
| `GameBootstrap.ts` God Class（1,400+ 行）：流程 + UI + 金額全混 | 高 | 無法單元測試流程邏輯 |
| `gs` 全域 singleton，所有模組直接 `import { gs }` | 高 | 無法 mock、無法多 session |
| `gs.balance -= totalBet` 散落前端流程 | 高 | 改 server 版時金額驗證不可信 |
| `WinChecker.ts` 與 `SlotEngine.checkWins()` 邏輯重複 | 中 | 雙重維護，容易分歧 |
| `cascadeLoop/freeGameLoop` 強耦合 Cocos tween/await | 中 | Flow 邏輯無法在 Node.js 純跑測試 |
| `REEL_STRIP` module load 時執行隨機洗牌（副作用）| 低 | 每次 import 結果不同，seeded 測試不穩定 |

### 2-2. 需求驅動

| 需求 | 說明 |
|------|------|
| 改為 Server 版 | 機率計算移至後端，前端只做動畫渲染；帳號金額由後端授權 |
| 1,000 人同時在線 | 後端需無狀態橫向擴展；每個 spin 獨立 session |
| 可維護性 | 每個模組職責單一，可獨立測試與熱插拔替換 |
| 合規考量 | 線上博弈需後端驗證每局結果，防止客戶端篡改 |
| RTP 一致性 | 單機版與 Server 版使用同一份 `SlotEngine`，RTP 結果可重現驗證 |

---

## 3. 技術棧與系統架構

### 3-1. 技術棧

| 項目 | 說明 |
|------|------|
| **引擎** | Cocos Creator 3.8.0 |
| **語言** | TypeScript（ES2015 target，CommonJS modules）|
| **測試框架** | Jest 30.x + ts-jest 29.x |
| **RNG** | CSPRNG（Web Crypto API / Node.js crypto，Mulberry32 僅限測試）|
| **建置目標** | Web-Desktop（gh-pages 部署）|
| **架構模式** | Clean Architecture（Engine / State / UI 三層分離 + 依賴注入）|

### 3-2. 現行目錄結構（Phase 1.5C 後）

```
assets/scripts/
├── contracts/                    ← 6 個 Interface（Client/Server 共用合約）
│   ├── IAccountService.ts
│   ├── IEngineAdapter.ts
│   ├── IGameSession.ts
│   ├── IReelManager.ts
│   ├── IUIController.ts
│   ├── IWalletService.ts         ← Phase 1.5 新增
│   └── types.ts
│
├── core/                         ← 純 TS，零框架依賴
│   ├── GameSession.ts            ← 實作 IGameSession，替換全域 gs
│   └── GameFlowController.ts     ← 主遊戲流程（~500 行純邏輯）
│
├── services/                     ← 可替換業務層
│   ├── LocalAccountService.ts    ← 單機版帳戶
│   ├── LocalEngineAdapter.ts     ← 包裝 SlotEngine
│   ├── LocalWalletService.ts     ← Phase 1.5 新增（beginSpin/completeSpin）
│   └── RNGProvider.ts            ← Phase 1.5C 新增（CSPRNG factory）
│
├── components/                   ← Cocos Components（只做 View）
│   └── SceneBuilder.ts
│
├── SlotEngine.ts                 ← 機率核心（純 TS，CSPRNG 注入）
├── GameConfig.ts                 ← 常數（副作用已移除）
├── GameBootstrap.ts              ← 54 行（DI wiring only）
├── ReelManager.ts                ← 改用 IGameSession 注入
├── UIController.ts               ← 改用 IGameSession + IAccountService 注入
├── GameState.ts                  ← ⚠️ 舊版 global gs（已棄用，待清除）
└── ReelCellView.ts
```

### 3-3. 模組依賴關係圖

```
GameBootstrap（組裝）
    │
    ├─→ RNGProvider ─────────────────────────────────┐
    │                                               ↓
    ├─→ SlotEngine ←── GameConfig          UIController (rng 注入)
    │       ↑                                       │
    ├─→ LocalEngineAdapter ─────────────────────────→┤
    │                                               │
    ├─→ LocalWalletService                          │
    ├─→ LocalAccountService                         │
    ├─→ GameSession                                 │
    │       ↑                                       │
    └─→ GameFlowController ←────────────────────────┘
            │
            └─→ ReelManager (rng 注入)
```

### 3-4. 核心資料型別

```typescript
// 原子旋轉請求
interface SpinRequest {
    bet: number;            // 0.25 ~ 10.00
    mode: GameMode;         // 'main' | 'extraBet' | 'freeGame' | 'buyFG'
    currentGrid: SymType[][];
    marks: string[];        // 閃電標記，格式 "reel,row"（⚠️ 型別化待改進）
    currentRows: number;    // 3 ~ 6
    fgMultIndex: number;    // 0=×3, 1=×7, 2=×17, 3=×27, 4=×77
}

// 原子旋轉結果（引擎一次計算完整結果）
interface FullSpinOutcome {
    baseSpins: CascadeStep[];       // Phase A：cascade 步驟
    fgTriggered: boolean;
    entryCoinToss?: CoinTossOutcome;
    fgSpins: FGSpinResult[];        // Phase B：FG 鏈（若觸發）
    totalWin: number;
    maxWinCapped: boolean;
}

// 錢包交易（Phase 1.5）
interface SpinTx {
    txId: string;
    wagered: number;
    timestamp: number;
}
```

---

## 4. Phase 1：MVC + DI 重構（✅ 完成）

> **完成日期**：2026-03-21 | **新增測試**：+147（237 → 384）

### 4-1. 執行步驟與結果

| 步驟 | 內容 | 狀態 |
|------|------|:----:|
| 1-A | 合併 WinChecker 至 SlotEngine；刪除 WinChecker.ts | ✅ |
| 1-B | 移除 `REEL_STRIP` 洗牌副作用至 SlotEngine constructor | ✅ |
| 1-C | 新增 `contracts/` 全部 Interface | ✅ |
| 1-D | 新增 `GameSession.ts` + Unit Tests（29 tests） | ✅ |
| 1-E | 新增 `LocalAccountService.ts` + Unit Tests（15 tests） | ✅ |
| 1-F | 修改 `UIController`：改用注入 IGameSession + IAccountService | ✅ |
| 1-G | 修改 `ReelManager`：改用注入 IGameSession | ✅ |
| 1-H | 抽 `SceneBuilder`：從 GameBootstrap 搬出 buildScene 部分 | ✅ |
| 1-I | 新增 `LocalEngineAdapter.ts` + Unit（12）+ Integration Tests | ✅ |
| 1-J | 抽 `GameFlowController`：doSpin → cascadeLoop → freeGameLoop | ✅ |
| 1-K | 瘦身 `GameBootstrap.ts`（54 行，DI wiring only） | ✅ |
| 1-L | 新增 GameFlowController + AccountFlow Integration Tests | ✅ |
| 1-M | 更新 E2E Tests | ✅ |

### 4-2. 關鍵改善對比

| 指標 | 重構前 | 重構後 |
|------|--------|--------|
| `GameBootstrap.ts` 行數 | 1,400+ | **54 行（-96%）** |
| `import { gs }` 直讀模組數 | 3 | **0（消除）** |
| WinChecker 重複邏輯 | 2 份 | **1 份（統一）** |
| 可 Unit Test 的流程邏輯 | 0% | **100%（GameFlowController）** |
| 測試數量 | 237 | **384（+62%）** |

---

## 5. Phase 1.5：錢包 DI + 配獎分佈（✅ 完成）

> **完成日期**：2026-03-25 | **新增測試**：+80（384 → 464+）

### 5-1. IWalletService — 帳務安全設計

**問題**：原 debit()/credit() 在 cascade 動畫中逐步呼叫，斷線可能造成帳務不完整。

**解決**：帳務層（即時）與 UI 顯示層（跟隨動畫）分離。

```
Spin 流程時序：
1. wallet.beginSpin(wagered)      → 立即扣款，回傳 SpinTx
2. ui.setDisplayBalance(after)    → 顯示扣款後餘額
3. adapter.spin(req)              → 引擎計算完整結果
4. UI 動畫表演（純視覺，不動帳務）
   ├── cascade：ui.setDisplayBalance(start + accumWin)
   └── FG：同上
5. wallet.completeSpin(tx, win)   → 立即入帳
6. ui.setDisplayBalance(final)    → 同步最終餘額
```

### 5-2. FREE 字母亮燈 Bug 修正

**問題**：Cascade 展開到 MAX_ROWS 但 FG 未觸發時，第 4 個 "E" 仍亮起，玩家困惑。

```typescript
// 修正前（錯誤）
this._ui.updateFreeLetters(MAX_ROWS, true);  // 永遠亮第 4 盞

// 修正後（正確）
const fgWillTrigger = o.fgSpins.length > 0;
this._ui.updateFreeLetters(MAX_ROWS, fgWillTrigger);
```

### 5-3. 配獎分佈觀察（v3.0，100k spins）

| 模式 | RTP | 0獎比例 | 狀態 |
|------|:---:|:-------:|:----:|
| Main Game | 97.8% | 67.4% | ✅ 合理 |
| Buy FG | 98.7% | 0% | ✅ 正常 |
| Extra Bet | 96.4% | 70.3% | ⚠️（Phase 1.5B 改善）|

---

## 6. Phase 1.5B：Buy FG 配獎優化（✅ 完成）

> **完成日期**：2026-03-25 | **最終測試數**：549

### 6-1. 設計目標

- Buy FG 花 100× BET，至少回 20× BET（20% 保底）
- Tier 4（×77）到達率為 Main Game 的 **70 倍**
- 30,000× MAX WIN 在數學上可達
- RTP 控制在 97.5%±0.5%

### 6-2. 關鍵設計變更

```typescript
// GameConfig.ts 新增
export const BUY_FG_MIN_WIN_MULT = 20;               // 保底倍數
export const COIN_TOSS_HEADS_PROB_BUY = [0.35, 0.25, 0.15, 0.08]; // Buy FG 專屬 coin toss
export const BUY_FG_PAYOUT_SCALE = 1.87;             // (原 3.448，重新校準)
```

### 6-3. Tier 到達率對比

| Tier | 倍率 | Main Game | Buy FG | 倍率差 |
|------|:----:|:---------:|:------:|:------:|
| 0 | ×3 | 85.00% | 65.00% | 0.8× |
| 1 | ×7 | 13.50% | 26.25% | 1.9× |
| 2 | ×17 | 1.43% | 7.44% | 5.2× |
| 3 | ×27 | 0.07% | 1.21% | 16.4× |
| 4 | ×77 | 0.0015% | 0.105% | **70×** |

### 6-4. RTP 驗證結果（10 seeds × 50k–200k spins，2026-03-28）

| 模式 | PAYOUT_SCALE | RTP | 0-win% | 狀態 |
|------|:------------:|:---:|:-------:|:----:|
| Main Game | 1.000 | 97.84% | ~67% | ✅ |
| Buy FG | 0.995 | 97.41% | 0% | ✅ |
| Extra Bet | 2.75 | 97.44% | ~68% | ✅ |
| EB+BuyFG | 1.065 | 97.45% | 0% | ✅ |

**注意**：EB_PAYOUT_SCALE 從 2.64 更新至 2.75（修正實測 RTP 93.68% → 97.44%）。新增 EB_BUY_FG_PAYOUT_SCALE = 1.065 專用於 Extra Bet ON + Buy FG 模式。

---

## 7. Phase 1.5C：CSPRNG 安全強化（✅ 完成）

> **完成日期**：2026-03-25

### 7-1. 問題背景

審計發現 **5 處**不安全的 RNG 使用：

| 位置 | 問題 | 嚴重度 |
|------|------|:------:|
| `SlotEngine.ts` 建構子 | 預設 `Math.random`，生產機率決策全用它 | Critical |
| `ReelManager.ts` × 4 處 | 直接呼叫 `Math.random()` | High |
| `UIController.ts` coin toss fallback | `Math.random()` 作為 else 分支 | High |
| `SlotEngine.ts` `_sharedEngine` | 用 `Math.random` 初始化共用引擎 | Medium |
| `GameConfig.ts` 註解 | 文件建議用 `Math.random()` 取樣 | Low |

### 7-2. 統一 RNG Provider 架構

```
┌───────────────────────────────────────────────┐
│               RNGProvider                      │
│  Production:  crypto.getRandomValues()         │
│  Node.js:     crypto.randomBytes()             │
│  Test:        mulberry32(seed) — 可注入        │
│                                                │
│  規則：                                        │
│  ① 全域唯一實例，GameBootstrap 建立後注入      │
│  ② 任何模組禁止自行呼叫 Math.random()          │
│  ③ Production 不接受外部 seed                  │
└───────────────────────────────────────────────┘
```

### 7-3. 五項安全原則

| 原則 | Phase 1.5C 前 | Phase 1.5C 後 |
|------|:------------:|:------------:|
| RNG 與機率模型分離 | ✅ | ✅ |
| RNG 不接受外部 seed | ✅ | ✅ |
| 上線與模擬完全隔離 | ❌ | ✅ |
| 不做 RTP 動態修正 | ✅ | ✅ |
| 用系統 entropy | ❌ | ✅ |

---

## 8. Code Review 發現與修復清單（✅ 全部完成）

> 基於 2026-03-27 Code Review，全部 20 項（CR-01~CR-20）均已修復並通過測試。
> 最終測試結果：**862 tests，0 失敗**（快速套件，排除 Monte Carlo 長跑測試）。

### 8-1. P0 — 立即修復（安全性 / 正確性）

| # | 位置 | 問題 | 修復方案 |
|---|------|------|---------|
| CR-01 | `UIController.ts:96` `ReelManager.ts:38` | RNG 未注入時降級為 `Math.random()`（Phase 1.5C 遺漏）| `rng ?? (() => { throw new Error('RNG not injected'); })` |
| CR-02 | `SlotEngine.ts:558-559` | 全域 `_sharedEngine` 使用 `() => 0` Dummy RNG | 將 `checkWins()` 重構為靜態純函式，不依賴引擎實例 |
| CR-03 | `GameFlowController.ts:139` | Auto Spin 遞迴呼叫 `doSpin()` 未 `await`，靠 `busy=true` 僥倖防重入 | 改為顯式 async 狀態機（task queue 或 while loop）|
| CR-04 | `GameFlowController.ts:109` | 餘額快照在 cascade 前取一次，多步 cascade 期間顯示過時餘額 | 每步 cascade 即時查詢 `wallet.getBalance()` |

### 8-2. P1 — 儘快修復（邏輯問題）

| # | 位置 | 問題 | 修復方案 |
|---|------|------|---------|
| CR-05 | `LocalEngineAdapter.ts:16` | `fgMultIndex` 越界時靜默回退 `?? 1`，掩蓋 bug | `if (idx < 0 \|\| idx >= FG_MULTIPLIERS.length) throw new RangeError(...)` |
| CR-06 | `GameSession.ts:14-16` | `LINES_BASE=25`、`LINES_MAX=57` 在本地重複定義 | `import { LINES_BASE, LINES_MAX } from '../GameConfig'` |
| CR-07 | `GameSession.ts:96` | `currentRows <= 3` 使用魔法數字 | 改為 `currentRows <= BASE_ROWS` |
| CR-08 | `SlotEngine.ts:230-238` | TB 第二擊雙重升級行為（`L1→P4` 再 `P4→P3`），缺乏說明 | 確認設計意圖並補充詳細注解 |
| CR-09 | `UIController.ts:268` | `COIN_TOSS_HEADS_PROB[fgMultIndex]` 無陣列長度驗證 | 加 runtime 斷言：`assert(idx < COIN_TOSS_HEADS_PROB.length)` |
| CR-10 | `GameFlowController.ts:310-313` | Max Win 提前結束 FG 無 UI 說明，玩家不知 FG 為何中止 | 增加「已達最高獎金！」提示說明 |

### 8-3. P2 — 品質改善

| # | 位置 | 問題 | 建議 |
|---|------|------|------|
| CR-11 | `GameState.ts:58` | `export const gs` 全域單例殘留（已由 GameSession 取代）| 標記 `@deprecated` 並計畫移除 |
| CR-12 | `RNGProvider.ts:31-33` | Node.js 路徑每次 RNG 呼叫觸發 `randomBytes(4)` syscall | 實作 entropy buffer（批次取 256 bytes）|
| CR-13 | `UIController.ts:152` | `Color.fromHEX()` 接受無驗證外部字串 | 加正規表達式驗證 `^#[0-9a-fA-F]{6}$` |
| CR-14 | 全域 | 閃電標記使用 `string` ("reel,row")，無型別安全 | `type CellKeyStr = \`${number},${number}\`` |
| CR-15 | `GameConfig.ts` | `PAYTABLE_SCALE=3.622` 等關鍵 RTP 參數無推導說明 | 補充校準過程注解，連結 Probability_Design.md |
| CR-16 | `ReelManager.ts` | Cloud mask 含魔法數字（`SYMBOL_H/2`、`SYMBOL_GAP/2`）| 提取為命名常數並加幾何說明 |

### 8-4. P3 — 架構重構（可與 Phase 2 並行）

| # | 問題 | 建議 |
|---|------|------|
| CR-17 | `ReelManager` 職責過重（cell 建立 / 位置計算 / 動畫 / 遮罩）| 拆分為 `CellPool`、`ReelAnimator`、`CloudMask` |
| CR-18 | `GameFlowController` 過長（500+ 行）| 拆出 `FGFlowController`、`AutoSpinController` |
| CR-19 | 浮點四捨五入策略分散（.toFixed(2) vs .toFixed(4)）| 建立 `money.ts` 統一貨幣運算 |
| CR-20 | 無全局錯誤日誌機制 | 引入輕量 logger（至少 console.error + context）|

### 8-5. Code Review 修復執行順序

```
第 1 輪（P0，1~2 天）：
  CR-01 → CR-02 → CR-03 → CR-04
  → 跑 npx jest，549 tests 全通過

第 2 輪（P1，1 天）：
  CR-05 → CR-06/07 → CR-08 → CR-09 → CR-10
  → 跑 npx jest，全通過

第 3 輪（P2/P3，視需要）：
  CR-11 ~ CR-20（可與 Phase 2 規劃並行）
```

---

## 9. Phase 2：Client-Server 架構（📋 規劃中）

> **前提**：Code Review P0/P1 修復完成後才開始 Phase 2。

### 9-1. 系統架構圖

```
┌────────────────────────────────────────┐
│         CLIENT (Cocos Web)              │
│  GameBootstrap                         │
│    └─ RemoteEngineAdapter → POST /spin  │
│    └─ RemoteAccountService → GET /balance│
│  GameFlowController / ReelManager / UI  │
│             ← 完全不動                 │
└──────────────────┬─────────────────────┘
                   │ HTTPS
┌──────────────────▼─────────────────────┐
│       Nginx Load Balancer               │
└────────┬─────────────────┬─────────────┘
         │                 │
┌────────▼──────┐  ┌───────▼────────┐
│ App Server #1  │  │ App Server #2   │  （可橫向擴展）
│ Node.js+Fastify│  │ Node.js+Fastify │
└────────┬──────┘  └───────┬────────┘
         └────────┬─────────┘
┌─────────────────▼──────────────────────┐
│     Redis Cluster（Hot Cache Layer）    │
│  balance:{uid}    TTL 5m               │
│  session:{uid}    TTL 30m              │
│  spin:lock:{uid}  TTL 30s              │
│  rate:{uid}       TTL 1s               │
└─────────────────┬──────────────────────┘
┌─────────────────▼──────────────────────┐
│   PostgreSQL（Source of Truth）         │
│  accounts / user_sessions / spin_audit_log │
└────────────────────────────────────────┘
```

### 9-2. 延遲目標

| 路徑 | p50 | p95 | p99 |
|------|:---:|:---:|:---:|
| 正常（Redis 命中）| < 30ms | < 100ms | < 300ms |
| 降級（Redis 故障）| < 150ms | < 500ms | < 1,000ms |

### 9-3. 前端改動（最小化）

Phase 1 完成後，前端只需新增兩個 Adapter：

```typescript
// services/RemoteEngineAdapter.ts
export class RemoteEngineAdapter implements IEngineAdapter {
    async spin(req: SpinRequest): Promise<SpinResponse> {
        const res = await fetch(`${this.baseUrl}/api/v1/spin`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${this.getToken()}` },
            body: JSON.stringify(req),
        });
        if (!res.ok) throw new SpinError(res.status, await res.json());
        return res.json();
    }
}

// GameBootstrap 切換 Server 版（只改兩行）
// 單機：new LocalEngineAdapter(new SlotEngine())
// Server：new RemoteEngineAdapter(API_URL, getAuthToken)
```

### 9-4. Spin Flow（後端）

```
① Redis spin:lock NX EX 30                    ~1ms
② Redis GET balance + session（pipeline）     ~1ms
   → miss → DB 穿透讀 → 回填 Redis
   → balance < bet → 402
③ engine.simulateSpin()                       ~5ms
④ DB atomicCredit（單一 round-trip）          ~15ms
   UPDATE accounts SET balance = balance + (win - bet)
   WHERE id = uid AND balance >= bet RETURNING balance
   → 0 rows → 402（餘額不足，授權失敗）
⑤ Redis SET balance + session（pipeline）     ~1ms
⑥ Audit queue enqueue（async）                ~0ms
⑦ Redis DEL spin:lock                         ~1ms
→ 回傳 SpinResponse（含 newBalance）
```

### 9-5. API 規格

#### POST /api/v1/spin

```json
// Request
{ "totalBet": 0.25, "extraBet": false, "inFreeGame": false, "fgMultIndex": 0, "marks": ["1,2"] }

// Response
{ "grid": [...], "cascadeSteps": [...], "totalWin": 1.25, "fgTriggered": false,
  "finalRows": 3, "maxWinCapped": false, "newMarks": ["0,1"], "newBalance": 998.75,
  "spinId": "spin_xyz789", "serverTime": 1742534400000 }
```

**Error Codes**：402 INSUFFICIENT_FUNDS / 401 UNAUTHORIZED / 429 RATE_LIMITED / 409 SESSION_CONFLICT

### 9-6. Redis 降級（Circuit Breaker）

```typescript
const redisBreaker = new CircuitBreaker(redisOperation, {
    timeout: 200, errorThresholdPct: 50, resetTimeout: 10000,
});
const cache = redisBreaker.opened
    ? new NullSpinCache(db)    // 降級：DB advisory lock
    : new RedisSpinCache(redis);
```

### 9-7. 1,000 人同時在線容量估算

| 指標 | 數值 |
|------|:----:|
| 同時在線 | 1,000 人 |
| 平均 spin 間隔 | 4 秒 |
| 峰值 RPS | 250 req/s |
| 安全目標 RPS | 500 req/s（2× buffer）|
| 單 spin 引擎時間 | < 5ms |

**資源配置**：Nginx + App Server × 3（4 core/8GB）+ Redis Cluster × 3 + PostgreSQL 主從

### 9-8. Phase 2 執行步驟

| 步驟 | 內容 | 估算工時 |
|------|------|:--------:|
| 2-A | RemoteEngineAdapter + RemoteAccountService | 1 天 |
| 2-B | 後端框架建立（Fastify + TypeScript + DI）| 1 天 |
| 2-C | SpinController + DB atomicCredit + Unit Tests | 2 天 |
| 2-D | ISpinCache + RedisSpinCache 實作 | 1.5 天 |
| 2-D' | NullSpinCache（DB fallback）+ Circuit Breaker | 1 天 |
| 2-E | 後端 Integration Tests | 2 天 |
| 2-F | E2E 跨層測試 | 1 天 |
| 2-G | k6 壓測（Scenario 1/2/4）+ 調優 | 2.5 天 |
| 2-H | RTP 一致性驗證（百萬 spin + Server parity）| 1 天 |
| 2-I | 部署配置（Nginx + PM2 / Docker Compose）| 1 天 |
| **合計** | | **14 天** |

### 9-9. CSPRNG 合規要求（Phase 2）

| 要求 | 說明 | 狀態 |
|------|------|:----:|
| Server CSPRNG only | 禁止 `Math.random`，使用 `crypto.randomBytes` | 📋 |
| Config 版本化 + Hash | 每次 spin audit log 記錄 config hash | 📋 |
| Release 附 Monte Carlo 報告 | 每版需附 2M+ spin RTP 報告 | 📋 |
| RTP 滾動視窗監控 | 即時監控 1K/10K/100K 局滾動 RTP | 📋 |
| GLI-11 / BMM 認證準備 | 第三方驗證流程 | 📋 |

---

## 10. 測試策略與覆蓋現況

### 10-1. 測試檔案清單

| 類別 | 檔案 | 數量 | 狀態 |
|------|------|:----:|:----:|
| Unit | SlotEngine、WinChecker、GameSession、AccountService、EngineAdapter、GameFlowController、BuyFG、FGMultiplier、FreeLetters、ProbabilityCore | ~210 | ✅ |
| Integration | SlotEngine、GameFlow、AccountFlow、BuyFG、FullGameRTP、BetLevelRTP、ThreeMode.rtp、WinDistribution、ModeRTPReport | ~110 | ✅ |
| E2E | GameFlow、FreeGameComplete、UIButtons、BuyFGAndLetters | ~80 | ✅ |
| 分析腳本 | MaxWin、WinDistribution、ThreeMode.parallel、BuyFG.calibrate、BuyFG.distribution、QuickRTP.check | — | ✅ |
| 安全 | CRNGAttack（12 向量，26 cases）| 26 | ✅ |
| **合計** | | **549+** | ✅ |

### 10-2. 三層測試規範

```
Unit Test     — 單一類別，所有外部依賴 mock；執行 < 100ms
Integration   — 兩個以上真實模組；mock 外部邊界（DB/HTTP/Cocos）；< 500ms
E2E           — 完整玩家行為；Phase 2 後接真實 HTTP
```

### 10-3. 缺少的測試（待補充）

| 測試類型 | 風險 | 優先級 |
|----------|------|:------:|
| `UIController` RNG 未注入 throw 路徑 | CR-01 修復後需覆蓋 | P0 |
| `checkWinsStatic` 靜態化後的邏輯 | CR-02 重構後需補測 | P0 |
| Auto Spin async 狀態機行為 | CR-03 修復後需驗序 | P0 |
| Max Win 提前結束 FG 的完整狀態重置 | CR-10 修復後需驗 | P1 |
| TB 二次命中機率統計分佈 | 雙重升階鏈特性未獨立驗 | P2 |
| `ReelManager` 動畫 schedule/unschedule | Race condition 難追蹤 | P2 |

### 10-4. 黃金規則

> 每個修復或新功能完成後執行 `npx jest --no-coverage`，**549+ tests 必須全部通過**。

---

## 11. CI/CD 整合

| 觸發時機 | 執行內容 | 時限 |
|---------|---------|:----:|
| 每次 Push | `npx jest --no-coverage --testPathIgnorePatterns=rtp` | < 5 分鐘 |
| 每日 Build | 全部 tests（含 RTP 百萬 spin）+ k6 200VU 3 分鐘 | < 30 分鐘 |
| Release 前 | k6 1,000VU 峰值壓測 + 上週 RTP audit | < 2 小時 |

---

## 12. 決策記錄

| 決策 | 選擇 | 理由 |
|------|------|------|
| Interface vs Abstract Class | Interface | 零 runtime overhead，易 mock |
| SlotEngine 共用方式 | 直接 import（同一 TS package）| Server/Client 跑完全相同機率邏輯，防分歧 |
| 後端框架 | Fastify（建議）| 比 Express 快 2-3×，TypeScript 友善 |
| Session 存儲 | Redis + PostgreSQL | Redis for locks/TTL，PostgreSQL for durable data |
| RNG at Server | `crypto.randomBytes` + seeded override for test | 禁止 `Math.random`；Server 不信任 client RNG |
| RNG Provider | 統一 `RNGProvider` 封裝 | 禁止散落的 `Math.random`；production CSPRNG / test mulberry32 |
| `gs` singleton 廢棄 | Phase 1 步驟 1-D 後漸進替換 | 減少 merge conflict 風險 |
| WinChecker 留存 | 刪除，統一用 SlotEngine | 避免邏輯分歧，對照組測試保留 |
| 壓測工具 | k6 | JS 腳本易寫，CI 整合，支援 threshold 斷言 |
| 配獎校準方式 | 配獎分佈模型（非全域 SCALE）| SCALE 模型影響所有 bracket 比例，精細控制體感用分佈模型 |

---

## 13. 不在本次範圍

- WebSocket 即時推播（多人榜單）
- 後端框架最終選型（Fastify / NestJS / Express 皆可適配）
- 資料庫 Schema 完整設計
- 帳號系統 / KYC / 合規文件
- 多語系 i18n
- 手機 App（Cocos Native）build

---

*文件版本：v4.0 | 更新日期：2026-03-27*
*整合來源：docs/EDD-refactor-architecture.md v3.0 + Code Review EDD（2026-03-27）*
*參考：GDD_Thunder_Blessing_Slot.md | Probability_Design.md*
