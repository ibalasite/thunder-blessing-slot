# EDD — Thunder Blessing Slot：工程設計文件（合併版）

**文件版本**：v5.0
**日期**：2026-03-28
**狀態**：Phase 1~1.5C + Code Review ✅ 全部完成 | Phase 2 完整設計 📐
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
9. [Phase 2：Client-Server 完整架構設計（📐 設計完成）](#9-phase-2client-server-完整架構設計)
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
| Phase 2 | Client-Server 架構（Fastify + K8s + Supabase）| ✅ 完成 | 10（K8s E2E）+ 11（RPA）| 2026-03-29 |

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

## 9. Phase 2：Client-Server 完整架構設計

> **前提**：✅ Phase 1~1.5C + Code Review 全部完成。本節為 Phase 2 完整設計規格，實作前確認無缺漏後方可開始。

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

## 9-A. 會員系統設計（Member System）

### 9-A-1. 功能範疇

| 功能 | 說明 |
|------|------|
| 註冊 | email + username + password（bcrypt 12 rounds）|
| 登入 | email + password → Access Token（15m）+ Refresh Token（7d）|
| Token 刷新 | Refresh Token → 新 Access Token |
| 登出 | 撤銷 Refresh Token，Blacklist Access Token |
| 角色 | `player`（預設）、`admin`、`auditor` |
| 裝置追蹤 | 每次登入記錄 user_agent + ip + 時間 |
| Rate Limit | 登入失敗 5 次/15 分鐘 → 暫時鎖定 |

### 9-A-2. JWT 設計

```typescript
// Access Token Payload（短效）
interface AccessTokenPayload {
    sub:    string;   // userId（BIGINT as string）
    role:   'player' | 'admin' | 'auditor';
    jti:    string;   // 唯一 JWT ID（UUID v4）
    iat:    number;
    exp:    number;   // 15 分鐘後
}

// Refresh Token（儲存於 DB user_sessions；傳輸僅走 HttpOnly Cookie）
interface RefreshTokenPayload {
    sub:      string;
    tokenId:  string;   // user_sessions.id（用於撤銷）
    exp:      number;   // 7 天後
}
```

**Token 撤銷機制**：
- Access Token：到期前加入 Redis blacklist（key: `blacklist:jti:{jti}`，TTL 對齊剩餘有效期）
- Refresh Token：DB `user_sessions.revoked_at` 設為 NOW()

**JWT Algorithm（S-06）**：
- Supabase Auth：RS256（預設，安全）
- CustomJWTAuthAdapter：HS256（`algorithms: ['HS256']` 白名單，拒絕 `alg: none`）
- `JWT_SECRET` 最短 32 字元（Zod env validation 強制）

**並發 Session 上限（S-07）**：每位用戶最多 5 個有效 session。新登入時若超過上限，自動撤銷最舊 session（LRU）。

**Refresh Token Cookie 規格**（HttpOnly，決策 #6）：

```
Set-Cookie: refresh_token={signed_jwt}; HttpOnly; Secure; SameSite=Strict; Path=/auth/refresh; Max-Age=604800
```

| 屬性 | 值 | 原因 |
|------|----|------|
| `HttpOnly` | ✅ | JS 無法讀取，防 XSS 竊取 |
| `Secure` | ✅ | 僅 HTTPS 傳輸 |
| `SameSite=Strict` | ✅ | 防 CSRF |
| `Path=/auth/refresh` | 限縮 | Cookie 只在 refresh endpoint 送出，其餘 API 不帶 |
| `Max-Age=604800` | 7 天 | 對齊 Refresh Token 效期 |

**Cocos 端注意**：Access Token 仍放 `Authorization: Bearer` header（JS 可操作），Refresh Token 由瀏覽器 Cookie 自動帶入，Cocos 程式碼無需儲存。

### 9-A-3. 密碼安全

| 要求 | 實作 |
|------|------|
| 儲存 | `bcrypt`（cost factor 12）|
| 最小長度 | 8 字元 |
| 強度規則 | 大小寫 + 數字 + 特殊字元各至少 1 個 |
| 重置 | Email 發送一次性 token（SHA-256，30 分鐘有效）|
| 傳輸 | HTTPS only，body 中傳遞，禁止 URL query |

---

## 9-B. 錢包系統設計（Wallet System）

### 9-B-1. 設計原則

| 原則 | 實作 |
|------|------|
| 帳本不可修改 | `wallet_transactions` 只能 INSERT，不可 UPDATE/DELETE |
| 原子性 | Spin 扣費 + 配獎在單一 DB transaction 內完成 |
| 冪等性 | deposit/withdraw 使用 `idempotency_key`（UUID），重複呼叫返回原始結果 |
| 餘額不為負 | DB CHECK constraint + 應用層雙重驗證 |
| 樂觀鎖 | `wallets.version` 防止並發餘額錯誤 |
| 審計追蹤 | 每筆 transaction 記錄 balance_before、balance_after |

### 9-B-2. Spin 扣費流程（原子）

```sql
-- 單一 DB round-trip（防止 TOCTOU race condition）
BEGIN;

-- 1. 鎖定並驗證餘額
SELECT id, balance, version
FROM wallets
WHERE user_id = $userId
FOR UPDATE;

-- 2. 若餘額不足 → ROLLBACK → 回傳 402

-- 3. 插入 spin_debit transaction
INSERT INTO wallet_transactions
  (wallet_id, type, amount, balance_before, balance_after, reference_id)
VALUES ($walletId, 'spin_debit', $wagered, $balance, $balance - $wagered, $spinId);

-- 4. 更新 wallet
UPDATE wallets
SET balance = balance - $wagered + $totalWin,
    version = version + 1,
    updated_at = NOW()
WHERE id = $walletId AND version = $currentVersion;
-- 0 rows → concurrent conflict → ROLLBACK → retry

-- 5. 插入 spin_credit transaction（若有贏分）
INSERT INTO wallet_transactions
  (wallet_id, type, amount, balance_before, balance_after, reference_id)
VALUES ($walletId, 'spin_credit', $totalWin, $balance - $wagered, $balance - $wagered + $totalWin, $spinId);

COMMIT;
```

### 9-B-3. 交易類型

| type | 觸發時機 | amount 定義 |
|------|---------|------------|
| `deposit` | 儲值 | 正數（儲值金額）|
| `withdraw` | 提款 | 正數（提款金額）|
| `spin_debit` | 每次下注 | 正數（wagered 金額）|
| `spin_credit` | 每次贏分 | 正數（totalWin 金額，0 時不建立）|
| `bonus` | 系統贈點 | 正數 |
| `adjustment` | 管理員手動調整 | 可正可負（metadata 記錄原因）|

### 9-B-4. 支付 DI 架構設計（Payment Provider DI）

#### 設計原則

Cocos 端採用 **IPaymentService 介面 + DI 注入**，與錢包解耦。Phase 2 注入 `MockPaymentService`，未來可無縫替換為真實支付商（ECPay、Stripe、Fireblocks 等），無需修改遊戲邏輯。

#### IPaymentService 介面（Cocos 端）

```typescript
// assets/scripts/services/IPaymentService.ts

export interface DepositResult {
    success:    boolean;
    paymentId:  string;     // 平台交易 ID（mock 時為 UUID）
    amount:     number;
    currency:   string;
    error?:     string;     // success=false 時附帶錯誤原因
}

export interface PaymentStatus {
    paymentId:  string;
    status:     'pending' | 'completed' | 'failed' | 'cancelled';
    amount?:    number;
}

export interface IPaymentService {
    /**
     * 展示支付頁面（popup / redirect），等待玩家操作完成。
     * 完成後呼叫 wallet API 將資金入帳。
     * @returns DepositResult — 玩家確認或取消均 resolve（success=false 代表取消）
     */
    requestDeposit(amount: number, currency?: string): Promise<DepositResult>;

    /**
     * 查詢支付狀態（輪詢或 webhook 完成後使用）
     */
    getPaymentStatus(paymentId: string): Promise<PaymentStatus>;
}
```

#### MockPaymentService（Phase 2 實作）

```typescript
// assets/scripts/services/MockPaymentService.ts

import { IPaymentService, DepositResult, PaymentStatus } from './IPaymentService';
import { WalletApiClient } from './WalletApiClient';

export class MockPaymentService implements IPaymentService {
    constructor(private walletApi: WalletApiClient) {}

    async requestDeposit(amount: number, currency = 'USD'): Promise<DepositResult> {
        // 1. 顯示假支付彈窗（Cocos Node prefab: MockPaymentPanel）
        const confirmed = await this._showMockPaymentUI(amount, currency);
        if (!confirmed) {
            return { success: false, paymentId: '', amount, currency, error: 'cancelled' };
        }

        // 2. 點擊「確認付款」後，直接呼叫 wallet deposit API
        const idempotencyKey = crypto.randomUUID();
        const paymentRef     = `mock-${idempotencyKey}`;

        const res = await this.walletApi.deposit({
            amount:         amount.toFixed(4),
            idempotencyKey,
            paymentRef,     // provider: 'mock' 標記
        });

        return {
            success:   true,
            paymentId: paymentRef,
            amount,
            currency,
        };
    }

    async getPaymentStatus(paymentId: string): Promise<PaymentStatus> {
        // Mock 永遠已完成
        return { paymentId, status: 'completed' };
    }

    private _showMockPaymentUI(amount: number, currency: string): Promise<boolean> {
        // 展示 Cocos prefab 彈窗，resolve(true) = 確認，resolve(false) = 取消
        return new Promise(resolve => {
            // MockPaymentPanel.show({ amount, currency, onConfirm: () => resolve(true), onCancel: () => resolve(false) })
        });
    }
}
```

#### 串接路徑

```
┌────────────────────────────────────────────────────────────────────────────┐
│  路徑 A：Cocos → Wallet API（直連，適合 Phase 2 純前端測試）               │
│                                                                            │
│  CocosUI                                                                   │
│    └── DepositController                                                   │
│          └── IPaymentService (DI)                                          │
│                └── MockPaymentService                                      │
│                      └── WalletApiClient → POST /wallet/deposit            │
│                                                  └── Server 驗 token →    │
│                                                      PostgreSQL wallet     │
└────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────┐
│  路徑 B：Cocos → Server → Wallet（適合真實支付商，webhook 回呼伺服器）      │
│                                                                            │
│  CocosUI                                                                   │
│    └── DepositController                                                   │
│          └── IPaymentService (DI)                                          │
│                └── StripePaymentService（未來）                             │
│                      ├── Stripe SDK → 開啟 Stripe Checkout 頁面            │
│                      └── Stripe Webhook → POST /payment/webhook (Server)   │
│                                                └── WalletService.deposit() │
│                                                    └── PostgreSQL wallet   │
└────────────────────────────────────────────────────────────────────────────┘
```

#### DI 注入點（GameBootstrap 或 SceneEntry）

```typescript
// assets/scripts/GameBootstrap.ts（Phase 2 注入）

const walletApi      = new WalletApiClient(SERVER_BASE_URL);
const paymentService = new MockPaymentService(walletApi);   // 換真實商：只改這一行

container.bind<IPaymentService>('IPaymentService').toConstantValue(paymentService);
```

#### 未來擴充（不需改遊戲邏輯）

| 支付商 | 實作類別 | 替換方式 |
|--------|---------|---------|
| 假購買（Phase 2）| `MockPaymentService` | 現在 |
| Stripe | `StripePaymentService` | 改 `GameBootstrap` 注入行 |
| ECPay（綠界）| `ECPayPaymentService` | 同上 |
| Web3 / Fireblocks | `CryptoPaymentService` | 同上 |

---

## 9-C. PostgreSQL DB Schema（完整 DDL）

```sql
-- ═══════════════════════════════════════════════════════
-- Extensions
-- ═══════════════════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- 模糊搜尋

-- ═══════════════════════════════════════════════════════
-- 1. 會員
-- ═══════════════════════════════════════════════════════
CREATE TABLE users (
    id              BIGSERIAL       PRIMARY KEY,
    username        VARCHAR(50)     NOT NULL UNIQUE,
    email           VARCHAR(255)    NOT NULL UNIQUE,
    password_hash   VARCHAR(72)     NOT NULL,  -- bcrypt output ≤ 72 bytes
    role            VARCHAR(20)     NOT NULL DEFAULT 'player'
                        CHECK (role IN ('player','admin','auditor')),
    status          VARCHAR(20)     NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','suspended','deleted')),
    login_fail_count INT            NOT NULL DEFAULT 0,
    locked_until    TIMESTAMPTZ,               -- NULL = 未鎖定
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════
-- 2. 登入 Session（Refresh Token 存儲）
-- ═══════════════════════════════════════════════════════
CREATE TABLE user_sessions (
    id              BIGSERIAL       PRIMARY KEY,
    user_id         BIGINT          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      CHAR(64)        NOT NULL UNIQUE,  -- SHA-256(refresh_token) hex
    user_agent      TEXT,
    ip_address      INET,
    expires_at      TIMESTAMPTZ     NOT NULL,
    revoked_at      TIMESTAMPTZ,                      -- NULL = 有效
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_user_sessions_user_id   ON user_sessions(user_id, expires_at);
CREATE INDEX idx_user_sessions_token     ON user_sessions(token_hash) WHERE revoked_at IS NULL;

-- ═══════════════════════════════════════════════════════
-- 3. 錢包
-- ═══════════════════════════════════════════════════════
CREATE TABLE wallets (
    id              BIGSERIAL       PRIMARY KEY,
    user_id         BIGINT          NOT NULL UNIQUE REFERENCES users(id),
    balance         NUMERIC(18,4)   NOT NULL DEFAULT 0 CHECK (balance >= 0),
    currency        CHAR(3)         NOT NULL DEFAULT 'USD'
                        CHECK (currency IN ('USD', 'TWD')),  -- S-11: 合法幣別白名單
    version         BIGINT          NOT NULL DEFAULT 0,  -- 樂觀鎖版本號
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════
-- 4. 錢包交易明細（不可修改帳本）
-- ═══════════════════════════════════════════════════════
CREATE TABLE wallet_transactions (
    id              BIGSERIAL       PRIMARY KEY,
    wallet_id       BIGINT          NOT NULL REFERENCES wallets(id),
    type            VARCHAR(20)     NOT NULL
                        CHECK (type IN ('deposit','withdraw','spin_debit','spin_credit','bonus','adjustment')),
    amount          NUMERIC(18,4)   NOT NULL,           -- 永遠為正數
    balance_before  NUMERIC(18,4)   NOT NULL,
    balance_after   NUMERIC(18,4)   NOT NULL,
    reference_id    VARCHAR(64),                        -- spin_id / payment_id
    idempotency_key VARCHAR(64)     UNIQUE,             -- deposit/withdraw 冪等鍵
    metadata        JSONB,                              -- 額外資訊
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_wallet_tx_wallet_id  ON wallet_transactions(wallet_id, created_at DESC);
CREATE INDEX idx_wallet_tx_ref        ON wallet_transactions(reference_id);
-- 禁止 UPDATE/DELETE（由 DB trigger 保護）
CREATE RULE wallet_tx_no_update AS ON UPDATE TO wallet_transactions DO INSTEAD NOTHING;
CREATE RULE wallet_tx_no_delete AS ON DELETE TO wallet_transactions DO INSTEAD NOTHING;

-- ═══════════════════════════════════════════════════════
-- 5. Spin 審計日誌（含完整重播資料，PARTITION BY YEAR）
-- 保留策略：2 年。每年一個 partition，舊 partition DETACH 後歸檔。
-- ═══════════════════════════════════════════════════════
CREATE TABLE spin_logs (
    id              BIGSERIAL,
    spin_id         UUID            NOT NULL DEFAULT gen_random_uuid(),

    -- 玩家資訊
    user_id         BIGINT          NOT NULL,   -- 不加 FK（partition table 限制）
    wallet_id       BIGINT          NOT NULL,

    -- Spin 參數
    mode            VARCHAR(20)     NOT NULL CHECK (mode IN ('main','extraBet','buyFG')),
    extra_bet_on    BOOLEAN         NOT NULL DEFAULT false,

    -- 幣別 & 正規化（§9-M）
    currency        CHAR(3)         NOT NULL DEFAULT 'USD',
    bet_level       INTEGER         NOT NULL CHECK (bet_level > 0),   -- 引擎 normalizedBet（整數）
    win_level       INTEGER         NOT NULL DEFAULT 0,                -- 引擎 win（betLevel 單位）
    base_unit       NUMERIC(18,8)   NOT NULL,                         -- 幣別 baseUnit（USD=0.01, TWD=1）
    player_bet      NUMERIC(18,4)   NOT NULL,                         -- bet_level × base_unit（玩家幣別）
    player_win      NUMERIC(18,4)   NOT NULL DEFAULT 0,               -- win_level × base_unit

    -- RNG 重播資料（§9-N-1 CryptoRNGProvider raw bytes）
    rng_bytes       BYTEA           NOT NULL,   -- CryptoRNGProvider.getSpinBytes() 輸出
    rng_byte_count  SMALLINT        NOT NULL,   -- bytes 長度（稽核用）

    -- 結果
    mode_payout_scale NUMERIC(8,4)  NOT NULL,
    fg_triggered    BOOLEAN         NOT NULL DEFAULT false,
    max_win_capped  BOOLEAN         NOT NULL DEFAULT false,

    -- 完整 Spin 結果 JSON（快速重播，無需重新計算）
    spin_outcome    JSONB           NOT NULL,   -- FullSpinOutcome 序列化

    -- 引擎設定快照（合規稽核）
    config_hash     CHAR(64)        NOT NULL,   -- SHA-256(GameConfig 關鍵常數)
    config_version  VARCHAR(30)     NOT NULL,   -- package.json version
    config_snapshot JSONB           NOT NULL,   -- PAYTABLE_SCALE、各 PAYOUT_SCALE 等

    -- 財務快照
    balance_before  NUMERIC(18,4)   NOT NULL,
    balance_after   NUMERIC(18,4)   NOT NULL,

    -- 客戶端資訊
    ip_address      INET,
    client_version  VARCHAR(20),
    server_version  VARCHAR(20),
    session_id      BIGINT,

    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    PRIMARY KEY (id, created_at),
    UNIQUE (spin_id, created_at)
) PARTITION BY RANGE (created_at);

-- 年度 partition（每年由 worker 或 migration 建立）
CREATE TABLE spin_logs_2026 PARTITION OF spin_logs
    FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
CREATE TABLE spin_logs_2027 PARTITION OF spin_logs
    FOR VALUES FROM ('2027-01-01') TO ('2028-01-01');

-- Index（每個 partition 繼承）
CREATE INDEX idx_spin_logs_user_created  ON spin_logs(user_id, created_at DESC);
CREATE INDEX idx_spin_logs_spin_id       ON spin_logs(spin_id);
CREATE INDEX idx_spin_logs_currency_rtp  ON spin_logs(currency, created_at DESC);   -- RTP 查詢

-- 禁止修改（RULE 需套在每個 partition）
CREATE RULE spin_logs_no_update AS ON UPDATE TO spin_logs DO INSTEAD NOTHING;
CREATE RULE spin_logs_no_delete AS ON DELETE TO spin_logs DO INSTEAD NOTHING;

-- ═══════════════════════════════════════════════════════
-- 6. 密碼重置 Token
-- ═══════════════════════════════════════════════════════
CREATE TABLE password_reset_tokens (
    id              BIGSERIAL       PRIMARY KEY,
    user_id         BIGINT          NOT NULL REFERENCES users(id),
    token_hash      CHAR(64)        NOT NULL UNIQUE,    -- SHA-256(token)
    expires_at      TIMESTAMPTZ     NOT NULL,
    used_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════
-- 7. RTP 告警記錄（§9-J #10）
-- ═══════════════════════════════════════════════════════
CREATE TABLE rtp_alerts (
    id              BIGSERIAL       PRIMARY KEY,
    currency        CHAR(3)         NOT NULL,
    window_size     INTEGER         NOT NULL,           -- 1000 | 10000 | 100000
    measured_rtp    NUMERIC(8,6)    NOT NULL,           -- e.g. 0.943210
    target_rtp      NUMERIC(8,6)    NOT NULL DEFAULT 0.975,
    deviation       NUMERIC(8,6)    NOT NULL,           -- measured - target
    threshold       NUMERIC(8,6)    NOT NULL DEFAULT 0.02,
    sample_from     TIMESTAMPTZ     NOT NULL,
    sample_to       TIMESTAMPTZ     NOT NULL,
    resolved_at     TIMESTAMPTZ,                        -- NULL = 尚未確認
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_rtp_alerts_unresolved ON rtp_alerts(created_at DESC) WHERE resolved_at IS NULL;

-- ═══════════════════════════════════════════════════════
-- 8. 錯誤日誌（§9-J #14）
-- ═══════════════════════════════════════════════════════
CREATE TABLE error_logs (
    id              BIGSERIAL       PRIMARY KEY,
    error_code      VARCHAR(50)     NOT NULL,           -- e.g. 'WALLET_NOT_FOUND'
    http_status     SMALLINT,
    message         TEXT            NOT NULL,
    stack           TEXT,                               -- stack trace（production 可選關）
    user_id         BIGINT,                             -- 若有登入
    spin_id         UUID,                               -- 若發生在 spin 中
    request_path    VARCHAR(255),
    request_id      VARCHAR(64),                        -- X-Request-ID header
    metadata        JSONB,                              -- 額外 context
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_error_logs_code    ON error_logs(error_code, created_at DESC);
CREATE INDEX idx_error_logs_user    ON error_logs(user_id, created_at DESC);
CREATE INDEX idx_error_logs_recent  ON error_logs(created_at DESC);

-- ═══════════════════════════════════════════════════════
-- 9. 每日 RTP 統計報表（Worker 每日產生）
-- ═══════════════════════════════════════════════════════
CREATE TABLE rtp_daily_reports (
    id              BIGSERIAL       PRIMARY KEY,
    report_date     DATE            NOT NULL,
    currency        CHAR(3)         NOT NULL,
    mode            VARCHAR(20)     NOT NULL CHECK (mode IN ('main','extraBet','buyFG','all')),
    total_spins     BIGINT          NOT NULL DEFAULT 0,
    total_bet_level BIGINT          NOT NULL DEFAULT 0,   -- Σbet_level（引擎單位）
    total_win_level BIGINT          NOT NULL DEFAULT 0,   -- Σwin_level（引擎單位）
    rtp             NUMERIC(8,6)    NOT NULL,              -- total_win_level / total_bet_level
    fg_trigger_rate NUMERIC(8,6),
    avg_bet_level   NUMERIC(10,2),
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    UNIQUE (report_date, currency, mode)
);
CREATE INDEX idx_rtp_daily_date ON rtp_daily_reports(report_date DESC, currency);
```

---

## 9-D. Spin Log 與重播設計（Replay System）

### 9-D-1. 設計目標

| 目標 | 說明 |
|------|------|
| 任意一把可重播 | 前端可請求重播任一 `spin_id` 的動畫 |
| 稽核可驗證 | 稽核員可用 `rng_seed` + `config_snapshot` 重跑引擎，驗證結果一致 |
| 即時回傳 | 重播直接回傳 `spin_outcome` JSON，不重新計算 |
| 防偽造 | `config_hash` 確認當時引擎設定未被篡改 |

### 9-D-2. RNG Seed 設計

```typescript
// 每次 Spin 生成獨立 seed（非連續 stream，更安全）
async function generateSpinSeed(): Promise<{ seed: Buffer; sequence: bigint }> {
    const seed = crypto.randomBytes(32);       // 256-bit CSPRNG seed
    const sequence = await redis.incr('rng:global:sequence');  // 全域遞增序號
    return { seed, sequence: BigInt(sequence) };
}

// 建立可重現的 seeded RNG（mulberry32-like from 256-bit seed）
function seededRNGFromBuffer(seed: Buffer): () => number {
    const view = new DataView(seed.buffer);
    let state = [
        view.getUint32(0), view.getUint32(4),
        view.getUint32(8), view.getUint32(12),
    ];
    // xoshiro128** PRNG（統計品質優於 mulberry32）
    return () => {
        const result = Math.imul(rotl(Math.imul(state[1], 5), 7), 9);
        const t = state[1] << 9;
        state[2] ^= state[0]; state[3] ^= state[1];
        state[1] ^= state[2]; state[0] ^= state[3];
        state[2] ^= t; state[3] = rotl(state[3], 11);
        return (result >>> 0) / 0x100000000;
    };
}
```

### 9-D-3. Config Hash 計算

```typescript
// 每次 Server 啟動時計算，快取於 Redis
function computeConfigHash(): string {
    const snapshot = {
        PAYTABLE_SCALE, BUY_FG_PAYOUT_SCALE, EB_PAYOUT_SCALE,
        EB_BUY_FG_PAYOUT_SCALE, FG_TRIGGER_PROB, BUY_COST_MULT,
        EXTRA_BET_MULT, MAX_WIN_MULT, BUY_FG_MIN_WIN_MULT,
        FG_MULTIPLIERS, COIN_TOSS_HEADS_PROB,
        ENTRY_TOSS_PROB_MAIN, ENTRY_TOSS_PROB_BUY,
        SYMBOL_WEIGHTS, SYMBOL_WEIGHTS_EB, SYMBOL_WEIGHTS_FG, SYMBOL_WEIGHTS_BUY_FG,
    };
    return crypto.createHash('sha256')
        .update(JSON.stringify(snapshot, Object.keys(snapshot).sort()))
        .digest('hex');
}
```

### 9-D-4. Replay 流程

```
GET /api/v1/game/spin/:spinId/replay
            │
            ├── 從 spin_logs 讀取 spin_outcome（JSONB）
            │
            ├── [快速模式] 直接回傳 spin_outcome → 前端播動畫
            │
            └── [稽核模式] ?verify=true
                    ├── 用 rng_seed 重建 seededRNG
                    ├── 重跑 engine.computeFullSpin(...)
                    ├── 比對 totalWin / fgTriggered / cascadeSteps
                    ├── 比對 config_hash（驗證設定未變）
                    └── 回傳 { match: true/false, divergence: [...] }
```

---

## 9-E. 完整 REST API 設計

### 9-E-1. 全域規格

```
Base URL:       https://api.thunder-slot.com/api/v1
Auth:           Authorization: Bearer {accessToken}
Content-Type:   application/json
版本控制:        URL path（/v1/、/v2/）
速率限制 Header: X-RateLimit-Limit / X-RateLimit-Remaining / X-RateLimit-Reset
```

**統一錯誤格式**：

```typescript
interface APIError {
    code:    string;   // 'INSUFFICIENT_FUNDS' | 'UNAUTHORIZED' | ...
    message: string;   // 人類可讀說明
    details?: unknown; // 額外資訊（驗證錯誤欄位等）
}
```

### 9-E-2. 認證 API

#### POST /auth/register
```typescript
// Request
interface RegisterRequest {
    username: string;  // 3-50 chars, alphanumeric + underscore
    email:    string;  // valid email
    password: string;  // min 8 chars
}
// Response 201
interface RegisterResponse {
    userId:   string;
    username: string;
    email:    string;
    createdAt: string;  // ISO8601
}
// Errors: 409 EMAIL_TAKEN / 409 USERNAME_TAKEN / 422 VALIDATION_ERROR
```

#### POST /auth/login
```typescript
// Request
interface LoginRequest {
    email:    string;
    password: string;
    deviceInfo?: { userAgent: string };
}
// Response 200  (refreshToken 不在 body，由 Set-Cookie header 傳送)
interface LoginResponse {
    accessToken: string;   // JWT，15m；前端存 memory（非 localStorage）
    expiresIn:   number;   // 900（秒）
    user: { id: string; username: string; role: string; }
}
// Response Header: Set-Cookie: refresh_token=...; HttpOnly; Secure; SameSite=Strict; Path=/auth/refresh; Max-Age=604800
// Errors: 401 INVALID_CREDENTIALS / 423 ACCOUNT_LOCKED / 429 RATE_LIMITED
```

#### POST /auth/refresh
```typescript
// Request：無 body，refresh_token 由瀏覽器自動從 HttpOnly Cookie 帶入
// Response 200
interface RefreshResponse {
    accessToken: string;   // 新 Access Token
    expiresIn:   900;
}
// Response Header: Set-Cookie: refresh_token=...（輪換：新 token 覆蓋舊 Cookie）
// Errors: 401 INVALID_REFRESH_TOKEN / 401 REFRESH_TOKEN_EXPIRED
// Token Rotation：舊 Refresh Token 立即撤銷（revoked_at），換發新 token
```

#### DELETE /auth/logout
```typescript
// Header: Authorization: Bearer {accessToken}
// Request：無 body，refresh_token 從 Cookie 讀取
// Response 204 No Content
// Response Header: Set-Cookie: refresh_token=; HttpOnly; Max-Age=0  （清除 Cookie）
// 動作：撤銷 refreshToken（DB revoked_at）+ jti 加入 Redis blacklist
```

#### POST /auth/password/forgot
```typescript
interface ForgotPasswordRequest { email: string; }
// Response 200（無論 email 是否存在，避免 email enumeration）
```

#### POST /auth/password/reset
```typescript
interface ResetPasswordRequest { token: string; newPassword: string; }
// Errors: 400 INVALID_TOKEN / 400 TOKEN_EXPIRED
```

### 9-E-3. 錢包 API

#### GET /wallet
```typescript
// Auth: player
// Response 200
interface WalletResponse {
    userId:    string;
    balance:   string;   // NUMERIC → string 避免 JS float 精度
    currency:  string;   // 'USD'
    updatedAt: string;
}
```

#### POST /wallet/deposit
```typescript
// Auth: player
interface DepositRequest {
    amount:         string;   // 正數字串，最多 4 位小數
    idempotencyKey: string;   // UUID v4，客戶端生成
    provider?:      string;   // 支付商識別 'mock' | 'stripe' | 'ecpay'（預設 'mock'）
    paymentRef?:    string;   // 支付平台交易號（mock 時為 'mock-{uuid}'）
}
// Response 200
interface DepositResponse {
    transactionId: string;
    balanceAfter:  string;
    provider:      string;
    createdAt:     string;
}
// Errors: 400 INVALID_AMOUNT / 409 IDEMPOTENCY_CONFLICT（金額不符）
// 冪等：同 key 重複呼叫返回原始結果
// Server 端驗 provider='mock' 時跳過外部 webhook 驗證，直接入帳
```

#### POST /wallet/withdraw
```typescript
interface WithdrawRequest {
    amount:         string;
    idempotencyKey: string;
}
// Response 200
interface WithdrawResponse { transactionId: string; balanceAfter: string; }
// Errors: 402 INSUFFICIENT_FUNDS / 400 AMOUNT_TOO_SMALL（最低提款限額）
```

#### GET /wallet/transactions
```typescript
// Query: ?limit=20&cursor={base64_cursor}&type=spin_debit
// Response 200
interface TransactionListResponse {
    items: TransactionItem[];
    nextCursor: string | null;   // null = 無更多資料
}
interface TransactionItem {
    id:            string;
    type:          string;
    amount:        string;
    balanceBefore: string;
    balanceAfter:  string;
    referenceId:   string | null;
    createdAt:     string;
}
```

### 9-E-4. 遊戲 API

#### POST /game/spin  ⭐ 核心 API
```typescript
// Auth: player
interface SpinRequest {
    mode:        'main' | 'extraBet' | 'buyFG';
    totalBet:    number;   // 0.01 ~ 100.00
    extraBetOn?: boolean;  // buyFG 時可附加 SC 保證
}
// Response 200
interface SpinResponse {
    spinId:       string;   // UUID
    outcome:      FullSpinOutcome;  // 完整引擎結果（含 baseSpins、fgSpins 等）
    balanceBefore: string;
    balanceAfter:  string;
    serverTime:    number;  // Unix ms
}
// Errors:
// 402 INSUFFICIENT_FUNDS
// 409 SPIN_IN_PROGRESS（同用戶並發 spin）
// 429 RATE_LIMITED（超過 5 spin/s）
// 400 INVALID_BET_AMOUNT
// 503 SERVICE_UNAVAILABLE（DB 或 Redis 不可用）
```

#### GET /game/spin/:spinId
```typescript
// Auth: player（只能查自己的）或 admin
// Response 200
interface SpinDetailResponse {
    spinId:     string;
    mode:       string;
    extraBetOn: boolean;
    totalBet:   string;
    wagered:    string;
    totalWin:   string;
    outcome:    FullSpinOutcome;
    createdAt:  string;
}
```

#### GET /game/spin/:spinId/replay
```typescript
// Auth: player（只能重播自己的）或 admin
// Query: ?verify=false
// Response 200
interface ReplayResponse {
    spinId:   string;
    outcome:  FullSpinOutcome;   // 直接從 spin_logs 讀取
    verify?:  {                  // 僅 verify=true 時
        match:       boolean;
        configMatch: boolean;
        divergence:  string[];   // 不一致的欄位清單
    };
}
```

#### GET /game/history
```typescript
// Auth: player
// Query: ?limit=20&cursor=xxx&mode=buyFG
// Response 200
interface GameHistoryResponse {
    items: GameHistoryItem[];
    nextCursor: string | null;
}
interface GameHistoryItem {
    spinId:      string;
    mode:        string;
    totalBet:    string;
    wagered:     string;
    totalWin:    string;
    fgTriggered: boolean;
    createdAt:   string;
}
```

### 9-E-5. 管理員 API

#### GET /admin/rtp-report
```typescript
// Auth: admin | auditor
// Query: ?from=2026-01-01&to=2026-03-31&mode=all&userId=xxx
// Response 200
interface RTPReportResponse {
    period:    { from: string; to: string; };
    totalSpins: number;
    totalWagered: string;
    totalWin:     string;
    rtp:          string;   // e.g. "97.45"
    byMode: {
        main:    { spins: number; wagered: string; win: string; rtp: string; };
        extraBet: { ... };
        buyFG:    { ... };
        ebBuyFG:  { ... };
    };
    rollingRTP: {
        last1k:  string;
        last10k: string;
        last100k: string;
    };
}
```

#### GET /admin/spin/:spinId
```typescript
// Auth: admin | auditor
// Response 200（含 rng_seed hex + config_snapshot）
interface AdminSpinDetailResponse extends SpinDetailResponse {
    userId:          string;
    walletId:        string;
    rngSeedHex:      string;    // 供稽核重播
    rngSequence:     string;
    configHash:      string;
    configSnapshot:  Record<string, unknown>;
    balanceBefore:   string;
    balanceAfter:    string;
    ipAddress:       string;
}
```

#### GET /admin/users
```typescript
// Auth: admin
// Query: ?page=1&limit=50&search=username
// Response 200
interface UserListResponse {
    items: UserItem[];
    total: number;
    page:  number;
}
```

#### POST /admin/wallet/adjust
```typescript
// Auth: admin
interface WalletAdjustRequest {
    userId:  string;
    amount:  string;   // 可為負數
    reason:  string;   // 必填，記入 metadata
    idempotencyKey: string;
}
```

#### GET /admin/config/hash
```typescript
// Auth: admin | auditor
// Response 200: { hash: string; version: string; computedAt: string; }
// 用於驗證當前引擎設定是否與審計記錄吻合
```

---

## 9-F. Redis Cache Schema（完整）

```
┌────────────────────────────────────────────────────────────────┐
│  Key Pattern                  │ Value Type │ TTL    │ 用途      │
├───────────────────────────────┼────────────┼────────┼──────────┤
│ wallet:balance:{userId}       │ String     │  5m    │ 餘額快取  │
│ session:{tokenHash}           │ JSON String│ 15m    │ JWT 驗證  │
│ blacklist:jti:{jti}           │ 1          │ 動態*  │ Token 黑名單│
│ spin:lock:{userId}            │ 1 (NX)     │ 30s    │ 防並發 Spin│
│ rate:spin:{userId}            │ Counter    │  1s    │ 5 spin/s 限制│
│ rate:auth:{ip}                │ Counter    │ 60s    │ 10 auth/min（IP level）│
│ rate:auth:email:{hash}        │ Counter    │ 60s    │ 10 auth/min（email level，S-10 補 IP 繞過）│
│ rate:fail:{email}             │ Counter    │ 15m    │ 5 次失敗鎖定│
│ bet-range:{currency}          │ JSON       │ 1h     │ BetRange 機率包 cache │
│ prob:config:version           │ String     │ 24h    │ 機率包設定版本（invalidate 用）│
│ rtp:global:1k:{currency}      │ JSON       │ 1d     │ 滾動 1K RTP（per currency）│
│ rtp:global:10k:{currency}     │ JSON       │ 3d     │ 滾動 10K RTP│
│ rtp:global:100k:{currency}    │ JSON       │ 7d     │ 滾動 100K RTP│
│ rtp:user:{userId}:daily       │ JSON       │ 1d     │ 個人每日 RTP（level 單位）│
│ leaderboard:win:daily         │ Sorted Set │ 1d     │ 日榜贏分   │
└───────────────────────────────┴────────────┴────────┴──────────┘
* blacklist:jti TTL = (token exp - now)
** bet-range cache miss → IProbabilityProvider.getBetRange() → refill
** 機率包設定變更時呼叫 BetRangeService.invalidateBetRange() 主動清除
```

**Redis Pipeline 最佳化（Spin 流程）**：

```typescript
// ① 一次 pipeline 讀取（1 RTT）
const [balance, sessionData, lockExists] = await redis.pipeline()
    .get(`wallet:balance:${userId}`)
    .get(`session:${tokenHash}`)
    .exists(`spin:lock:${userId}`)
    .exec();

// ② 一次 pipeline 寫入（1 RTT）
await redis.pipeline()
    .set(`wallet:balance:${userId}`, newBalance.toString(), 'EX', 300)
    .del(`spin:lock:${userId}`)
    .zadd('leaderboard:win:daily', totalWin, userId)
    .exec();
```

**Rolling RTP 結構**（JSONB in Redis，以 betLevel 單位計，幣別無關）：
```typescript
interface RollingRTPEntry {
    windowSize: number;         // 1000 | 10000 | 100000
    currency:   string;         // 'USD' | 'TWD'（各幣別獨立統計）
    spins:      number;         // 已計入樣本數
    wagered:    number;         // Σbet_level（整數，引擎單位）
    returned:   number;         // Σwin_level（整數，引擎單位）
    rtp:        number;         // returned / wagered（幣別無關）
    updatedAt:  number;         // Unix ms
}
```

---

## 9-G. 伺服器端測試設計（Server-side Tests）

### 9-G-1. 後端 Unit Tests

**SpinController**（`tests/server/unit/SpinController.test.ts`）：

| 測試案例 | 驗證點 |
|---------|--------|
| 正常 spin（main 模式）| outcome 正確、balance 扣除 wagered + 補 totalWin |
| spin 中 balance 不足 | 回傳 402，DB 無 transaction 記錄 |
| 並發 spin（同用戶）| 第二個 spin 收到 409 SPIN_IN_PROGRESS |
| spin:lock 超時自動釋放 | lock 30s 後消失，可再 spin |
| extraBetOn + buyFG | modePayoutScale = EB_BUY_FG_PAYOUT_SCALE |
| maxWin 封頂 | totalWin = MAX_WIN_MULT × totalBet |
| spin_logs 完整性 | spin_outcome / rng_seed / config_hash 正確儲存 |
| Rate limit 觸發 | 第 6 個 req/s 收到 429 |

**AuthService**（`tests/server/unit/AuthService.test.ts`）：

| 測試案例 | 驗證點 |
|---------|--------|
| 正常登入 | 回傳 accessToken + refreshToken |
| 密碼錯誤 5 次 | 第 5 次後 account locked，DB locked_until 設定 |
| Refresh Token 使用後輪換 | 舊 token 撤銷，新 token 有效 |
| 撤銷的 refreshToken 登入 | 401 INVALID_REFRESH_TOKEN |
| Access Token blacklist | jti 在 Redis blacklist 後回傳 401 |
| 過期 accessToken | 401 TOKEN_EXPIRED |

**WalletService**（`tests/server/unit/WalletService.test.ts`）：

| 測試案例 | 驗證點 |
|---------|--------|
| deposit 正常 | balance 增加、transaction 記錄正確 |
| deposit 冪等 | 同 idempotency_key 重複呼叫返回原始結果 |
| withdraw 餘額不足 | 402，balance 不變 |
| 樂觀鎖 version 衝突 | 自動 retry 最多 3 次 |
| spin debit+credit 原子 | DB rollback 後 balance 不變、無 transaction 記錄 |

**ReplayService**（`tests/server/unit/ReplayService.test.ts`）：

| 測試案例 | 驗證點 |
|---------|--------|
| 快速重播（verify=false）| 回傳 spin_outcome，不呼叫引擎 |
| 稽核重播（verify=true）| 重跑引擎，match=true |
| config 被修改後重播 | configMatch=false，divergence 列出差異 |
| rng_seed 重現 | 相同 seed 產生完全相同 FullSpinOutcome |

### 9-G-2. 後端 Integration Tests（需 TestContainers）

**Setup**：
```typescript
// jest.setup.ts
import { GenericContainer, PostgreSqlContainer, Wait } from 'testcontainers';

beforeAll(async () => {
    pgContainer   = await new PostgreSqlContainer().start();
    redisContainer = await new GenericContainer('redis:7').start();
    await runMigrations(pgContainer.getConnectionUri());
    app = await buildApp({ db: pgContainer.getConnectionUri(), redis: redisContainer });
});
```

**測試案例**（`tests/server/integration/`）：

| 檔案 | 測試場景 |
|------|---------|
| `spin.integration.test.ts` | 完整 spin flow（真實 DB + Redis）；並發防護；rate limit；balance 驗證 |
| `auth.integration.test.ts` | 註冊→登入→refresh→logout；token 黑名單；鎖定流程 |
| `wallet.integration.test.ts` | deposit→spin→withdraw；冪等性；樂觀鎖競爭 |
| `replay.integration.test.ts` | spin→replay；verify 模式；config 變更後 configMatch=false |
| `rtp.integration.test.ts` | 1000 次 server spin → 驗證 RTP 95%~100%（縮短版） |

### 9-G-3. E2E Tests（完整 HTTP 流）

**測試案例**（`tests/server/e2e/`）：

| 場景 | 步驟 |
|------|------|
| 完整玩家旅程 | 註冊 → 登入 → deposit(100) → spin×5 → 查 history → withdraw → 驗 balance |
| Free Game 流程 | spin 直到 FG 觸發 → 驗 fgSpins 完整 → 查 spin_log FG 欄位 |
| Buy FG 流程 | 餘額 ≥ 100×bet → POST spin(buyFG) → 驗 FG 保證進場 → 查 spin_log |
| EB+BuyFG 流程 | spin(buyFG, extraBetOn=true) → 驗 modePayoutScale=1.065 → SC 保證存在 |
| Replay 驗證 | spin → GET /spin/:id/replay?verify=true → match=true |
| 並發防護 E2E | 同一 JWT 同時送 2 個 spin → 1 個 409 |
| 餘額耗盡 | balance=1，bet=1 → spin 成功 → balance≥0 → 再 spin → 402 |
| Admin RTP 報告 | admin 登入 → 100 次 spin → GET /admin/rtp-report → rtp 在合理範圍 |

### 9-G-4. 壓力測試（k6）

**Scenario 1：一般負載**（`tests/load/normal.k6.js`）
```javascript
export const options = {
    vus: 200, duration: '3m',
    thresholds: {
        http_req_duration: ['p95<300'],
        http_req_failed:   ['rate<0.01'],
    },
};
// 流程：login → spin × N → logout（模擬真實玩家行為）
```

**Scenario 2：峰值負載**（`tests/load/peak.k6.js`）
```javascript
export const options = {
    stages: [
        { duration: '1m', target: 500 },
        { duration: '2m', target: 1000 },
        { duration: '1m', target: 0 },
    ],
    thresholds: {
        http_req_duration: ['p99<1000'],
        http_req_failed:   ['rate<0.05'],
    },
};
```

**Scenario 3：並發 Spin 攻擊**（`tests/load/concurrent-spin.k6.js`）
```javascript
// 同一用戶同時發送 10 個 spin
// 驗證只有 1 個成功，其餘 409
```

---

## 9-H. 完整架構設計（DI + Repository Pattern）

### 9-H-1. 核心原則

| 原則 | 說明 |
|------|------|
| **Dev = Production** | 同一份 code，ENV 決定接哪個 adapter，沒有 dev-only code path |
| **Client → API only** | Cocos 只跟 Render API 溝通，不直連 DB/Redis/Supabase |
| **全面 DI + Repository** | DB / Cache / Auth 全部抽介面，上層 Service 只依賴介面 |
| **可抽換底層** | Supabase → MySQL / PostgreSQL；Upstash → Redis / NullCache；一行換 adapter |
| **E2E 全通才上線** | CI 必須跑完整 E2E（包含 UI）才允許 deploy |

### 9-H-2. 四層 Server 架構

```
┌────────────────────────────────────────────────────────────────┐
│  HTTP Layer  │  Routes + Controllers（Fastify）                │
│              │  input validation（Zod）、response format       │
├────────────────────────────────────────────────────────────────┤
│  Service     │  AuthService / WalletService / SpinService      │
│  Layer       │  pure business logic，只依賴 interfaces         │
├────────────────────────────────────────────────────────────────┤
│  Repository  │  IAuthProvider / IUserRepo / IWalletRepo        │
│  Interfaces  │  ISpinLogRepo / ISessionRepo / ICacheAdapter    │
├────────────────────────────────────────────────────────────────┤
│  Adapters    │  SupabaseAuthAdapter  │  CustomJWTAuthAdapter   │
│  （具體實作）│  SupabaseWalletRepo   │  PostgresWalletRepo     │
│              │  UpstashCacheAdapter  │  RedisCacheAdapter      │
│              │  NullCacheAdapter     │  MySQLSpinLogRepo …     │
└────────────────────────────────────────────────────────────────┘
```

### 9-H-3. Repository / Provider 介面定義

```typescript
// ── 認證 ──────────────────────────────────────────────────────
interface IAuthProvider {
    register(email: string, password: string, username: string): Promise<AuthUser>;
    login(email: string, password: string): Promise<AuthTokens>;
    verifyAccessToken(token: string): Promise<AuthClaims>;
    refreshTokens(refreshToken: string): Promise<AuthTokens>;
    revokeSession(sessionId: string): Promise<void>;
    setUserRole(userId: string, role: UserRole): Promise<void>;
}

// ── 使用者 ─────────────────────────────────────────────────────
interface IUserRepository {
    findById(id: string): Promise<User | null>;
    findByEmail(email: string): Promise<User | null>;
    updateLockedUntil(id: string, until: Date | null): Promise<void>;
}

// ── 錢包 ───────────────────────────────────────────────────────
interface IWalletRepository {
    getByUserId(userId: string): Promise<Wallet>;
    /** 原子扣費 + 入帳（單一 DB transaction） */
    atomicSpinSettle(userId: string, wagered: Decimal, win: Decimal, spinId: string): Promise<WalletSnapshot>;
    deposit(walletId: string, amount: Decimal, idempotencyKey: string, paymentRef?: string): Promise<WalletTransaction>;
    listTransactions(walletId: string, opts: PaginationOpts): Promise<PaginatedList<WalletTransaction>>;
}

// ── Spin Log ───────────────────────────────────────────────────
interface ISpinLogRepository {
    save(log: SpinLogInsert): Promise<SpinLog>;
    findById(spinId: string): Promise<SpinLog | null>;
    listByUser(userId: string, opts: PaginationOpts): Promise<PaginatedList<SpinLog>>;
}

// ── Cache ──────────────────────────────────────────────────────
interface ICacheAdapter {
    get(key: string): Promise<string | null>;
    set(key: string, value: string, ttlSeconds: number): Promise<void>;
    del(key: string): Promise<void>;
    /** NX（not exists）鎖定，回傳是否成功取鎖 */
    setNX(key: string, value: string, ttlSeconds: number): Promise<boolean>;
    incrby(key: string, by: number): Promise<number>;
}
// NullCacheAdapter：所有方法 no-op，用於測試或無 Redis 環境
```

### 9-H-4. Composition Root（容器接線）

```typescript
// apps/web/src/container.ts  ← 唯一知道「用哪個 adapter」的地方

const env = parseEnv(process.env);   // zod 驗證所有 ENV

// ── Infrastructure（可被替換的一行） ───────────────────────
const dbAdapter    = new SupabaseDatabaseAdapter(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const cacheAdapter = env.UPSTASH_URL
                   ? new UpstashCacheAdapter(env.UPSTASH_URL, env.UPSTASH_TOKEN)
                   : new NullCacheAdapter();    // 本地 / CI 無 Redis 時自動降級
const authProvider = new SupabaseAuthAdapter(dbAdapter);   // 換成 CustomJWTAuthAdapter → 一行

// ── Repositories ──────────────────────────────────────────
const userRepo     = new SupabaseUserRepository(dbAdapter);
const walletRepo   = new SupabaseWalletRepository(dbAdapter);
const spinLogRepo  = new SupabaseSpinLogRepository(dbAdapter);
const sessionRepo  = new SupabaseSessionRepository(dbAdapter);

// ── Services（只依賴介面，不知道 Supabase 的存在） ────────
const authService   = new AuthService(authProvider, userRepo, sessionRepo, cacheAdapter);
const walletService = new WalletService(walletRepo, cacheAdapter);
const spinService   = new SpinService(spinLogRepo, walletService, cacheAdapter);
const replayService = new ReplayService(spinLogRepo);

export { authService, walletService, spinService, replayService };
```

**未來替換範例**（只改 `container.ts` 三行，Service / Controller 零修改）：

```typescript
// PostgreSQL（自架）
const dbAdapter = new KnexDatabaseAdapter({ client: 'pg', connection: env.PG_URL });
// MySQL
const dbAdapter = new KnexDatabaseAdapter({ client: 'mysql2', connection: env.MYSQL_URL });
// ioredis（取代 Upstash）
const cacheAdapter = new RedisCacheAdapter(env.REDIS_URL);
// 自訂 JWT（取代 Supabase Auth）
const authProvider = new CustomJWTAuthAdapter(userRepo, sessionRepo, env.JWT_SECRET);
```

### 9-H-5. Client 端 DI（Cocos）

與 Server 端相同模式，Cocos 前端只認識 API，不認識底層：

```typescript
// Cocos 端 adapter 介面（只走 Render API）
interface IGameApiAdapter {
    spin(req: SpinRequest): Promise<SpinResponse>;
    getSpinReplay(spinId: string): Promise<SpinResponse>;
}

interface IWalletApiAdapter {
    getBalance(): Promise<WalletResponse>;
    deposit(req: DepositRequest): Promise<DepositResponse>;
    getTransactions(opts: PaginationOpts): Promise<TransactionListResponse>;
}

// Phase 2 實作（兩者連同一個 Render endpoint）
class RemoteGameApiAdapter   implements IGameApiAdapter   { baseUrl = RENDER_API_URL }
class RemoteWalletApiAdapter implements IWalletApiAdapter { baseUrl = RENDER_API_URL }

// 測試 / 本地不起 server 時
class LocalEngineAdapter  implements IGameApiAdapter   { /* 直接呼叫 SlotEngine */ }
class LocalWalletAdapter  implements IWalletApiAdapter { /* in-memory 錢包 */ }
```

`GameBootstrap.ts` 根據 ENV 注入對應 adapter，遊戲邏輯（GameFlowController）零修改。

### 9-H-6. Mono-Repo 目錄結構

```
repo-root/
├── apps/
│   ├── frontend/                   # Cocos Creator 遊戲
│   │   ├── assets/scripts/
│   │   │   ├── services/
│   │   │   │   ├── IGameApiAdapter.ts
│   │   │   │   ├── IWalletApiAdapter.ts
│   │   │   │   ├── IPaymentService.ts
│   │   │   │   ├── RemoteGameApiAdapter.ts     # → Render API
│   │   │   │   ├── RemoteWalletApiAdapter.ts   # → Render API
│   │   │   │   ├── LocalEngineAdapter.ts       # 已有
│   │   │   │   ├── LocalWalletAdapter.ts       # 已有
│   │   │   │   └── MockPaymentService.ts
│   │   │   └── GameBootstrap.ts    # DI 接線
│   │   ├── build/web-desktop/      # Cocos 編譯產出（版控，CI 直接 deploy）
│   │   ├── tests/                  # 現有 Jest tests
│   │   └── package.json
│   ├── web/                        # Fastify API Server（Clean Architecture）
│   │   ├── src/
│   │   │   ├── infrastructure/
│   │   │   │   └── fastify/
│   │   │   │       ├── app.ts      # Fastify instance + plugin registration
│   │   │   │       ├── server.ts   # HTTP server entrypoint
│   │   │   │       └── routes/
│   │   │   │           ├── auth/   # register, login, refresh, logout
│   │   │   │           ├── wallet/ # GET/POST wallet, deposit, withdraw, transactions
│   │   │   │           └── game/   # spin, bet-range, replay
│   │   │   ├── container.ts        # ← Composition Root（唯一接線位置）
│   │   │   ├── config/env.ts       # zod ENV 驗證
│   │   │   ├── services/           # AuthService / WalletService / SpinService / BetRangeService
│   │   │   ├── interfaces/         # IAuthProvider / IUserRepo / IWalletRepo / ICacheAdapter / IRNGProvider …
│   │   │   ├── adapters/
│   │   │   │   ├── supabase/       # SupabaseAuthAdapter / SupabaseWalletRepo …
│   │   │   │   ├── postgres/       # KnexWalletRepo … （未來）
│   │   │   │   └── cache/          # UpstashCacheAdapter / RedisCacheAdapter / NullCacheAdapter
│   │   │   ├── rng/                # IRNGProvider / CryptoRNGProvider / SeededRNGProvider
│   │   │   └── shared/
│   │   │       ├── middleware/     # withAuth() / withRateLimit() HOF wrappers
│   │   │       ├── engine/         # engineAdapter（共用 SlotEngine）
│   │   │       └── errors/         # AppError / errorHandler
│   │   ├── public/
│   │   │   └── game/               # Cocos build/web-desktop/ 複製至此（靜態 serve）
│   │   ├── tests/
│   │   │   ├── unit/               # 100% coverage：Route Handlers / Services / Adapters 全 mock
│   │   │   ├── integration/        # Supabase local 真實 DB（NullCacheAdapter）
│   │   │   ├── e2e/                # 完整 HTTP 流（supertest / fetch）
│   │   │   └── load/               # k6 腳本
│   │   ├── jest.config.ts          # ts-jest，coverage threshold 100%
│   │   ├── Dockerfile
│   │   └── package.json
│   └── worker/
│       └── src/
│           ├── rtpReport.ts        # 每日 RTP cron
│           └── spinLogArchive.ts   # spin_logs 歸檔 cron
├── infra/k8s/
│   ├── base/                       # Deployment / Service / Ingress
│   └── overlays/dev/               # kustomize patch（local ENV）
├── supabase/
│   ├── config.toml
│   ├── migrations/                 # 版本化 SQL
│   └── seed.sql
├── .github/workflows/
│   ├── ci.yml
│   ├── db-migrate.yml
│   └── deploy-demo.yml
├── package.json
└── pnpm-workspace.yaml
```

### 9-H-7. 單一 Origin 策略（解決 G-2 / G-5 CORS）

Fastify API Server 同時 serve Cocos 靜態檔，不需要 CORS / Cookie SameSite=None：

```typescript
// apps/web/src/infrastructure/fastify/app.ts
import fastifyStatic from '@fastify/static';
import path from 'path';

app.register(fastifyStatic, {
    root: path.join(__dirname, '../../frontend/build/web-desktop'),
    prefix: '/',                    // GET / → index.html
    decorateReply: false,
});

// API 路由在 /api/v1/，靜態 fallback 在最後
app.setNotFoundHandler((_req, reply) => {
    reply.sendFile('index.html');   // SPA fallback
});
```

**優點**：
- 前後端同 origin → `SameSite=Strict` Cookie 正常運作
- 無 CORS 設定負擔
- Render 只需一個 Web Service
- 本地 K8s：ingress 路由 `/api/*` → api pod，`/*` → 同一 api pod（或獨立 static pod）

**Render 部署**：
```
Render Web Service（apps/web）
  → serves /api/v1/* （Fastify routes）
  → serves /*       （Cocos build/web-desktop/）
```

---

## 9-I. Phase 2 執行步驟（兩階段）

### Phase 2A：Local 開發環境

> 目標：Windows 11 + Mac 都能一鍵啟動完整 stack，所有 unit test 通過，local 可玩
>
> **完成狀態（2026-03-29）**：全面重構為 Fastify + Clean Architecture。步驟 11、13、14 待實作。
>
> **重構決策**：Next.js → Fastify（高併發）+ Clean Architecture（Domain Entities + Use Cases 層）+ 100% unit test coverage。

| 步驟 | 內容 | 估算 | 狀態 |
|------|------|:----:|:----:|
| 2A-1 | Mono-repo 搬遷：pnpm workspace，Cocos 留根目錄 + `apps/web`（Fastify）+ `apps/worker` | 1 天 | ✅ |
| 2A-2 | Supabase local 啟動 + migration 拆分（§9-C DDL → `supabase/migrations/*.sql`）| 1 天 | ✅ |
| 2A-3 | `IRNGProvider` / `IAuthProvider` / `IWalletRepository` / `ICacheAdapter` / `IProbabilityProvider` 介面定義 | 0.5 天 | ✅ |
| 2A-4 | `CryptoRNGProvider` + `SeededRNGProvider`（unit test 100%）| 0.5 天 | ✅ |
| 2A-5 | `SupabaseAuthAdapter`（mock 覆蓋，Supabase 排除整合測試）| 1 天 | ✅ |
| 2A-6 | `SupabaseWalletRepository` + `IWalletRepository`（mock 覆蓋）| 1 天 | ✅ |
| 2A-7 | `SupabaseSpinLogRepository` + `ISpinLogRepository`（mock 覆蓋）| 1 天 | ✅ |
| 2A-8 | `UpstashCacheAdapter` + `NullCacheAdapter`（unit test 100%）| 0.5 天 | ✅ |
| 2A-9 | `BetRangeService` + `container.ts` Composition Root（unit test 100%）| 2 天 | ✅ |
| 2A-10 | Fastify Controllers（auth / wallet / game）+ Domain Entities + Use Cases 層 + `requireAuth` / `requireAdminIp` preHandler（unit test 100%）| 3 天 | ✅ |
| 2A-11 | Integration tests（Supabase local 真實 DB + NullCacheAdapter）| 1.5 天 | ✅ |
| 2A-12 | K8s overlays/dev 設定（ingress-nginx，local Rancher Desktop）| 0.5 天 | ✅ |
| 2A-13 | Cocos RemoteApiClient + RemoteEngineAdapter + RemoteWalletService 串接；GameBootstrap.startRemote() | 1 天 | ✅ |
| 2A-14 | E2E tests：K8s API E2E（10 tests）+ RPA Visual E2E（11 steps，Playwright）| 1.5 天 | ✅ |
| 2A-15 | Security hardening S-01~S-18（P0 全部完成，P1/P2 同步完成）；nginx no-cache for index.html | 1 天 | ✅ |
| 2A-16 | README（Windows 11 + Mac 建置步驟）+ GitHub Actions CI/CD workflows | 0.5 天 | ✅ |
| **2A 合計** | | **17 天** | **16/16 ✅** |

### Phase 2B：Production 部署

> 目標：Render + Supabase Cloud + Upstash 部署完成，CI/CD 全自動，demo 可公開存取

| 步驟 | 內容 | 估算 |
|------|------|:----:|
| 2B-1 | GitHub Actions 3 workflows（ci / db-migrate / deploy-demo）| 1 天 |
| 2B-2 | Supabase Cloud project 建立 + migration 套用 | 0.5 天 |
| 2B-3 | Render Web Service 部署（ENV secrets 設定）| 0.5 天 |
| 2B-4 | Upstash Redis 建立 + UpstashCacheAdapter 接通 | 0.5 天 |
| 2B-5 | smoke test + E2E against production | 0.5 天 |
| 2B-6 | k6 壓測（Scenario 1/2/3）+ p99 ≤ 1s 驗證 | 1 天 |
| 2B-7 | RTP 一致性驗證（Server spin 500K+）| 1 天 |
| **2B 合計** | | **5 天** |

---

## 9-K. 部署架構設計

### 9-K-1. 環境總覽

| 環境 | 前端 | API | DB/Auth | Cache |
|------|------|-----|---------|-------|
| **Local Dev** | K8s ingress-nginx（Rancher Desktop）| K8s Pod | Supabase Local CLI | local Redis container |
| **Demo** | Cloudflare Pages | Render Web Service | Supabase Cloud | Upstash Redis |

### 9-K-2. 本地開發環境（Rancher Desktop + K8s）

```bash
# 1. 啟動 Supabase local stack（PostgreSQL + Auth + Studio）
supabase start

# 2. 套用 migration（初始化 schema）
supabase db push

# 3. 套用 K8s 設定（ingress-nginx + api + frontend）
kubectl apply -k infra/k8s/overlays/dev

# 4. 開發流程
# - 改 schema → 產 migration → 存入 supabase/migrations/
# - PR 時 CI 跑 migration dry-run 確認可套用
# - merge 到 main 後 CI 套到 demo Supabase
```

**本地路由**（ingress-nginx）：
```
http://local.game.dev/        → frontend K8s Pod
http://local.game.dev/api/v1/ → api K8s Pod
http://local.game.dev/studio  → Supabase Studio
```

### 9-K-3. 分支策略

```
feature/*   → 功能開發（本地驗證）
    ↓ PR
develop     → 整合測試（CI 自動 deploy dev preview）
    ↓ merge
main        → Demo 對外版本（CI 完整驗證 → deploy demo）
```

**簡化版**（demo 早期）：`feature/* → main`（省去 develop）

### 9-K-4. GitHub Actions 3 Workflows

#### A. `ci.yml`（所有 PR / push 觸發）

```yaml
on:
  pull_request:
  push:
    branches: [develop, main]

jobs:
  test:
    steps:
      - pnpm install --frozen-lockfile
      - pnpm lint
      - pnpm test                        # frontend + api 全部 tests
      - pnpm --filter frontend build     # Cocos build 驗證
      - pnpm --filter api build          # TypeScript 編譯驗證

  docker-smoke:
    steps:
      - cd apps/web && pnpm build   # TypeScript 編譯驗證

  migration-dry-run:
    steps:
      - supabase start                   # 啟動 local Supabase（CI 內）
      - supabase db push --dry-run       # 驗證 migration 可套用
```

#### B. `db-migrate.yml`（push 到 main 後套用 Supabase migration）

```yaml
on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  migrate:
    environment: demo
    steps:
      - supabase link --project-ref $SUPABASE_PROJECT_REF -p $SUPABASE_DB_PASSWORD
      - supabase db push
```

#### C. `deploy-demo.yml`（push 到 main 部署全套）

```yaml
on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  deploy:
    environment: demo
    steps:
      - pnpm install && pnpm lint && pnpm test && pnpm build
      - supabase db push                         # migration
      - curl -fsS -X POST $RENDER_DEPLOY_HOOK_URL  # 觸發 Render deploy
      - |                                        # smoke test（retry，非 sleep）
          for i in $(seq 1 12); do
            curl -fsS $RENDER_SERVICE_URL/health && break || sleep 10
          done
      # Cloudflare Pages 由 Git integration 自動 deploy（無需額外步驟）
```

### 9-K-5. GitHub Environment Secrets（demo）

| Secret | 用途 |
|--------|------|
| `SUPABASE_PROJECT_REF` | Supabase project 識別碼 |
| `SUPABASE_DB_PASSWORD` | DB 密碼（migration 用）|
| `SUPABASE_ACCESS_TOKEN` | CLI 認證 |
| `SUPABASE_URL` | Supabase API endpoint（API server 讀取）|
| `SUPABASE_SERVICE_ROLE_KEY` | 後端 admin key（勿洩漏，只在 API Server ENV）|
| `RENDER_DEPLOY_HOOK_URL` | 觸發 Render deploy |
| `RENDER_SERVICE_URL` | health check URL（e.g. `https://xxx.onrender.com`）|
| `UPSTASH_REDIS_REST_URL` | Redis REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | Redis auth token |
| `JWT_SECRET` | HttpOnly Cookie 簽名（`CustomJWTAuthAdapter` 時使用）|

> `SUPABASE_ANON_KEY` / Cloudflare secrets 不再需要（Client 不直連 Supabase，前端整合進 API）

### 9-K-6. 版本控管與回滾

```bash
# 每次 demo 版本打 tag
git tag demo-2026-03-28.1
git push origin demo-2026-03-28.1

# 回滾 API + 前端（同一 Render Service）：在 Render 後台重新 deploy 前一個 commit
# 回滾 DB：需手寫 rollback SQL 並走新 migration 套用（無自動 down migration）
```

### 9-K-7. 單一 Render Service 部署策略（G-5 決策）

前後端整合進同一個 Render Web Service（§9-H-7）：

```
Render Web Service（apps/web）
  build:  pnpm install && pnpm --filter web build
  start:  node apps/web/dist/infrastructure/fastify/server.js
  routes:
    /api/v1/* → Fastify handlers
    /*        → build/web-desktop/ （Cocos static，@fastify/static serve）
```

**deploy-demo.yml**（無 Cloudflare 步驟，一個 hook 搞定）：
```yaml
- name: Trigger Render deploy
  run: curl -fsS -X POST "${{ secrets.RENDER_DEPLOY_HOOK_URL }}"
- name: Smoke test (retry loop)
  run: |
    for i in $(seq 1 12); do
      curl -fsS ${{ secrets.RENDER_SERVICE_URL }}/health && break || sleep 10
    done
```

### 9-K-8. Worker 背景工作

| Worker | 觸發方式 | 內容 |
|--------|---------|------|
| `rtpReport.ts` | Cron（每日 00:00）| 統計各 mode RTP，寫入 `rtp_daily_reports` 表 |
| `spinLogArchive.ts` | Cron（每月 1 日）| 將 2 年前 spin_logs 移至 archive 表（partition）|
| `alertRTP.ts` | 滾動 RTP 偏離觸發 | 當 redis `rtp:global:10k` 超出 97.5%±2% 時觸發通知 |

---

## 9-M. 多幣別 & BetRange 設計

### 9-M-1. 核心原則

| 原則 | 說明 |
|------|------|
| **幣別不進引擎** | SlotEngine 永遠只接受 `normalizedBet`（整數 level），不知道幣別存在 |
| **RTP 幣別無關** | `RTP = Σwin_level / Σbet_level`，分子分母單位相同，幣別不影響比值 |
| **BetRange 由機率包提供** | `IProbabilityProvider.getBetRange(currency)` 是 bet range 的唯一來源 |
| **Cache first** | BetRange 存 Redis；cache miss 才查機率包；變更機率包設定時主動 invalidate |
| **Wallet 存 player 幣別** | 錢包金額以 player 原始幣別存儲（NUMERIC(18,4)），不做跨幣別轉換 |

### 9-M-2. 正規化原理（Normalization）

每個幣別定義一個 `baseUnit`（最小下注單位），`betLevel`（整數）是引擎看到的唯一數字：

```
playerBetAmount = betLevel × baseUnit

USD: baseUnit = 0.01  → betLevel=50  ↔ 玩家下注 $0.50
TWD: baseUnit = 1     → betLevel=50  ↔ 玩家下注 NT$50
EUR: baseUnit = 0.01  → betLevel=50  ↔ 玩家下注 €0.50
```

**引擎計算（完全不知道幣別）**：
```
normalizedBet = betLevel          // e.g. 50
totalWin_level = engine.spin(normalizedBet)  // e.g. 250
```

**還原回玩家幣別**：
```
playerWin = totalWin_level × baseUnit
USD: 250 × 0.01 = $2.50
TWD: 250 × 1    = NT$250
```

**RTP 不受幣別影響（數學證明）**：
```
RTP = Σ(totalWin_level × baseUnit) / Σ(betLevel × baseUnit)
    = baseUnit × ΣtotalWin_level / (baseUnit × Σbetlevel)
    = Σtotalwin_level / Σbet_level          ← baseUnit 約分消失
```

### 9-M-3. 幣別定義（CurrencyConfig）

```typescript
// apps/web/src/domain/interfaces/ICurrencyConfig.ts

export interface CurrencyConfig {
    code:        string;        // 'USD' | 'TWD' | 'EUR' | ...
    symbol:      string;        // '$' | 'NT$' | '€'
    baseUnit:    number;        // 最小下注單位（USD=0.01, TWD=1）
    precision:   number;        // 顯示小數位（USD=2, TWD=0）
    minBetLevel: number;        // 最低 betLevel（整數）
    maxBetLevel: number;        // 最高 betLevel（整數）
}

// Phase 2 初始設定（由 IProbabilityProvider 提供）
const CURRENCY_CONFIGS: Record<string, CurrencyConfig> = {
    USD: { code: 'USD', symbol: '$',   baseUnit: 0.01, precision: 2, minBetLevel: 1,  maxBetLevel: 10000 },
    TWD: { code: 'TWD', symbol: 'NT$', baseUnit: 1,    precision: 0, minBetLevel: 1,  maxBetLevel: 300   },
};
```

### 9-M-4. BetRange 結構

```typescript
// apps/web/src/domain/interfaces/IBetRange.ts

export interface BetRange {
    currency:     string;        // 'USD' | 'TWD'
    betLevels:    number[];      // 允許的 betLevel 整數陣列（由機率包定義）
    minBetLevel:  number;        // = betLevels[0]
    maxBetLevel:  number;        // = betLevels[betLevels.length - 1]
    defaultLevel: number;        // 推薦預設值
    // 顯示用（前端渲染用，引擎不用這些欄位）
    displaySteps: string[];      // e.g. ['$0.01','$0.02','$0.05'] 或 ['NT$1','NT$2']
    baseUnit:     number;
    symbol:       string;
}

// 範例
// USD BetRange:
// betLevels:   [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]
// displaySteps: ['$0.01','$0.02','$0.05','$0.10','$0.20','$0.50','$1.00','$2.00','$5.00','$10.00']

// TWD BetRange:
// betLevels:   [1, 2, 5, 10, 20, 50, 100, 200, 300]
// displaySteps: ['NT$1','NT$2','NT$5','NT$10','NT$20','NT$50','NT$100','NT$200','NT$300']
```

### 9-M-5. IProbabilityProvider 介面

```typescript
// apps/web/src/domain/interfaces/IProbabilityProvider.ts

export interface IProbabilityProvider {
    /** 取得指定幣別的 BetRange（機率包唯一權威來源） */
    getBetRange(currency: string): Promise<BetRange>;

    /** 取得支援的幣別清單 */
    getSupportedCurrencies(): Promise<string[]>;

    /** 取得符號權重表（模式 + betLevel → 不變，幣別無關） */
    getSymbolWeights(mode: GameMode): SymbolWeightTable;

    /** 取得賠率表（幣別無關，以 betLevel 倍數計） */
    getPaytable(): Paytable;

    /** 取得遊戲模式相關參數（FG 觸發率、Max Win 等） */
    getGameParams(mode: GameMode): GameParams;
}

// Phase 2 實作：讀取現有 GameConfig.ts
class LocalProbabilityProvider implements IProbabilityProvider {
    async getBetRange(currency: string): Promise<BetRange> {
        const config = CURRENCY_CONFIGS[currency];
        if (!config) throw new Error(`Unsupported currency: ${currency}`);
        const levels = this._computeBetLevels(config);   // 由 GameConfig 參數產生
        return {
            currency,
            betLevels:    levels,
            minBetLevel:  levels[0],
            maxBetLevel:  levels[levels.length - 1],
            defaultLevel: levels[Math.floor(levels.length / 3)],
            displaySteps: levels.map(l => formatCurrency(l * config.baseUnit, config)),
            baseUnit:     config.baseUnit,
            symbol:       config.symbol,
        };
    }
}

// 未來：RemoteProbabilityProvider（讀遠端設定服務）
```

### 9-M-6. BetRange Cache 策略

```typescript
// Redis key: bet-range:{currency}    TTL: 3600s（1 小時）

class BetRangeService {
    constructor(
        private prob: IProbabilityProvider,
        private cache: ICacheAdapter,
    ) {}

    async getBetRange(currency: string): Promise<BetRange> {
        const key = `bet-range:${currency}`;

        // 1. Cache hit
        const cached = await this.cache.get(key);
        if (cached) return JSON.parse(cached);

        // 2. Cache miss → 查機率包
        const range = await this.prob.getBetRange(currency);

        // 3. 存 cache
        await this.cache.set(key, JSON.stringify(range), 3600);
        return range;
    }

    /** 機率包設定變更時主動 invalidate */
    async invalidateBetRange(currency?: string): Promise<void> {
        if (currency) {
            await this.cache.del(`bet-range:${currency}`);
        } else {
            // invalidate all currencies
            for (const cur of await this.prob.getSupportedCurrencies()) {
                await this.cache.del(`bet-range:${cur}`);
            }
        }
    }
}
```

### 9-M-7. Spin API 幣別處理流程

```typescript
// apps/web/src/usecases/game/SpinUseCase.ts

async spin(userId: string, req: SpinRequest): Promise<SpinResponse> {
    const { currency, betLevel, mode, extraBetOn } = req;

    // 1. 驗證 betLevel 是否在允許範圍內（查 cache）
    const range = await this.betRangeService.getBetRange(currency);
    if (!range.betLevels.includes(betLevel)) {
        throw new AppError('INVALID_BET_LEVEL', 400);
    }

    // 2. 取得幣別設定
    const currConfig = CURRENCY_CONFIGS[currency];
    const playerBetAmount = new Decimal(betLevel).mul(currConfig.baseUnit);  // e.g. 50 × 0.01 = 0.50 USD

    // 3. 扣費（以 player 幣別金額操作 wallet）
    const tx = await this.walletRepo.beginSpin(userId, playerBetAmount, currency);

    // 4. 引擎計算（只傳 betLevel，不傳幣別）
    const outcome = this.engine.computeFullSpin({ mode, totalBet: betLevel, extraBetOn });

    // 5. 計算 player 幣別贏分
    const winLevel   = outcome.totalWin;                              // engine 的 level 單位
    const playerWin  = new Decimal(winLevel).mul(currConfig.baseUnit); // 換算回 player 幣別

    // 6. 入帳
    await this.walletRepo.completeSpin(tx, playerWin);

    // 7. 記錄 spin_log（儲存 betLevel、winLevel 及 playerBetAmount、playerWin 兩套）
    await this.spinLogRepo.save({
        userId, mode, currency,
        betLevel, winLevel,                          // 引擎單位（RTP 計算用）
        playerBetAmount: playerBetAmount.toFixed(4), // 玩家幣別（對帳用）
        playerWin:       playerWin.toFixed(4),
        baseUnit:        currConfig.baseUnit,
        outcome,
    });

    return { spinId, outcome, balanceAfter, currency, playerBetAmount, playerWin };
}
```

### 9-M-8. Spin Request API（更新）

```typescript
// POST /api/v1/game/spin
interface SpinRequest {
    mode:        'main' | 'extraBet' | 'buyFG';
    currency:    string;     // 'USD' | 'TWD'（wallet 幣別，需一致）
    betLevel:    number;     // 整數，必須在 BetRange.betLevels 內
    extraBetOn?: boolean;
}
// betLevel 驗證：查 BetRange cache，若 miss 查 IProbabilityProvider
```

### 9-M-9. BetRange API（新增）

```typescript
// GET /api/v1/game/bet-range?currency=USD
interface BetRangeResponse {
    currency:     string;
    betLevels:    number[];
    defaultLevel: number;
    displaySteps: string[];   // 前端直接顯示
    minBet:       string;     // e.g. '$0.01'
    maxBet:       string;     // e.g. '$100.00'
}
// Cache-Control: max-age=3600
// 機率包更新時，Server 主動 invalidate redis key，下次 API call 重新填充
```

### 9-M-10. spin_logs 幣別欄位

> 已整合進 §9-C CREATE TABLE spin_logs DDL（currency / bet_level / win_level / base_unit / player_bet / player_win）。
> 以下為 RTP 查詢範例。

**RTP 查詢（以 level 計，幣別無關）**：
```sql
SELECT currency,
       SUM(win_level)::float / NULLIF(SUM(bet_level), 0) AS rtp
FROM spin_logs
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY currency;
```

### 9-M-11. 多幣別並行無干擾保證

| 場景 | 影響 | 結論 |
|------|------|------|
| 同時有 USD / TWD 玩家 spin | 各自引擎呼叫獨立，只傳 betLevel | ✅ 無干擾 |
| 幣別 A 的 RTP 偏高 | 與幣別 B 的 RTP 無關（level 計算獨立）| ✅ 互不影響 |
| baseUnit 改變（如 TWD 改 0.5）| 只影響顯示金額，engine betLevel 不變，RTP 不變 | ✅ 安全 |
| 新增幣別（如 EUR）| 加 CURRENCY_CONFIGS 一筆，機率包提供 BetRange，engine 不改 | ✅ 零引擎改動 |
| 匯率波動 | 完全不進系統（沒有跨幣別換算），各幣別獨立 | ✅ 無影響 |

---

## 9-N. 補充設計決策

### 9-N-1. Production RNG 設計（最高安全等級）

```typescript
// apps/web/src/rng/IRNGProvider.ts
export interface IRNGProvider {
    /** 取得 [0,1) 浮點數（等同 Math.random() 介面，但安全）*/
    random(): number;
    /** 取得 [0, max) 整數 */
    randomInt(max: number): number;
    /** 取得 n 個 [0,1) 浮點數（一次 spin 所需的所有隨機值）*/
    randomBatch(n: number): number[];
    /** 取得本 spin 使用的 raw bytes（存入 spin_log 供稽核）*/
    getSpinBytes(): Uint8Array;
}

// Production 實作：每個隨機值獨立呼叫 crypto.randomBytes()
export class CryptoRNGProvider implements IRNGProvider {
    private _spinBytes: Uint8Array[] = [];

    random(): number {
        const buf = crypto.randomBytes(8);
        this._spinBytes.push(buf);
        // 取 53 bits 轉 [0,1) 浮點數（IEEE 754 精度）
        const hi = buf.readUInt32BE(0) >>> 5;
        const lo = buf.readUInt32BE(4) >>> 6;
        return (hi * 0x4000000 + lo) / 0x20000000000000;
    }

    randomInt(max: number): number {
        // 無偏差取整（rejection sampling）
        const threshold = (2 ** 32 - (2 ** 32 % max));
        let val: number;
        do {
            const buf = crypto.randomBytes(4);
            this._spinBytes.push(buf);
            val = buf.readUInt32BE(0);
        } while (val >= threshold);
        return val % max;
    }

    randomBatch(n: number): number[] {
        return Array.from({ length: n }, () => this.random());
    }

    getSpinBytes(): Uint8Array {
        const all = Buffer.concat(this._spinBytes);
        this._spinBytes = [];   // reset for next spin
        return all;
    }
}

// Test 實作：mulberry32 seeded（已有，不變）
export class SeededRNGProvider implements IRNGProvider { /* 現有實作 */ }
```

**為何是最安全的**：
- 每個隨機值直接來自 OS entropy（Linux `getrandom()` syscall）
- 無任何 PRNG 層：攻擊者無法從已知輸出推算未來值
- Rejection sampling 消除偏差（無 modulo bias）
- raw bytes 存入 spin_log 供稽核重播

### 9-N-2. EC2 / Render 效能評估（1,000 人 × 200ms）

#### 關鍵指標計算

```
目標 TPS（Peak）= 1,000 users × (1 spin / 0.2s) = 5,000 req/s

但實際遊戲周期：
  spin 動畫 + FG 演出 ≈ 3-8 秒
  實際平均 TPS       ≈ 150-300 req/s（一般時段）
  Peak TPS           ≈ 1,000-2,000 req/s（同時觸發）
  Stress Peak        = 5,000 req/s（壓測目標）

每次 Spin 後端處理時間分解：
  JWT 驗 + Redis session    ~1ms
  Redis: spin lock NX EX   ~1ms
  SlotEngine.computeFullSpin ~2-5ms（CPU）
  Redis: balance GET        ~1ms
  PostgreSQL: atomic settle  ~8-15ms（I/O 主瓶頸）
  Redis: balance SET + RTP  ~1ms
  PostgreSQL: spin_log INSERT ~5-10ms
  ─────────────────────────────
  Total server processing   ~19-34ms
```

#### Demo 階段（Render，目標 p99 ≤ 1s）

| 方案 | 規格 | 費用/月 | 預期 p99 | 適用 |
|------|------|---------|---------|------|
| Render Free | 512MB, 0.1 CPU | $0 | ~2-5s（cold start 30s）| 展示用，允許 cold start |
| Render Starter | 512MB, 0.5 CPU | $7 | ~500ms-1s | Demo 目標 ✅ |
| Render Standard | 2GB, 1 CPU | $25 | ~200-400ms | Demo 舒適目標 |

> Render Starter ($7) 建議：關閉 sleep（always on），滿足 p99 ≤ 1s

#### Production 階段（AWS EC2，目標 1,000 人 × 200ms）

**App Server（Fastify，horizontal scaling）**

| 場景 | 機型 | 數量 | 費用/月 | 處理能力 |
|------|------|:----:|------:|---------|
| 一般時段（300 TPS）| t3.medium（2vCPU, 4GB）| 2 | $60 | ~2,000 TPS ✅ |
| Peak（2,000 TPS）| c5.large（2vCPU, 4GB）| 3 | $230 | ~3,000 TPS ✅ |
| Stress（5,000 TPS）| c5.xlarge（4vCPU, 8GB）| 3 | $460 | ~5,000 TPS ✅ |

**Database（PostgreSQL，主要瓶頸）**

| 場景 | 機型 | 費用/月 | 備註 |
|------|------|------:|------|
| Demo / Supabase Pro | Supabase Pro | $25 | 500MB DB，200 concurrent conn |
| Production | db.r5.large（2vCPU, 16GB）| $220 | ~5,000 TPS with PgBouncer |
| High availability | db.r5.large + Read Replica | $440 | 讀寫分離 |

> **關鍵**：PostgreSQL 前必須加 PgBouncer（connection pooling），否則 1,000 用戶 × 並發 = 連線耗盡。

**Redis（Upstash / ElastiCache）**

| 場景 | 方案 | 費用/月 |
|------|------|------:|
| Demo | Upstash Free（10K req/day）| $0 |
| Demo 正式 | Upstash Pay-as-you-go | ~$5-10 |
| Production | ElastiCache cache.r6g.large | $120 |

**Production 最小可行配置（1,000 人 × 200ms）**

```
ALB                              $25/月
  ├── Fastify c5.large × 3       $230/月
  │     └── PgBouncer t3.micro   $10/月
  ├── db.r5.large PostgreSQL     $220/月
  └── ElastiCache cache.r6g.large $120/月
                           ─────────────
                           合計 ~$605/月
```

### 9-N-3. Client 端 Supabase 完全隱藏

```typescript
// ❌ 禁止在 API Response 中洩漏 Supabase 資訊
// 錯誤範例：直接回傳 Supabase error
return reply.status(500).send({ error: supabaseError.message });  // "relation "wallets" does not exist"

// ✅ 正確：所有 DB 錯誤轉換為統一 AppError
try {
    const wallet = await walletRepo.getByUserId(userId);
    return reply.status(200).send(toWalletDTO(wallet));
} catch (err) {
    // AppError 轉換層：DB 錯誤 → 標準錯誤碼
    throw new AppError('WALLET_NOT_FOUND', 404);
}

// AppError → Response
// { "error": "WALLET_NOT_FOUND", "message": "Wallet not found" }
// 不含 Supabase URL、table 名稱、PostgreSQL error code
```

**Server ENV（`apps/web/.env.local`）**：
```bash
# 允許（API Server 內部使用，不暴露至 Client）
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...    # 僅 Server-side，Client 完全不可見
JWT_SECRET=...                   # 至少 32 字元
ALLOWED_ORIGIN=*                 # CORS 白名單（production 改為明確 origin）
```

### 9-N-4. Fastify Controller 100% 測試覆蓋

```typescript
// ─── 薄 Controller 模式（易達 100%）────────────────────────
// src/adapters/controllers/gameController.ts
export function registerGameRoutes(app: FastifyInstance, container: Container) {
    app.post('/api/v1/game/spin', { preHandler: [requireAuth] }, async (req, reply) => {
        const body   = SpinRequestSchema.parse(req.body);
        const result = await container.spinUseCase.execute(req.user.userId, body);
        return reply.status(200).send(result);
    });
}

// ─── 單元測試（mock use case，100% branch coverage）──────────
// tests/unit/adapters/controllers/gameController.test.ts
import { buildApp } from '@/infrastructure/fastify/app';

describe('POST /api/v1/game/spin', () => {
    const mockSpinUseCase = { execute: jest.fn() };
    let app: FastifyInstance;

describe('POST /api/v1/game/spin', () => {
    it('200 valid spin', async () => { ... });
    it('400 invalid betLevel', async () => { ... });
    it('402 insufficient balance', async () => { ... });
    it('429 rate limited', async () => { ... });
    it('401 unauthenticated', async () => { ... });
});

// coverage: statements 100%, branches 100%, functions 100%
```

**jest.config.ts（強制 100%）**：
```typescript
export default {
    coverageThreshold: {
        global: {
            statements: 100,
            branches:   100,
            functions:  100,
            lines:      100,
        },
    },
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/**/*.d.ts',
        '!src/container.ts',    // composition root 排除（integration test 覆蓋）
    ],
};
```

---

## 9-J. Phase 2 開始前缺漏檢查清單

> 在開始實作前，確認以下設計決策均已解決：

| # | 問題 | 需決策內容 | 狀態 |
|---|------|-----------|:----:|
| 1 | **幣別精度** | 多幣別支援（USD 小數 2 位、TWD 整數 > 0）；Wallet 以 NUMERIC(18,4) 存 player 幣別金額；引擎用 normalizedBet（整數 level），不接觸幣別。詳見 §9-M。 | ✅ |
| 2 | **Bet 合法值** | BetRange 由 IProbabilityProvider 提供（依幣別），存 Redis cache（bet-range:{currency}），cache miss 才查機率包；bet step 為整數 level，顯示層乘 baseUnit 換算幣別。詳見 §9-M。 | ✅ |
| 3 | **最低/最高儲值** | Phase 2 統一限額：USD 最高 $1,000；TWD 最高 NT$30,000。最低儲值由 IProbabilityProvider BetRange minBet 決定（USD $0.01 × minBetLevel；TWD NT$1 × minBetLevel）。MockPaymentService 輸入框驗證此範圍。 | ✅ |
| 4 | **支付閘道** | Phase 2 使用 `MockPaymentService`（假頁面點擊即成功）；Cocos 端以 `IPaymentService` DI 介面解耦，未來換真實支付商只需替換注入類別，無需改遊戲邏輯。詳見 §9-B-4。 | ✅ |
| 5 | **xoshiro128** vs mulberry32 | Production 使用純 `crypto.randomBytes()`（OS CSPRNG，每次 spin 每個隨機值獨立取樣，無 PRNG 層）。Test 環境繼續用 SeededRNGProvider（mulberry32）。介面 IRNGProvider DI 注入，container.ts 決定實作。詳見 §9-N。 | ✅ |
| 6 | **Refresh Token 存放** | **HttpOnly Cookie**（`SameSite=Strict; Secure; Path=/auth/refresh`）。Access Token 放 memory（非 localStorage）。詳見 §9-A-2。 | ✅ |
| 7 | **API 版本策略** | 同時支援 URL path（`/api/v1/`）與 Header（`Accept-Version: v1`）。URL 優先，Header 作為覆蓋。未來版本共存以 URL 為主要隔離機制。 | ✅ |
| 8 | **管理員 2FA** | Phase 2 無後台 admin 介面，暫不實作 2FA。未來後台以 Vue 實作時再補 TOTP。 | ✅ |
| 9 | **Spin 最小間隔** | 200ms（5 spin/s per user）。1,000 人同時在線目標 TPS：5,000 req/s peak。EC2 sizing 評估詳見 §9-N。Demo 階段 p99 目標 ≤ 1s。 | ✅ |
| 10 | **RTP 告警** | 滾動 RTP 偏離 97.5% ±2% 時，寫入 `rtp_alerts` DB table（不發 Slack/Email）。未來從此資料集中延伸 alert 機制。 | ✅ |
| 11 | **spin_logs 保留期** | 保留 2 年。使用 PostgreSQL PARTITION BY RANGE (YEAR)，每年一個 partition，2 年前 partition 可 DETACH 後歸檔或刪除。 | ✅ |
| 12 | **GDPR/個資** | Client 端不得感知後端 Supabase 存在。所有 Supabase SDK 呼叫限制在 API server 內部；不暴露 SUPABASE_ANON_KEY 給前端；API 回傳自訂 DTO，DB 錯誤統一轉換為 AppError 再回傳。詳見 §9-N。 | ✅ |
| 13 | **部署環境** | **Dev**：Rancher Desktop + local K8s + Supabase Local CLI + local Redis container。**Demo**：Cloudflare Pages（前端）+ Render Web Service（API）+ Supabase Cloud（DB/Auth）+ Upstash Redis（cache）。**CI/CD**：GitHub Actions + GitHub Environments（dev/demo）+ 3 workflows（ci / db-migrate / deploy-demo）。詳見 §9-K。 | ✅ |
| 14 | **監控** | Phase 2 統一錯誤寫入 `error_logs` DB table（spinId / userId / code / message / stack / createdAt）。未來從此延伸 alert 與資料集中（Datadog / Sentry）。Render 內建 metrics 監控 CPU/Memory/RPS。 | ✅ |

---

## 9-L. 架構 Gap 分析（決策與補強結果）

### G-1 Supabase Auth vs Custom JWT ✅ 已解決

**決策**：使用 `IAuthProvider` DI 介面，Phase 2 以 `SupabaseAuthAdapter` 實作。

| 面向 | 做法 |
|------|------|
| 上層呼叫 | `authService.login(email, pw)` — 不知道 Supabase 的存在 |
| Phase 2 adapter | `SupabaseAuthAdapter` 封裝 Supabase Auth SDK |
| 自訂 role | 用 `auth.users.app_metadata.role`（Supabase custom claim）|
| 未來換 JWT | 改 `container.ts` 注入 `CustomJWTAuthAdapter`，Service 零修改 |
| §9-A 保留部分 | `IAuthProvider` 介面定義、Token 撤銷機制（Redis blacklist）仍有效 |

### G-2 Client → API only / 單一 Origin ✅ 已解決

**決策**：Cocos 靜態檔由 Fastify API Server 一併 serve（§9-H-7），同 origin，CORS 與 Cookie 問題全消。

- `SameSite=Strict` 繼續有效（§9-A-2 設計不變）
- Client 只和 `Render Web Service /api/v1/*` 溝通
- 無須 Cloudflare Pages（靜態 serve 整合進 API）

### G-3 Cocos CI Build ✅ 已解決

**決策**：`build/web-desktop/` 版本控制，CI 直接 deploy，不在 CI 內重新 build。

| 步驟 | 說明 |
|------|------|
| 本地 build | `./infra/k8s/cocos/build-cocos.sh` 呼叫 Cocos Creator CLI，產出 `build/web-desktop/` |
| commit 規則 | 功能確認後 commit build 產出（`git add build/web-desktop/`）|
| CI 職責 | `ci.yml` 只跑 TypeScript / Jest 測試，不重新 build Cocos |
| E2E | `ci.yml` 啟動 `serve build/web-desktop/` → Playwright 跑完整 UI E2E |
| deploy | `deploy-demo.yml` 直接上傳 `build/web-desktop/` 到 Render Static Files（或由 API 靜態 serve）|
| 一致性保證 | build 是確定性的（same source → same output）；source 在版控，build 由 source 產生 |

**E2E gate（上線前必過）**：
```yaml
# ci.yml
- name: Start game server
  run: npx serve build/web-desktop -p 8080 &
- name: Wait for server
  run: npx wait-on http://localhost:8080
- name: Run E2E tests
  run: pnpm --filter frontend test:e2e   # Playwright
```

### G-4 Repository / Cache DI ✅ 已解決

見 §9-H-3（介面定義）和 §9-H-4（Composition Root）。底層可抽換清單：

| 現在（Phase 2）| 未來可換 | 只需改 |
|---------------|---------|--------|
| `SupabaseWalletRepository` | `KnexWalletRepository`（pg/mysql）| `container.ts` 1 行 |
| `SupabaseSpinLogRepository` | `KnexSpinLogRepository` | `container.ts` 1 行 |
| `UpstashCacheAdapter` | `RedisCacheAdapter` / `NullCacheAdapter` | `container.ts` 1 行 |
| `SupabaseAuthAdapter` | `CustomJWTAuthAdapter` | `container.ts` 1 行 |

**Supabase RLS**：因 Client 不直連 Supabase（G-2），RLS 非必要安全層，但仍建議開啟作為縱深防禦：

```sql
-- wallets：只能看自己的
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY wallet_owner ON wallets USING (user_id = auth.uid());

-- API Server 使用 service_role key，繞過 RLS（full access）
-- Client 永遠不持有 service_role key
```

### G-5 前端 Hosting ✅ 已解決

**決策**：不用 Cloudflare Pages，Fastify API 直接 serve 靜態檔（§9-H-7）。

- 單一 Render Web Service 服務前後端
- 無 CORS / Cookie 跨域問題
- 部署更簡單（一個服務 = 一次 deploy）

### G-6 Supabase 可抽換 ✅ 已解決

見 §9-H-3 / §9-H-4。Supabase 僅作為 adapter 實作，上層 Service 不 import Supabase SDK。

**Migration 策略**：`supabase/migrations/*.sql` 是標準 PostgreSQL DDL，換 PostgreSQL 只需換連線字串，migration 檔可直接用 `psql` 執行。

**CI migration dry-run**：使用 PostgreSQL service container（避免 Supabase Docker OOM）：

```yaml
# ci.yml
services:
  postgres:
    image: postgres:16
    env:
      POSTGRES_PASSWORD: test
    ports: ['5432:5432']

- name: Apply migrations (dry-run via psql)
  run: psql postgresql://postgres:test@localhost/test -f supabase/migrations/*.sql
```

### G-7 Render Cold Start ✅ 已解決

smoke test 改 retry loop（已更新 §9-K-4）：
```bash
for i in $(seq 1 12); do
  curl -fsS $RENDER_SERVICE_URL/health && break || sleep 10
done
# 最多等 2 分鐘（12 × 10s）
```

Render $7/month 付費方案可關 sleep，建議 demo 時升級。

### 🟢 Nice to Have（可後期補充）

| # | Gap | 建議 |
|---|-----|------|
| G-8 | **K8s local domain** | `/etc/hosts` 加 `127.0.0.1 local.game.dev`；或用 `nip.io`（`127.0.0.1.nip.io`）|
| G-9 | **Upstash 本地 emulator** | 本地用 `ICacheAdapter` + `RedisCacheAdapter`（ioredis）；demo 用 `UpstashCacheAdapter`；介面相同，ENV 決定 |
| G-10 | **DB down migration** | Migration 只有 up；需要 rollback 時，手寫 rollback SQL 並走新 migration 套用 |
| G-11 | **worker 部署** | Phase 2 用 GitHub Actions schedule（`cron: '0 0 * * *'`）；未來可搬到 Render Cron Job |
| G-12 | **Preview deploy E2E** | Render 每個 PR 不自動 preview deploy；若需 PR preview，考慮 Railway 或 Fly.io |

---

## 9-O. Security Hardening Checklist（18 項安全強化）

> 來源：EDD Security Review 2026-03-28。P0 須在 Phase 2A 開發時實作；P1 在 Phase 2B 上線前完成；P2 在開發期間補上；P3 上線後補充。

### P0 — Critical（實作時必須完成）

#### S-01：Mock Provider 生產環境封鎖

`POST /wallet/deposit` 的 `provider: 'mock'` 在 production 必須被拒絕，否則任何人可無限注資。

```typescript
// apps/web/src/services/WalletService.ts
async deposit(userId: string, req: DepositRequest): Promise<DepositResponse> {
    if (req.provider === 'mock' && env.NODE_ENV === 'production') {
        throw new AppError('PROVIDER_NOT_ALLOWED', 403,
            'Mock provider is disabled in production');
    }
    // ...
}
```

**測試要求**：unit test 覆蓋「production + mock = 403」與「production + stripe = pass」兩個 branch。

#### S-02：SeededRNGProvider 生產環境硬封鎖

`SeededRNGProvider`（mulberry32）絕對不能在生產環境執行。在構造函式加強制 guard，而非依賴 container.ts 選擇正確。

```typescript
// apps/web/src/rng/SeededRNGProvider.ts
export class SeededRNGProvider implements IRNGProvider {
    constructor(seed: number) {
        if (process.env.NODE_ENV === 'production') {
            throw new Error(
                '[SECURITY] SeededRNGProvider is FORBIDDEN in production. ' +
                'Use CryptoRNGProvider. This is a gaming compliance violation.'
            );
        }
        // ... mulberry32 init
    }
}
```

同時在 `container.ts` 加第二道防護：

```typescript
// container.ts
const rng = env.NODE_ENV === 'production'
    ? new CryptoRNGProvider()
    : new SeededRNGProvider(env.TEST_RNG_SEED ?? 42);

// 雙重保險：production 下確認 RNG 類型
if (env.NODE_ENV === 'production' && !(rng instanceof CryptoRNGProvider)) {
    throw new Error('[FATAL] Non-CSPRNG detected in production. Refusing to start.');
}
```

#### S-03：spin_logs 無 FK 的完整性補償

Partition table 無法加 FK 到 users，需應用層補償：

```typescript
// SpinService.spin() - 寫 spin_log 前驗 user 存在
const user = await userRepo.findById(userId);
if (!user || user.status === 'deleted') {
    throw new AppError('USER_NOT_FOUND', 404);
}
// 確認 wallet 屬於此 user
const wallet = await walletRepo.getByUserId(userId);
if (wallet.userId !== userId) {
    throw new AppError('WALLET_MISMATCH', 403);
}
```

定期 reconciliation（每日 worker job）：

```sql
-- 找出孤兒 spin_logs（user 已不存在）
SELECT s.spin_id, s.user_id, s.created_at
FROM spin_logs s
LEFT JOIN users u ON s.user_id = u.id
WHERE u.id IS NULL
ORDER BY s.created_at DESC
LIMIT 100;
-- 結果寫入 error_logs 供稽核
```

---

### P1 — High（Phase 2B 上線前完成）

#### S-04：HTTP 安全 Headers

@fastify/helmet 自動注入全域安全 headers：

```typescript
// apps/web/src/infrastructure/fastify/app.ts
import helmet from '@fastify/helmet';

await app.register(helmet, {
    contentSecurityPolicy: {
        directives: {
            defaultSrc:     ["'self'"],
            scriptSrc:      ["'self'", "'unsafe-inline'", "'unsafe-eval'"],  // Cocos 需要
            styleSrc:       ["'self'", "'unsafe-inline'"],
            imgSrc:         ["'self'", 'data:', 'blob:'],
            connectSrc:     ["'self'"],
            fontSrc:        ["'self'", 'data:'],
            objectSrc:      ["'none'"],
            baseUri:        ["'self'"],
            frameAncestors: ["'none'"],
        },
    },
    hsts: { maxAge: 63072000, includeSubDomains: true, preload: true },
    frameguard: { action: 'deny' },
});
```

#### S-05：error_logs.stack 生產環境過濾

Stack trace 包含內部路徑與套件資訊，生產環境不應儲存：

```typescript
// apps/web/src/shared/errors/errorHandler.ts
export async function logError(error: AppError | Error, ctx: ErrorContext) {
    await errorLogRepo.save({
        error_code:   error instanceof AppError ? error.code : 'INTERNAL_ERROR',
        http_status:  error instanceof AppError ? error.status : 500,
        message:      error.message,
        stack:        env.NODE_ENV === 'production' ? undefined : error.stack,
        user_id:      ctx.userId,
        spin_id:      ctx.spinId,
        request_path: ctx.path,
        request_id:   ctx.requestId,
        metadata:     ctx.meta,
    });
}
```

同時 API 回傳給 client 的 error response **永遠不含 stack**：

```typescript
// error response 結構（production）
// { "error": "WALLET_NOT_FOUND", "message": "Wallet not found", "requestId": "xxx" }
// 不含 stack、不含 DB table 名稱、不含 Supabase URL
```

#### S-06：JWT Algorithm 明確指定（防 alg:none 攻擊）

所有 JWT verify 呼叫必須明確指定 algorithm，拒絕 `alg: none`：

```typescript
// apps/web/src/adapters/supabase/SupabaseAuthAdapter.ts
// Supabase Auth 預設使用 RS256（安全），但驗 JWT 時仍需指定

// 若使用 CustomJWTAuthAdapter：
jwt.sign(payload, env.JWT_SECRET, {
    algorithm: 'HS256',   // 明確指定
    expiresIn: '15m',
});

jwt.verify(token, env.JWT_SECRET, {
    algorithms: ['HS256'],  // 白名單，禁止 alg:none、RS256 混用
});
```

JWT_SECRET 長度要求加入 env.ts validation：

```typescript
// config/env.ts
JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
```

#### S-07：並發 Session 上限（每用戶最多 5 個有效 session）

```typescript
// AuthService.login()
async login(email: string, password: string): Promise<AuthTokens> {
    // ... verify credentials ...

    // 計算現有有效 sessions
    const activeSessions = await sessionRepo.countActive(userId);
    if (activeSessions >= 5) {
        // 撤銷最舊的 session（LRU）
        await sessionRepo.revokeOldest(userId);
    }

    // 建立新 session
    const session = await sessionRepo.create({ userId, ... });
    return issueTokens(userId, session.id);
}
```

```sql
-- ISessionRepository 新增方法的 SQL
-- countActive
SELECT COUNT(*) FROM user_sessions
WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > NOW();

-- revokeOldest
UPDATE user_sessions
SET revoked_at = NOW()
WHERE id = (
    SELECT id FROM user_sessions
    WHERE user_id = $1 AND revoked_at IS NULL
    ORDER BY created_at ASC
    LIMIT 1
);
```

#### S-08：Spin Replay Ownership 驗證

```typescript
// apps/web/src/adapters/controllers/gameController.ts（replay route）
app.get('/api/v1/game/:spinId/replay', { preHandler: [requireAuth] }, async (req, reply) => {
    const { spinId } = req.params as { spinId: string };
    const spinLog = await spinLogRepo.findById(spinId);

    if (!spinLog) throw new AppError('SPIN_NOT_FOUND', 404);

    // Ownership check：player 只能看自己的 spin
    if (req.user.role === 'player' && spinLog.userId !== req.user.userId) {
        throw new AppError('FORBIDDEN', 403);
    }
    // admin / auditor 可看任何 spin（role check 已在 requireAuth 完成）

    return reply.status(200).send(spinLog.spinOutcome);
});
```

---

### P2 — Medium（Phase 2A 開發期間補上）

#### S-09：Redis Auth & TLS

**Upstash（Demo）**：已有 HTTPS REST API + token auth（`UPSTASH_REDIS_REST_TOKEN`），天然安全。

**Local Dev Redis container**：需設密碼與網路隔離：

```yaml
# infra/k8s/overlays/dev/redis-deployment.yaml
containers:
  - name: redis
    image: redis:7-alpine
    command: ['redis-server', '--requirepass', '$(REDIS_PASSWORD)', '--bind', '0.0.0.0']
    env:
      - name: REDIS_PASSWORD
        valueFrom:
          secretKeyRef:
            name: dev-secrets
            key: redis-password
```

**Production ElastiCache**：啟用 in-transit encryption（TLS）+ at-rest encryption + VPC 隔離，不對外開放 port 6379。

`ICacheAdapter` 連線字串格式需包含 TLS：

```typescript
// RedisCacheAdapter（production）
const redis = new Redis({
    url:      env.REDIS_URL,          // rediss:// 前綴 = TLS
    password: env.REDIS_PASSWORD,
    tls:      env.NODE_ENV === 'production' ? {} : undefined,
});
```

#### S-10：Rate Limit 補強（User-level Auth 防 IP 輪換）

目前只有 `rate:auth:{ip}`，IPv6 rotation / VPN 可繞過。補加 user-level 鎖定：

```typescript
// 新增 Redis key：rate:auth:email:{hash(email)}  TTL 60s  limit 10
// 與 rate:auth:{ip} 並行，兩者任一超限都觸發 429

async function checkAuthRateLimit(ip: string, email: string): Promise<void> {
    const emailHash = crypto.createHash('sha256').update(email).digest('hex').slice(0, 16);
    const [ipCount, emailCount] = await redis.pipeline()
        .incr(`rate:auth:${ip}`)
        .incr(`rate:auth:email:${emailHash}`)
        .exec();

    // 設 TTL（第一次呼叫時）
    if (ipCount[1] === 1)    await redis.expire(`rate:auth:${ip}`, 60);
    if (emailCount[1] === 1) await redis.expire(`rate:auth:email:${emailHash}`, 60);

    if ((ipCount[1] as number) > 10 || (emailCount[1] as number) > 10) {
        throw new AppError('RATE_LIMITED', 429);
    }
}
```

同時更新 Redis cache schema（§9-F）新增 key：

```
│ rate:auth:email:{hash} │ Counter │ 60s │ User-level auth rate limit（補 IP 繞過）│
```

#### S-11：wallets.currency 加 CHECK 約束

```sql
-- 新增 migration：20260328000010_wallet_currency_check.sql
ALTER TABLE wallets
    ADD CONSTRAINT wallet_currency_valid
    CHECK (currency IN ('USD', 'TWD'));
-- 未來新增幣別時，更新此 migration 或加新 migration
```

#### S-12：Admin 端點額外防護

Phase 2 無正式 admin 介面，但 `/admin/*` API 仍需保護：

```typescript
// apps/web/src/infrastructure/fastify/hooks/requireAdminAuth.ts
export async function requireAdminAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    await requireAuth(req, reply);                  // 一般 JWT 驗證

    if (req.user.role !== 'admin' && req.user.role !== 'auditor') {
        throw new AppError('FORBIDDEN', 403);
    }

    // Phase 2：IP Allowlist（可設為 ENV 變數，Render 內網 IP 或開發者 IP）
    const allowedIPs = env.ADMIN_ALLOWED_IPS?.split(',') ?? [];
    if (allowedIPs.length > 0 && !allowedIPs.includes(req.ip ?? '')) {
        throw new AppError('FORBIDDEN', 403, 'Admin access restricted by IP');
    }
}
```

```bash
# .env.local / GitHub Environment secret
ADMIN_ALLOWED_IPS=203.0.113.1,10.0.0.0/8   # 開發者 IP + 內網
# 空值 = 不限制（Phase 2 demo 可暫時空白，上線前填入）
```

#### S-13：GET /admin/users 防全量枚舉

```typescript
// 強制 search 參數不可為空（至少 3 個字元）
const AdminUsersQuerySchema = z.object({
    search: z.string().min(3, 'search must be at least 3 characters'),
    limit:  z.number().int().min(1).max(50).default(20),
    cursor: z.string().optional(),
});

// Response 不含 password_hash（絕不）、不含 ip_address（player 隱私）
interface AdminUserListItem {
    id:       string;
    username: string;
    email:    string;        // admin 可見
    role:     string;
    status:   string;
    createdAt: string;
    // ❌ password_hash — 永不回傳
    // ❌ ip_address — 不回傳（防 PII 暴露）
}
```

#### S-14：JSONB 欄位大小限制

```typescript
// SpinService — 寫 spin_log 前檢查 outcome 大小
const outcomeJson = JSON.stringify(outcome);
if (outcomeJson.length > 65_536) {   // 64KB 上限
    // 記錄告警但仍允許 spin（不影響遊戲）
    await errorLogRepo.save({
        error_code: 'OUTCOME_SIZE_WARNING',
        message: `spin_outcome size ${outcomeJson.length} bytes exceeds warning threshold`,
        spin_id: spinId,
        metadata: { size: outcomeJson.length },
    });
}

// Deposit metadata JSONB 限制
const DepositSchema = z.object({
    // ...
    metadata: z.record(z.unknown()).optional()
        .refine(m => !m || JSON.stringify(m).length < 4096, 'metadata too large'),
});
```

---

### P3 — Low（上線後補充）

#### S-15：忘記密碼 — 防帳號枚舉

```typescript
// POST /api/v1/auth/password/forgot
// 無論 email 是否存在，永遠回傳 200 OK + 相同 message
app.post('/api/v1/auth/password/forgot', async (req, reply) => {
    const { email } = ForgotPasswordSchema.parse(req.body);

    // 即使 user 不存在也不 throw，靜默處理
    const user = await userRepo.findByEmail(email);
    if (user) {
        await authService.sendPasswordResetEmail(user.id, email);
    }
    // 不管 user 是否存在，回傳相同 response
    return reply.status(200).send({
        message: 'If this email is registered, a reset link has been sent.'
    });
    // ❌ 禁止: if (!user) throw new AppError('EMAIL_NOT_FOUND', 404)
});
```

#### S-16：Leaderboard 隱私保護

```typescript
// leaderboard:win:daily Sorted Set 的 member 不使用 userId，改用 anonymized token
const anonId = crypto.createHash('sha256')
    .update(`${userId}:${dailyLeaderboardSalt}`)
    .digest('hex')
    .slice(0, 16);
await redis.zadd('leaderboard:win:daily', totalWin, anonId);
// dailyLeaderboardSalt 每日輪換，確保無法跨日追蹤
```

#### S-17：Dependency 掃描加入 CI

```yaml
# .github/workflows/ci.yml — 在 test job 加入
- name: Audit dependencies
  run: pnpm audit --audit-level=high
  # 高危漏洞直接失敗 CI；中危產生警告
```

#### S-18：Docker 非 Root 用戶

```dockerfile
# apps/web/Dockerfile
FROM node:22-alpine AS base
WORKDIR /app

# ... build steps ...

FROM base AS production
# 切換為非 root 用戶
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 fastify
USER fastify

EXPOSE 3000
CMD ["node", "dist/app.js"]
```

---

### Security Checklist 摘要（上線 Gate）

| # | 項目 | 等級 | 狀態 | 驗證方式 |
|---|------|:----:|:----:|---------|
| S-01 | Mock provider 生產封鎖 | 🔴 P0 | ⬜ | unit test: provider=mock + NODE_ENV=production → 403 |
| S-02 | SeededRNGProvider 生產硬封鎖 | 🔴 P0 | ⬜ | unit test: constructor in production → throw |
| S-03 | spin_logs 完整性補償（user 存在驗證 + 定期 reconcile）| 🔴 P0 | ⬜ | integration test: spin with deleted user → 404 |
| S-04 | HTTP 安全 Headers（CSP/HSTS/X-Frame）| 🟠 P1 | ⬜ | curl -I https://demo.render.com \| grep headers |
| S-05 | error_logs stack 生產過濾 | 🟠 P1 | ⬜ | unit test: NODE_ENV=production → stack=undefined |
| S-06 | JWT alg 白名單（防 alg:none）| 🟠 P1 | ⬜ | unit test: alg:none token → 401 |
| S-07 | Session 上限（≤5 active per user）| 🟠 P1 | ⬜ | integration test: 6th login → oldest revoked |
| S-08 | Replay ownership check | 🟠 P1 | ⬜ | E2E: user A 讀 user B 的 spinId → 403 |
| S-09 | Redis Auth + TLS（local dev + production）| 🟡 P2 | ⬜ | `redis-cli -a $PWD ping` 成功 |
| S-10 | Auth rate limit 補強（email-level）| 🟡 P2 | ⬜ | unit test: 11 次同 email auth → 429 |
| S-11 | wallets.currency CHECK 約束 | 🟡 P2 | ⬜ | migration: INSERT currency='XXX' → error |
| S-12 | Admin IP Allowlist middleware | 🟡 P2 | ⬜ | unit test: disallowed IP → 403 |
| S-13 | GET /admin/users 強制 search≥3 | 🟡 P2 | ⬜ | unit test: search='' → 400 |
| S-14 | JSONB 大小限制（64KB）| 🟡 P2 | ⬜ | unit test: outcome > 64KB → warning log |
| S-15 | 忘記密碼防枚舉（永遠 200）| 🟢 P3 | ⬜ | unit test: 不存在 email → 200 same message |
| S-16 | Leaderboard 匿名化 | 🟢 P3 | ⬜ | code review: no userId in sorted set member |
| S-17 | pnpm audit 加入 CI | 🟢 P3 | ⬜ | ci.yml: `pnpm audit --audit-level=high` |
| S-18 | Docker 非 root 用戶 | 🟢 P3 | ⬜ | `docker inspect` → User != root |

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

## 11. Clean Architecture 規範

### 11-A. 層次結構與依賴規則

```
┌──────────────────────────────────────────────────┐
│  Infrastructure / Frameworks & Drivers           │
│  Fastify app.ts · server.ts · CryptoRNGProvider  │
│  SupabaseAuthAdapter · UpstashCacheAdapter        │
└────────────────────┬─────────────────────────────┘
                     │ implements interfaces
┌────────────────────▼─────────────────────────────┐
│  Interface Adapters                              │
│  Controllers（Fastify route handlers ≤15 lines） │
│  requireAuth / requireAdminIp preHandlers        │
│  Repository implementations（Supabase/Redis）    │
└────────────────────┬─────────────────────────────┘
                     │ calls
┌────────────────────▼─────────────────────────────┐
│  Use Cases（Application Business Rules）         │
│  SpinUseCase · DepositUseCase · LoginUseCase…    │
│  每個 Use Case 只依賴 Domain interfaces          │
└────────────────────┬─────────────────────────────┘
                     │ uses
┌────────────────────▼─────────────────────────────┐
│  Domain（Enterprise Business Rules）             │
│  WalletEntity · SpinEntity · AuthUser            │
│  IWalletRepository · IAuthProvider · ICacheAdapter│
│  IRNGProvider · IProbabilityProvider             │
└──────────────────────────────────────────────────┘
```

**依賴規則（Dependency Rule）**：所有 import 只能往內層指，不得反向。Infrastructure 不得被 Domain 或 Use Case import。

### 11-B. 目錄結構

```
apps/web/src/
├── domain/
│   ├── entities/           # 有 invariants 的 Domain 物件
│   │   ├── WalletEntity.ts
│   │   └── SpinEntity.ts
│   └── interfaces/         # Ports（抽象介面）
│       ├── IAuthProvider.ts
│       ├── IWalletRepository.ts
│       ├── ISpinLogRepository.ts
│       ├── ICacheAdapter.ts
│       ├── IProbabilityProvider.ts
│       └── IRNGProvider.ts
├── usecases/               # 一個 Use Case = 一個 execute() 方法
│   ├── auth/               # Register / Login / Refresh / Logout
│   ├── wallet/             # GetWallet / Deposit / Withdraw / GetTransactions
│   └── game/               # GetBetRange / Spin / Replay
├── adapters/
│   ├── controllers/        # Fastify route handlers（純 HTTP 轉換，≤15 行/handler）
│   ├── repositories/       # Supabase 實作（排除單元測試覆蓋）
│   └── cache/              # NullCacheAdapter / UpstashCacheAdapter
├── infrastructure/
│   ├── fastify/            # app.ts（plugin 註冊）/ server.ts（entry point）
│   ├── rng/                # CryptoRNGProvider / SeededRNGProvider
│   └── config/             # env.ts（Zod schema）
├── shared/
│   ├── errors/             # AppError / errorHandler（回傳 plain object，非 HTTP 物件）
│   └── engine/             # slotEngine.ts（Cocos bridge，排除覆蓋）
└── container.ts            # Composition Root
```

### 11-C. Domain Entity 要求

每個 Entity 必須封裝不變式（Invariants），不能是純 DTO：

```typescript
// WalletEntity — 必須有以下方法：
canDebit(amount: Decimal): boolean         // balance >= amount
assertCanDebit(amount: Decimal): void      // throws AppError.insufficientFunds()
assertDepositLimit(amount: Decimal): void  // throws AppError.validation() 超限
assertWithdrawMin(amount: Decimal): void   // throws AppError.validation() 低於最低
static fromRow(row: WalletRow): WalletEntity
```

### 11-D. Use Case 要求

每個 Use Case 必須：
- 有明確的 `Input` / `Output` DTO interface
- 透過 constructor 注入所有依賴（不直接呼叫 `container`）
- 單一 `execute(input: Input): Promise<Output>` 方法
- 不 import 任何 Fastify / HTTP 物件
- 100% 可單元測試（純 mock 依賴）

```typescript
// 範例：SpinUseCase
class SpinUseCase {
  constructor(
    private walletRepo: IWalletRepository,
    private spinLogRepo: ISpinLogRepository,
    private probabilityProvider: IProbabilityProvider,
    private cache: ICacheAdapter,
    private rng: IRNGProvider,
  ) {}
  async execute(input: SpinInput): Promise<SpinOutput> { ... }
}
```

所有業務邏輯（bet 驗證、lock 取得、debit/credit、spin log）集中在 execute() 內，不外漏至 Controller。

### 11-E. Controller 要求

每個 Fastify route handler 函式 **≤ 15 行**，只做：
1. 從 `request.body` / `request.params` / `request.headers` 取值
2. 呼叫對應 Use Case 的 `execute()`
3. `reply.send(result)`

不允許有 if/else 業務判斷、不允許直接呼叫 Repository。

### 11-F. 測試覆蓋率要求

| 層次 | 測試方式 | 覆蓋率目標 |
|------|---------|-----------|
| Domain Entities | 純 unit test | 100% |
| Use Cases | 純 unit test（mock 依賴）| 100% |
| Controllers | `app.inject()` 整合測試 | 100% |
| errorHandler / AppError | 純 unit test | 100% |
| Fastify app.ts | `app.inject()` smoke test | 100% |
| Supabase adapters | 排除（需真實 DB）| 整合測試覆蓋 |
| UpstashCacheAdapter | 排除（需真實 Redis）| 整合測試覆蓋 |
| slotEngine.ts | 排除（需 Cocos runtime）| — |
| server.ts | 排除（只呼叫 listen）| — |

**全域 Jest threshold：branches ≥ 90%，functions/lines/statements = 100%**

---

## 12. CI/CD 整合

Phase 2 採 3 workflow 設計（詳見 §9-K-4）：

| Workflow | 觸發 | 內容 | 時限 |
|----------|------|------|:----:|
| `ci.yml` | 所有 PR / push | lint + test + build + migration dry-run + docker smoke | < 10 分鐘 |
| `db-migrate.yml` | push to main | supabase link + db push | < 3 分鐘 |
| `deploy-demo.yml` | push to main | test → migrate → Render deploy → Cloudflare Pages → smoke test | < 15 分鐘 |

**Phase 1 CI（現有，保留）**：

| 觸發時機 | 執行內容 | 時限 |
|---------|---------|:----:|
| 每次 Push | `npx jest --no-coverage --testPathIgnorePatterns=rtp` | < 5 分鐘 |
| 每日 Build | 全部 tests（含 RTP 百萬 spin）| < 30 分鐘 |
| Release 前 | k6 1,000VU 峰值壓測 + RTP audit | < 2 小時 |

---

## 12. 決策記錄

| 決策 | 選擇 | 理由 |
|------|------|------|
| Interface vs Abstract Class | Interface | 零 runtime overhead，易 mock |
| SlotEngine 共用方式 | 直接 import（同一 TS package）| Server/Client 跑完全相同機率邏輯，防分歧 |
| 後端框架 | **Fastify v5**（純 API server）| 高併發：~30,000 req/s（Next.js ~5,000）；原生 TypeScript；`app.inject()` 使測試無需 mock HTTP；@fastify/helmet 取代 next.config.ts headers；Cocos 靜態檔透過 @fastify/static 服務 |
| Session 存儲 | Redis + PostgreSQL | Redis for locks/TTL，PostgreSQL for durable data |
| Production RNG | 純 `crypto.randomBytes()`（per-value，無 PRNG 層）| 每個隨機值直接來自 OS entropy；最高安全等級；可審計（rng_bytes 存 spin_log）|
| Test RNG | SeededRNGProvider（mulberry32 + seed）| 確定性重現，覆蓋率 100% |
| RNG Provider | IRNGProvider DI（container.ts 注入）| Production CSPRNG / Test Seeded，零程式碼差異 |
| API 版本 | URL `/v1/` + Header `Accept-Version`（URL 優先）| URL 為主要隔離，Header 提供靈活覆蓋 |
| Admin 後台 | Phase 2 無；未來 Vue | 開發資源集中在遊戲核心 |
| 前端 Hosting | nginx（Cocos static）+ Fastify API（同 K8s cluster）| 開發：各自獨立 Pod（NodePort）；Production：Render 同 origin serve |
| Supabase 隱藏 | Client 不感知；SDK 限 API server；回傳 DTO | 資安：避免 DB 連線資訊洩漏 |
| 測試覆蓋率 | Server unit test 100% coverage | TDD；每個 Route Handler / Service / Adapter 完整覆蓋 |
| Mock Provider 封鎖 | production 環境拒絕 `provider=mock`（S-01）| Gaming compliance：禁止無限注資 |
| Seeded RNG 封鎖 | `SeededRNGProvider` 構造函式生產環境 throw（S-02）| Gaming compliance：禁止可預測 RNG |
| HTTP Security Headers | `@fastify/helmet` plugin 全域加 CSP/HSTS/X-Frame（S-04）| OWASP A05 Security Misconfiguration；取代 next.config.ts |
| JWT alg 白名單 | `algorithms: ['HS256']`，禁 `alg:none`（S-06）| OWASP A02 Cryptographic Failures |
| Session 上限 | 每用戶最多 5 個有效 session，LRU 淘汰（S-07）| 防帳號共用 / token 洩漏擴散 |
| Admin IP Allowlist | `ADMIN_ALLOWED_IPS` ENV 控制，空值不限（S-12）| Admin API 額外保護層 |
| Leaderboard 匿名化 | dailySalt hash，不存 userId（S-16）| GDPR / 玩家隱私 |
| `gs` singleton 廢棄 | Phase 1 步驟 1-D 後漸進替換 | 減少 merge conflict 風險 |
| 壓測工具 | k6 | JS 腳本易寫，CI 整合，支援 threshold 斷言 |

---

## 13. 不在本次範圍

- WebSocket 即時推播（多人榜單）
- Admin 後台（預計 Phase 3，Vue）
- 真實支付閘道（Phase 2 使用 MockPaymentService）
- 手機 App（Cocos Native）build
- 多語系 i18n
- KYC / 合規文件
- Kubernetes 生產叢集（Phase 2 Demo 用 Render 單機）

---

*文件版本：v7.1 | 更新日期：2026-03-28*
*整合來源：EDD v6.1 + Clean Architecture 規範 + Fastify 重構決策（2026-03-29）*
*參考：GDD_Thunder_Blessing_Slot.md | Probability_Design.md*
*Security Review：18 項安全強化（S-01~S-18），詳見 §9-O*
*Phase 2A 進度：16/16 ✅ 全部完成（2A-11 integration tests、2A-13 Cocos remote adapters、2A-14 E2E API tests）*
