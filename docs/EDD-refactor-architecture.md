# EDD — Thunder Blessing Slot：架構重構設計文件

**文件版本**：v3.0  
**日期**：2026-03-25  
**狀態**：Phase 1.5B 完成 | Phase 2 規劃中  
**作者**：工程團隊

> **本文件涵蓋兩個重構階段。**  
> Phase 1：單機版 MVC + DI 重構，建立可測試的架構基礎。  
> Phase 2：Client-Server 架構，支援 1,000 人同時在線，含壓測與 RTP 一致性驗證。  
> **兩個階段均嚴格執行 Unit Test → Integration Test → E2E Test 三層測試紀律。**

---

## 1. 背景與動機

### 1.1 現況問題

目前專案為 Cocos Creator 3.8 單機版 Web Slot 遊戲，程式碼位於 `assets/scripts/`。  
自上線以來功能持續疊加（Cascade、Thunder Blessing、Free Game、Buy FG、Auto Spin、Coin Toss），  
導致以下嚴重架構債：

| 問題 | 嚴重度 | 影響 |
|------|--------|------|
| `GameBootstrap.ts` God Class（50KB / 1,400+ 行）：流程 + UI 建構 + 金額全混 | 高 | 無法單元測試流程邏輯 |
| `gs` 全域 singleton，所有模組直接 `import { gs }` | 高 | 無法 mock、無法多 session |
| `gs.balance -= totalBet` 散落於前端流程中 | 高 | 改 server 版時金額驗證不可信任 |
| `WinChecker.ts` 與 `SlotEngine.checkWins()` 邏輯重複 | 中 | 雙重維護，兩份邏輯容易分歧 |
| `cascadeLoop` / `freeGameLoop` 強耦合 Cocos `tween` / `await` | 中 | Flow 邏輯無法在 Node.js 純跑及測試 |
| `REEL_STRIP` 在 `GameConfig` module load 時執行隨機洗牌（副作用） | 低 | 每次 import 結果不同，seeded 測試不穩定 |

### 1.2 需求驅動

| 需求 | 說明 |
|------|------|
| 改為 Server 版 | 機率計算移至後端，前端只做動畫渲染；帳號金額由後端授權 |
| 1,000 人同時在線 | 後端需無狀態橫向擴展；每個 spin 獨立 session |
| 可維護性 | 每個模組職責單一，可獨立測試與熱插拔替換 |
| 合規考量 | 線上博弈需後端驗證每局結果，防止客戶端篡改 |
| RTP 一致性 | 單機版與 Server 版使用同一份 `SlotEngine`，RTP 結果可重現驗證 |

---

## 2. 現有架構分析

### 2.1 模組現況

```
assets/scripts/
├── GameBootstrap.ts   50 KB  ← God Class：場景建構 + 遊戲流程 + 金額 + 面板 ⚠️
├── SlotEngine.ts      13 KB  ← 機率核心，純 TS，最乾淨 ✅
├── GameConfig.ts       7 KB  ← 常數定義（REEL_STRIP 有 module-load 副作用）⚠️
├── ReelManager.ts     34 KB  ← 動畫/渲染，直讀全域 gs ⚠️
├── UIController.ts     4 KB  ← 顯示控制，直讀全域 gs ⚠️
├── GameState.ts        3 KB  ← 全域 singleton `gs`，所有模組共用 ⚠️
└── WinChecker.ts       3 KB  ← 與 SlotEngine.checkWins() 邏輯完全重複 ⚠️
```

### 2.2 依賴關係圖（現況）

```
GameBootstrap（God Class）
  ├── import { gs }          ← 全域狀態直接讀寫
  ├── new SlotEngine()       ← 機率核心（已隔離）
  ├── ReelManager            ← spinWithGrid / cascade / flashWinCells
  ├── UIController           ← refresh / showWinPop / setStatus
  └── WinChecker.calcWinAmount ← 重複邏輯

ReelManager  → import { gs }（讀寫 gs.grid, gs.currentRows, gs.lightningMarks）
UIController → import { gs }（讀 gs.balance, gs.inFreeGame, gs.fgMultiplier）

測試：GameFlow.e2e / UIButtons.e2e 測試需要 Cocos mock 環境
```

### 2.3 測試現況（重構前基準）

| 測試檔案 | 數量 | 類型 | 狀態 |
|---------|------|------|------|
| `SlotEngine.unit.test.ts` | ~80 | Unit | ✅ 通過 |
| `WinChecker.unit.test.ts` | ~70 | Unit | ✅ 通過（與 SlotEngine 重複） |
| `SlotEngine.integration.test.ts` | ~50 | Integration | ✅ 通過 |
| `GameFlow.e2e.test.ts` | ~20 | E2E | ✅ 通過 |
| `UIButtons.e2e.test.ts` | ~17 | E2E | ✅ 通過 |
| **合計** | **237** | | **全部通過** |

> **黃金規則**：每個 Phase 完成後執行 `npx jest --no-coverage`，237 tests 必須全部維持通過。

---

## 3. 測試紀律（全程適用）

### 3.1 三層測試定義

```
Unit Test
  ─ 測試單一類別/函式，所有外部依賴全部 mock
  ─ 不 import Cocos、不啟動 server、不用 fs
  ─ 執行時間 < 100ms/test
  ─ 工具：Jest + TypeScript mock

Integration Test  
  ─ 測試兩個以上真實模組組合，僅 mock 外部邊界（DB、HTTP、Cocos）
  ─ 例：GameFlowController + LocalEngineAdapter + LocalAccountService
  ─ 執行時間 < 500ms/test

E2E Test
  ─ 從實際入口模擬完整玩家行為
  ─ Phase 1：用現有 cc.ts mock 驅動完整 spin flow
  ─ Phase 2：真實 HTTP 呼叫（可用 supertest / k6）
  ─ 執行時間允許較長
```

### 3.2 每個新模組的測試要求

| 模組 | Unit | Integration | E2E |
|------|------|-------------|-----|
| `LocalAccountService` | debit/credit 邊界、餘額不足例外 | 搭配 GameFlowController | - |
| `GameSession` | 狀態轉換（enterFG/exitFG/expandRows） | 搭配 LocalAccountService | - |
| `LocalEngineAdapter` | SpinRequest→SpinResponse 欄位映射 | 搭配 SlotEngine × 1,000 spin | - |
| `GameFlowController` | mock 所有 interface，驗呼叫順序 | 全部 local impl 組合 | 完整 spin→cascade→FG flow |
| `RemoteEngineAdapter`（Phase 2）| mock fetch | mock server response | 真實 HTTP 壓測 |
| `SpinController`（Phase 2）| mock AccountService + SlotEngine | DB + Engine 整合 | k6 壓測 |

### 3.3 測試命名規範

```
describe('ClassName / function name')
  it('should [行為] when [條件]')
  it('should throw [錯誤] when [邊界]')

// 例：
describe('LocalAccountService')
  it('should debit correctly on valid amount')
  it('should throw InsufficientFundsError when balance < amount')
  it('should credit and round to 2 decimal places')
```

---

## 4. Phase 1：MVC + DI 重構（單機版）

### 4.1 架構目標

將現有 God Class 解構為清晰的 MVC 分層：

```
View（Cocos Components）
  ├── ReelManager     ← 動畫：spin / cascade / flash
  ├── UIController    ← 顯示：balance / win / status
  └── SceneBuilder    ← 場景建構：buildScene / buildPanels

Controller（純 TypeScript，無 Cocos 依賴）
  └── GameFlowController ← 遊戲流程：doSpin / cascadeLoop / freeGameLoop
      注入：IGameSession + IAccountService + IEngineAdapter
           IReelManager + IUIController

Model（純 TypeScript，無 Cocos 依賴）
  ├── GameSession       ← 遊戲狀態（替換全域 gs）
  ├── LocalAccountService ← 帳號餘額（單機版）
  └── LocalEngineAdapter  ← 包裝 SlotEngine（單機版）

Core（純 TypeScript，不動）
  ├── SlotEngine        ← 機率引擎（RNG injectable）
  └── GameConfig        ← 常數（移除副作用）
```

### 4.2 目標目錄結構

```
assets/scripts/
│
├── contracts/                    ← 純 Interface（Client/Server 共用合約）
│   ├── IAccountService.ts
│   ├── IEngineAdapter.ts
│   ├── IGameSession.ts
│   ├── IReelManager.ts
│   ├── IUIController.ts
│   └── types.ts                  ← SpinRequest, SpinResponse, WinLine, CascadeStep
│
├── core/                         ← 純 TS，零框架依賴，Node.js 可直接執行
│   ├── GameConfig.ts             (改：移除 REEL_STRIP 洗牌副作用)
│   ├── SlotEngine.ts             (不動)
│   └── GameSession.ts            (新：實作 IGameSession，替換全域 gs)
│
├── services/                     ← 業務服務層（可替換實作）
│   ├── LocalAccountService.ts    (新：單機版餘額管理)
│   └── LocalEngineAdapter.ts     (新：包裝 SlotEngine，實作 IEngineAdapter)
│
├── controllers/                  ← 遊戲流程（純 TS，可 unit test）
│   └── GameFlowController.ts     (從 GameBootstrap 拆出)
│
├── components/                   ← Cocos Components（只做 View）
│   ├── ReelManager.ts            (改：不再 import gs，改用注入 IGameSession)
│   ├── UIController.ts           (改：同上)
│   └── SceneBuilder.ts           (從 GameBootstrap 拆出 buildScene 部分)
│
└── GameBootstrap.ts              (大幅瘦身 ~60 行，只做 DI wiring)
```

### 4.3 Interface 設計

#### IAccountService
```typescript
export interface IAccountService {
    getBalance(): number;
    canAfford(amount: number): boolean;
    debit(amount: number): void;
    credit(amount: number): void;
}
```

#### IGameSession
```typescript
export interface IGameSession {
    readonly grid:            SymType[][];
    readonly currentRows:     number;
    readonly inFreeGame:      boolean;
    readonly fgMultiplier:    number;
    readonly fgMultIndex:     number;
    readonly lightningMarks:  ReadonlySet<string>;
    readonly cascadeCount:    number;
    readonly totalBet:        number;
    readonly extraBetOn:      boolean;

    setGrid(g: SymType[][]): void;
    expandRows(): void;
    resetRows(): void;
    resetRound(): void;
    enterFreeGame(multIndex: number): void;
    exitFreeGame(): void;
    addMark(r: number, row: number): void;
    clearMarks(): void;
    setExtraBet(on: boolean): void;
    setBetPerLine(v: number): void;
    computeTotalBet(): void;
}
```

#### IEngineAdapter
```typescript
export interface SpinRequest {
    totalBet:     number;
    extraBet:     boolean;
    inFreeGame:   boolean;
    fgMultIndex:  number;
    marks:        string[];
}

export interface SpinResponse {
    grid:         SymType[][];
    cascadeSteps: CascadeStep[];
    tbStep?:      TBStep;
    totalWin:     number;
    fgTriggered:  boolean;
    finalRows:    number;
    maxWinCapped: boolean;
    newMarks:     string[];
}

export interface IEngineAdapter {
    spin(req: SpinRequest): Promise<SpinResponse>;
}
```

#### IReelManager（供 GameFlowController 呼叫）
```typescript
export interface IReelManager {
    spinWithGrid(grid: SymType[][], fgMode?: boolean): Promise<void>;
    cascade(winCells: CellPos[], newRows: number, newSyms: Map<string, SymType>): Promise<void>;
    flashWinCells(wins: WinLine[]): Promise<void>;
    refreshAllMarks(): void;
    reset(): void;
}
```

#### IUIController
```typescript
export interface IUIController {
    refresh(): void;
    setStatus(msg: string, color?: string): void;
    showWinPop(stepWin: number, roundWin: number): void;
    enableSpin(enabled: boolean): void;
    showBuyPanel(): Promise<boolean>;
    showCoinToss(isFGContext: boolean, headsProb?: number): Promise<boolean>;
    showTotalWin(amount: number): Promise<void>;
    showThunderBlessing(): Promise<void>;
    updateExtraBetUI(): void;
    updateFreeLetters(rows: number, fourthE?: boolean): void;
    updateMultBar(activeIdx: number): void;
    showFGBar(idx: number): void;
    hideFGBar(): void;
}
```

### 4.4 GameFlowController 設計

```typescript
// controllers/GameFlowController.ts
// 純 TypeScript，無任何 import from 'cc'
export class GameFlowController {
    constructor(
        private session: IGameSession,
        private account: IAccountService,
        private adapter: IEngineAdapter,
        private reel:    IReelManager,
        private ui:      IUIController,
    ) {}

    async doSpin(): Promise<void> { ... }
    async cascadeLoop(response: SpinResponse): Promise<void> { ... }
    async freeGameLoop(): Promise<void> { ... }
    async buyFreeGame(): Promise<void> { ... }
}
```

> GameFlowController **不知道** Cocos 存在；`IReelManager.spinWithGrid()` 回傳 `Promise<void>`，  
> 在單機版由真實 Cocos 動畫驅動，在測試中由 mock 立即 resolve。

### 4.5 GameBootstrap（重構後）

```typescript
// GameBootstrap.ts（重構後，~60 行）
@ccclass('GameBootstrap')
export class GameBootstrap extends Component {
    start() {
        view.setDesignResolutionSize(CANVAS_W, CANVAS_H, ResolutionPolicy.SHOW_ALL);

        // ── Model ──────────────────────────────────
        const session = new GameSession(DEFAULT_BALANCE, DEFAULT_BET);
        const account = new LocalAccountService(session);
        const engine  = new SlotEngine();
        const adapter = new LocalEngineAdapter(engine);

        // ── View（Cocos Components）────────────────
        const reelArea = new Node('ReelArea');
        this.node.addChild(reelArea);
        const reelMgr = reelArea.addComponent(ReelManager);
        reelMgr.init(session);

        const uiNode = new Node('UIPanel');
        this.node.addChild(uiNode);
        const uiCtrl = uiNode.addComponent(UIController);
        uiCtrl.init(session, account);

        // ── Controller ─────────────────────────────
        const flow = new GameFlowController(session, account, adapter, reelMgr, uiCtrl);

        // ── Scene（純建構，不含邏輯）───────────────
        new SceneBuilder(this.node, session, flow, reelMgr, uiCtrl).build();
    }
}
```

### 4.6 Phase 1 執行步驟（嚴格依序，每步跑完測試）

| 步驟 | 內容 | 全程測試要求 |
|------|------|-------------|
| 1-A | 合併 WinChecker 至 SlotEngine；刪除 WinChecker.ts | 237 pass |
| 1-B | 移除 `REEL_STRIP` 洗牌副作用至 SlotEngine constructor | 237 pass |
| 1-C | 新增 `contracts/` 全部 Interface（無實作，只有型別）| 237 pass |
| 1-D | 新增 `GameSession.ts`（實作 IGameSession），新增 Unit Tests | 237 + new pass |
| 1-E | 新增 `LocalAccountService.ts`，新增 Unit Tests | 237 + new pass |
| 1-F | 修改 `UIController`：改用注入 IGameSession + IAccountService | 237 pass |
| 1-G | 修改 `ReelManager`：改用注入 IGameSession | 237 pass |
| 1-H | 抽 `SceneBuilder`：從 GameBootstrap 搬出 buildScene 部分 | 237 pass |
| 1-I | 新增 `LocalEngineAdapter.ts`，新增 Unit + Integration Tests | 237 + new pass |
| 1-J | 抽 `GameFlowController`：搬移 doSpin（先）→ cascadeLoop → freeGameLoop | 237 pass |
| 1-K | 瘦身 `GameBootstrap.ts`（剩 DI wiring ~60 行）| 237 pass |
| 1-L | 新增 GameFlowController Integration Tests | 237 + new pass |
| 1-M | 更新 E2E Tests（驗證介面仍然正確工作）| 全部 pass |

### 4.7 Phase 1 新增測試目標

```
tests/
├── unit/
│   ├── SlotEngine.unit.test.ts          (原有，擴充覆蓋 WinChecker 案例)
│   ├── GameSession.unit.test.ts         (新增)
│   ├── LocalAccountService.unit.test.ts (新增)
│   └── LocalEngineAdapter.unit.test.ts  (新增)
│
├── integration/
│   ├── SlotEngine.integration.test.ts   (原有)
│   ├── GameFlow.integration.test.ts     (新增：FlowController + Local實作)
│   └── AccountFlow.integration.test.ts  (新增：debit/credit 完整流程)
│
└── e2e/
    ├── GameFlow.e2e.test.ts             (原有，調整為使用新介面)
    └── UIButtons.e2e.test.ts            (原有，調整為使用新介面)
```

### 4.8 Phase 1 執行結果（2026-03-21）

> **狀態：✅ 全部 13 步驟完成，384 tests 全部通過。**

#### 4.8.1 步驟完成狀態

| 步驟 | 內容 | 狀態 |
|------|------|------|
| 1-A | 合併 WinChecker 至 SlotEngine；刪除 WinChecker.ts | ✅ 完成 |
| 1-B | 移除 `REEL_STRIP` 洗牌副作用至 SlotEngine constructor | ✅ 完成 |
| 1-C | 新增 `contracts/` 全部 Interface | ✅ 完成 |
| 1-D | 新增 `GameSession.ts` + Unit Tests（29 tests） | ✅ 完成 |
| 1-E | 新增 `LocalAccountService.ts` + Unit Tests（15 tests） | ✅ 完成 |
| 1-F | 修改 `UIController`：改用注入 IGameSession + IAccountService | ✅ 完成 |
| 1-G | 修改 `ReelManager`：改用注入 IGameSession | ✅ 完成 |
| 1-H | 抽 `SceneBuilder`：從 GameBootstrap 搬出 buildScene 部分 | ✅ 完成 |
| 1-I | 新增 `LocalEngineAdapter.ts` + Unit（12）+ Integration Tests | ✅ 完成 |
| 1-J | 抽 `GameFlowController`：doSpin → cascadeLoop → freeGameLoop | ✅ 完成 |
| 1-K | 瘦身 `GameBootstrap.ts`（54 行，DI wiring only） | ✅ 完成 |
| 1-L | 新增 GameFlowController + AccountFlow Integration Tests | ✅ 完成 |
| 1-M | 更新 E2E Tests，介面驗證正確 | ✅ 完成 |

#### 4.8.2 架構成果（重構後）

```
assets/scripts/
├── contracts/                    ← 6 個 Interface（新增）
│   ├── IAccountService.ts
│   ├── IEngineAdapter.ts
│   ├── IGameSession.ts
│   ├── IReelManager.ts
│   ├── IUIController.ts
│   └── types.ts
│
├── core/                         ← 純 TS，零框架依賴（新增）
│   ├── GameSession.ts            (新增：實作 IGameSession，替換全域 gs)
│   └── GameFlowController.ts     (從 GameBootstrap 拆出，~400 行純邏輯)
│
├── services/                     ← 可替換業務層（新增）
│   ├── LocalAccountService.ts    (新增：實作 IAccountService)
│   └── LocalEngineAdapter.ts     (新增：實作 IEngineAdapter，包裝 SlotEngine)
│
├── components/                   ← Cocos Components，只做 View（新增）
│   └── SceneBuilder.ts           (從 GameBootstrap 拆出)
│
├── GameBootstrap.ts              ✅ 54 行（從 1,400+ 行瘦身 96%）
├── ReelManager.ts                ✅ 改用 IGameSession 注入，消除 gs 直讀
├── UIController.ts               ✅ 改用 IGameSession + IAccountService 注入
├── SlotEngine.ts                 ✅ 已整合 WinChecker 邏輯，副作用移除
├── GameConfig.ts                 ✅ REEL_STRIP 副作用移除
└── WinChecker.ts                 ✅ 已刪除（邏輯統一至 SlotEngine）
```

#### 4.8.3 測試結果（重構後，2026-03-21）

| 測試檔案 | 數量 | 類型 | 說明 |
|---------|------|------|------|
| `SlotEngine.unit.test.ts` | 50 | Unit | 原有（含 WinChecker 邏輯整合） |
| `WinChecker.unit.test.ts` | 99 | Unit | 原有（對照組保留） |
| `FGMultiplier.unit.test.ts` | 25 | Unit | 新增 |
| `GameSession.unit.test.ts` | 29 | Unit | 新增（Step 1-D） |
| `LocalAccountService.unit.test.ts` | 15 | Unit | 新增（Step 1-E） |
| `LocalEngineAdapter.unit.test.ts` | 12 | Unit | 新增（Step 1-I） |
| `GameFlowController.unit.test.ts` | 23 | Unit | 新增（Step 1-J） |
| `SlotEngine.integration.test.ts` | 20 | Integration | 原有 |
| `AccountFlow.integration.test.ts` | 24 | Integration | 新增（Step 1-L） |
| `GameFlow.integration.test.ts` | 19 | Integration | 新增（Step 1-L） |
| `GameFlow.e2e.test.ts` | 28 | E2E | 原有（介面更新） |
| `UIButtons.e2e.test.ts` | 40 | E2E | 原有（介面更新） |
| **合計** | **384** | | ✅ **全部通過** |

> **重構前：237 tests → 重構後：384 tests（+147，全部通過，零回歸）**

#### 4.8.4 關鍵指標對比

| 指標 | 重構前 | 重構後 | 改善 |
|------|--------|--------|------|
| `GameBootstrap.ts` 行數 | 1,400+ 行 | 54 行 | **-96%** |
| `import { gs }` 直讀模組數 | 3（ReelManager + UIController + GameBootstrap）| 0 | **消除** |
| 全域 singleton 耦合 | 全面依賴 `gs` | 零 `gs` 直讀，全改 DI 注入 | **消除** |
| 邏輯重複模組 | WinChecker ＋ SlotEngine 各維護一份 | 統一至 SlotEngine | **消除** |
| 可 Unit Test 的流程邏輯 | 0（GameBootstrap 強耦合 Cocos）| GameFlowController 100% 可測 | ✅ |
| 測試數量 | 237 | 384 | **+62%** |
| 測試通過率 | 100% | 100% | **維持** |

---

## 4A. Phase 1.5：錢包 DI + 配獎分佈 + Bug Fix（2026-03-25）

### 4A.1 IWalletService — 錢包抽象化

#### 問題
原 `IAccountService` 的 `debit()` / `credit()` 被 Controller 在 cascade 動畫中逐步呼叫，
造成兩個問題：
1. **斷線不安全**：動畫播到一半斷線，部分 credit 已入帳、部分未入帳
2. **UI 餘額跳動**：實際帳務和 UI 顯示混在一起，表演期間餘額數字不自然

#### 設計：帳務層 vs UI 顯示層分離

```
IWalletService（帳務層 — 立即生效，斷線安全）
├── LocalWalletService      ← Phase 1 單機版（同步，記憶體）
├── RemoteWalletService     ← Phase 2 client-server（非同步，呼叫 server API）
└── ThirdPartyWalletService ← Phase 3 第三方整合

IUIController.setDisplayBalance()（UI 顯示層 — 跟隨動畫）
├── spin 開始：顯示 actualBalance - wagered
├── cascade 中：顯示 startBalance + accumulatedWin（遞增動畫）
├── spin 結束：同步到 actualBalance（snap to actual）
```

#### IWalletService 介面

```typescript
interface SpinTx {
    txId:      string;
    wagered:   number;
    timestamp: number;
}

interface IWalletService {
    getBalance(): number;
    canAfford(amount: number): boolean;
    beginSpin(wagered: number): SpinTx;          // 立即扣款
    completeSpin(tx: SpinTx, totalWin: number): number;  // 立即入帳
    getPendingTx(): SpinTx | null;               // 斷線復原
    debit(amount: number): void;    // @deprecated
    credit(amount: number): void;   // @deprecated
}
```

#### Spin 流程時序（改後）

```
1. Controller.canAfford(wagered) → 確認餘額
2. Controller.beginSpin(wagered) → wallet 立即扣款，回傳 SpinTx
3. UI.setDisplayBalance(actualBalance) → 顯示扣款後餘額
4. Engine.fullSpin() → 取得 FullSpinOutcome（所有結果已決定）
5. UI 表演動畫（純視覺，不動帳務）
   ├── cascade 中：UI.setDisplayBalance(startBal + accumulatedWin)
   └── FG 中：同上
6. Controller.completeSpin(tx, totalWin) → wallet 立即入帳
7. UI.setDisplayBalance(finalBalance) → 同步最終餘額
```

**斷線安全分析**：
- 步驟 2 完成：扣款已入帳，server 可偵測到未完成交易（getPendingTx）
- 步驟 4 完成：引擎結果已計算，可重送
- 步驟 6 完成：入帳已完成，即使 UI 沒播完也不影響帳務

#### 向後相容

GameFlowController 建構子新增可選的 `wallet?: IWalletService` 參數。
若未提供，fallback 到舊版 `IAccountService` 行為。
現有所有測試無需改動（不注入 wallet 即走舊路徑）。

### 4A.2 FREE 字母亮燈 Bug Fix

#### 問題
Cascade 展開 rows 到 MAX_ROWS（雲推開），第 4 個 "E" 亮起，
但 `FG_TRIGGER_PROB` (20%) 沒通過 → FG 沒進入。
玩家看到「雲都推開了但沒進 FG」的矛盾體驗。

#### 原因
原碼：
```typescript
if (spin.fgTriggered || spin.finalRows >= MAX_ROWS) {
    this._ui.updateFreeLetters(MAX_ROWS, true);  // 永遠 true
}
```
`fourthE=true` 無條件傳入，不管 FG 是否真的觸發。

#### 修正
```typescript
const fgWillTrigger = o.fgSpins.length > 0;  // 看實際結果
if (spin.finalRows >= MAX_ROWS || spin.fgTriggered) {
    this._ui.updateFreeLetters(MAX_ROWS, fgWillTrigger);  // 有 FG 才亮第 4 盞
}
```

效果：
- FG 觸發：F-R-E-E 全亮 → coin toss 儀式 → 進入 FG
- FG 未觸發：F-R-E 亮（第 4 盞不亮）→ 玩家理解「差一點」

#### 測試覆蓋
新增 unit test：`updateFreeLetters(MAX_ROWS, false) when rows reach MAX but FG does NOT trigger`

### 4A.3 配獎分佈分析框架

#### 從 SCALE 模型轉向配獎分佈模型

**舊方式（SCALE 模型）**：
- 用 `PAYTABLE_SCALE`、`BUY_FG_PAYOUT_SCALE`、`EB_PAYOUT_SCALE` 全域乘數調 RTP
- 問題：影響所有 bracket 比例，無法精細控制體感

**新方式（配獎分佈模型）**：
1. 定義 win brackets（如 GDD math sheet）
2. 跑 Monte Carlo 模擬，測量各 bracket 出現比例
3. 調整個別情境觸發比例（FG_TRIGGER_PROB、cascade 展開率、符號權重）
4. 用 0 獎比例控制 RTP（目標 60-70% 0 獎 → 97.5% RTP）

#### Win Brackets（GDD 規格）

| Bracket | 定義 | 說明 |
|---------|------|------|
| 0 | win = 0 | 無獎 |
| (0, 1) | 0 < win/wagered < 1 | 低於本金 |
| [1, 2) | 1 ≤ win/wagered < 2 | 小贏 |
| [2, 5) | 2 ≤ win/wagered < 5 | 中贏 |
| [5, 10) | 5 ≤ win/wagered < 10 | 大贏 |
| [10, 20) | | 巨贏 |
| [20, 50) | | Mega |
| [50, 100) | | Super |
| [100, 200) | | Ultra |
| [200, 500) | | Epic |
| [500, 1000) | | Legendary |
| [1000, 2000) | | Mythic |
| [2000, 5000) | | Godlike |
| >= 5000 | | Jackpot |

#### 分析工具

```
# 獨立執行（產出完整報告）
npx ts-node tests/analysis/WinDistribution.analysis.ts 500000

# Jest 測試（CI 驗證 bracket 比例在合理範圍）
npx jest tests/integration/WinDistribution.test.ts
```

輸出範例（Main Game, 100k spins）：
```
  Main Game — 100,000 spins
  RTP:              97.805%
  Game Hit Rate:    32.60%
  0-Win Rate:       67.40%
  FG Trigger Rate:  1.69%

  Bracket          Count     Rate    MG      FG   AvgMult   Dist%  CumDist%  RTP%
  0                67400   67.40%  67400      0     0.00      -       -      0.00%
  (0, 1)           20932   20.93%  20922     10     0.36   64.21%   64.21%   7.50%
  [1, 2)            4206    4.21%   4182     24     1.42   12.90%   77.11%   5.99%
  [2, 5)            3669    3.67%   3531    138     3.15   11.25%   88.37%  11.54%
  ...
```

#### 調機率流程

```
1. 觀察各 bracket 的 Dist% → 這是「有獎分佈」的 100%
2. 用 0獎比例 控制 RTP（目標 60-70% 0獎 → 97.5% RTP）
3. 如果要提高 RTP：減少 0獎比例（更多 spin 有獎）
4. 如果要降低 RTP：增加 0獎比例（更多 spin 無獎）
5. 調整手段：FG_TRIGGER_PROB、cascade 展開率、符號權重
6. 不用全域 SCALE 乘數（影響所有 bracket 比例）
```

#### 當前配獎分佈觀察（v3.0）

| 模式 | RTP | 0獎比例 | 體感評估 |
|------|-----|---------|----------|
| Main Game | 97.8% | 67.4% | ✓ 合理（60-70%） |
| Buy FG | 98.7% | 0% | 正常（付 100× 保證 FG） |
| Extra Bet | 96.4% | 70.3% | ⚠ 偏高，建議調整 |

### 4A.4 新增檔案清單

| 檔案 | 類型 | 說明 |
|------|------|------|
| `contracts/IWalletService.ts` | Interface | 錢包抽象介面 |
| `services/LocalWalletService.ts` | 實作 | 單機版錢包（Phase 1） |
| `tests/analysis/WinDistribution.analysis.ts` | 分析工具 | 配獎分佈報告產生器 |
| `tests/integration/WinDistribution.test.ts` | 測試 | 配獎分佈 CI 驗證 |

### 4A.5 修改檔案清單

| 檔案 | 變更 |
|------|------|
| `contracts/IUIController.ts` | 新增 `setDisplayBalance(balance: number)` |
| `core/GameFlowController.ts` | 注入 `IWalletService`，spin 流程改為 beginSpin/completeSpin，cascade 中不呼叫 credit |
| `UIController.ts` | 實作 `setDisplayBalance`，`refresh()` 支援 displayBalance fallback |
| `GameBootstrap.ts` | 注入 `LocalWalletService` |
| 所有 test mocks | 新增 `setDisplayBalance: jest.fn()` |

### 4A.6 測試結果（Phase 1.5, 2026-03-25）

| 測試檔案 | 數量 | 狀態 |
|---------|------|------|
| Unit Tests（全部） | ~200 | ✅ 通過 |
| Integration Tests（全部） | ~100 | ✅ 通過 |
| E2E Tests（全部） | ~80 | ✅ 通過 |
| WinDistribution.test.ts | 17 | ✅ 通過 |
| **合計** | **464+** | ✅ **全部通過** |

---

## 4B. Phase 1.5B：Buy Free Game 配獎優化（2026-03-25）

### 4B.1 需求

1. Buy FG 用 100× BET 購買，配獎分佈以 **基礎 BET 倍數** 為單位分析
2. 至少回 20× BET（20% 保底），避免花大錢得零頭
3. 驚喜放在 > 100× BET，期待放在 100×–30000× BET
4. 30000× BET MAX WIN 機率需高於 Main Game FG（否則沒有購買動機）
5. 調高 (20, 100) bracket 獎項配置，RTP 控制在 97.5% ±0.5%

### 4B.2 設計變更

#### 新增常數（`GameConfig.ts`）

```typescript
// Buy FG 最低保底：20× BET（花 100× 至少拿回 20×）
export const BUY_FG_MIN_WIN_MULT = 20;

// Buy FG 專屬 Coin Toss（大幅提升 tier 到達率）
export const COIN_TOSS_HEADS_PROB_BUY = [0.35, 0.25, 0.15, 0.08];

// 配合新 tier 分佈重新校準
export const BUY_FG_PAYOUT_SCALE = 1.87;  // (原 3.448)
```

#### 引擎變更（`SlotEngine.ts`）

- `_determineFGTier(isBuyFG)`: Buy FG 使用 `COIN_TOSS_HEADS_PROB_BUY`
- `computeFullSpin`: Buy FG 結算時加入 minimum floor `totalWin >= BUY_FG_MIN_WIN_MULT × totalBet`
- 保底在 SCALE 之後、MAX_WIN cap 之前應用

### 4B.3 Tier 到達率比較

| Tier | 倍率 | 輪數 | Main Game | Buy FG | 倍率差 |
|------|------|------|-----------|--------|--------|
| 0 | ×3 | 8 | 85.00% | 65.00% | 0.8× |
| 1 | ×7 | 12 | 13.50% | 26.25% | 1.9× |
| 2 | ×17 | 20 | 1.43% | 7.44% | 5.2× |
| 3 | ×27 | 20 | 0.07% | 1.21% | 16.4× |
| 4 | ×77 | 20 | 0.0015% | 0.105% | **70×** |

### 4B.4 Buy FG 配獎分佈（100 萬轉, BET 倍數）

| Bracket(BET×) | 出現率% | 出現頻率 | 平均倍數 | RTP 貢獻% |
|---------------|---------|----------|----------|-----------|
| 0 | 0% | — | — | 0% |
| (0, 20) | 0% | — | — | 0% |
| [20, 100) | 76.90% | 1:1.3 | 38.64 | 29.71% |
| [100, 200) | 12.15% | 1:8.2 | 139.15 | 16.91% |
| [200, 500) | 7.66% | 1:13.1 | 308.27 | 23.61% |
| [500, 1000) | 2.64% | 1:37.8 | 682.29 | 18.03% |
| [1000, 2000) | 0.58% | 1:171 | 1,271.07 | 7.43% |
| [2000, 5000) | 0.06% | 1:1,751 | 2,757.73 | 1.57% |
| [5000, 10000) | 0.003% | 1:32,258 | 6,291.88 | 0.20% |
| [10000, 30000) | rare | — | — | — |
| **合計 RTP** | | | | **97.46%** |

### 4B.5 30000× MAX WIN 可達性分析

- Tier 4 (×77, 20 rounds) 每輪需 10.42× BET raw win（正常均值的 32 倍）
- 2M 次 Buy FG 實測最高: **11,777× BET**（tier 4, 67 次 ≥5000×）
- Main FG 2M 次: 最高 1,006× BET（tier 3 止）,0 次到達 tier 4
- **結論**: Buy FG 到達 tier 4 的機率為 Main Game 的 70×，30000× BET 在數學上可達，需 10M+ 次才會出現

### 4B.6 修改檔案清單

| 檔案 | 變更內容 |
|------|---------|
| `GameConfig.ts` | 新增 `BUY_FG_MIN_WIN_MULT`, `COIN_TOSS_HEADS_PROB_BUY`; 修改 `BUY_FG_PAYOUT_SCALE` |
| `SlotEngine.ts` | `_determineFGTier(isBuyFG)` 參數化; `computeFullSpin` 加 min floor |
| `BetLevelRTP.test.ts` | 更新 Buy FG 模擬（使用 Buy 專屬 coin toss + floor） |
| `ThreeMode.rtp.test.ts` | 同上 |
| `FullGameRTP.simulation.test.ts` | 同上 |
| `ProbabilityCore.unit.test.ts` | 新增 `COIN_TOSS_HEADS_PROB_BUY` 驗證 |
| `BuyFGFlow.unit.test.ts` | 新增 minimum floor 驗證 |
| `BuyFG.distribution.ts` | 新建: Buy FG BET 倍數分佈分析工具 |
| `MaxWin.analysis.ts` | 新建: 30000× MAX WIN 可達性分析 |
| `ThreeMode.parallel.ts` | 新建: 三模式平行 RTP + 分佈報告 |

### 4B.7 測試結果（Phase 1.5B, 2026-03-25）

| 測試項目 | 數量 | 狀態 |
|---------|------|------|
| Unit Tests | ~210 | ✅ 通過 |
| Integration Tests | ~110 | ✅ 通過 |
| E2E Tests | ~80 | ✅ 通過 |
| **合計** | **549** | ✅ **全部通過** |

**RTP 驗證（2M spins × 10 seeds）**:

| 模式 | RTP | 0-win% | 備註 |
|------|-----|--------|------|
| Main Game | 97.86% | 67.5% | ✅ ±0.5% |
| Buy FG | 97.46% | 0% | ✅ ±0.5% |
| Extra Bet | 97.67% | 68.4% | ✅ ±0.5% |

---

## 5. Phase 2：Client-Server 架構

### 5.1 系統架構圖

```
                ┌─────────────────────────────────────────┐
                │           CLIENT (Cocos Web)             │
                │  GameBootstrap                           │
                │    └─ RemoteEngineAdapter → POST /spin   │
                │    └─ RemoteAccountService → GET /balance│
                │  GameFlowController / ReelManager / UI   │
                │                   ← 完全不動             │
                └─────────────────┬───────────────────────┘
                                  │ HTTPS
                ┌─────────────────▼───────────────────────┐
                │          Nginx Load Balancer             │
                └──────┬──────────────────┬───────────────┘
                       │                  │
            ┌──────────▼────┐   ┌─────────▼──────┐
            │ App Server #1  │   │ App Server #2   │  （可橫向擴展）
            │ Node.js+Fastify│   │ Node.js+Fastify │
            └──────────┬────┘   └─────────┬───────┘
                       └─────────┬─────────┘
                                 │
                ┌────────────────▼──────────────────────────────┐
                │            Redis Cluster（Hot Cache Layer）     │
                │                                               │
                │  balance:{uid}    TTL 5 min   ← 讀快取        │
                │  session:{uid}    TTL 30 min  ← 遊戲狀態快取  │
                │  spin:lock:{uid}  TTL 30 s    ← 分散式鎖      │
                │  rate:{uid}       TTL 1 s     ← 速率限制      │
                │                                               │
                │  ▸ 讀取優先從 Redis；若 miss → 穿透讀 DB      │
                │  ▸ 寫入：先寫 DB，再更新 Redis               │
                │  ▸ Redis 故障時自動降級，僅用 DB 完成         │
                └────────────────┬──────────────────────────────┘
                                 │ write-through（非阻塞路徑）
                ┌────────────────▼──────────────────────────────┐
                │              PostgreSQL（Source of Truth）     │
                │                                               │
                │  accounts        (balance, currency)          │
                │  user_sessions   (marks, fg_state, rows)      │
                │  spin_audit_log  (每局押注/獲獎紀錄)           │
                └───────────────────────────────────────────────┘
```

**延遲目標**

| 路徑 | p50 | p95 | p99 | 說明 |
|------|-----|-----|-----|------|
| 正常（Redis 命中）| < 30ms | < 100ms | < 300ms | 1,000 VU 同時在線 |
| 降級（Redis 故障）| < 150ms | < 500ms | < 1,000ms | 純 DB，仍可用 |

### 5.2 Phase 2 前端改動（最小化）

Phase 1 完成後，前端只需新增兩個 Adapter：

```typescript
// services/RemoteEngineAdapter.ts
export class RemoteEngineAdapter implements IEngineAdapter {
    constructor(
        private baseUrl: string,
        private getToken: () => string,
    ) {}

    async spin(req: SpinRequest): Promise<SpinResponse> {
        const res = await fetch(`${this.baseUrl}/api/v1/spin`, {
            method:  'POST',
            headers: {
                'Content-Type':  'application/json',
                'Authorization': `Bearer ${this.getToken()}`,
            },
            body: JSON.stringify(req),
        });
        if (!res.ok) throw new SpinError(res.status, await res.json());
        return res.json();
    }
}

// services/RemoteAccountService.ts
export class RemoteAccountService implements IAccountService {
    // balance 快取，server 回傳 newBalance 時同步更新
    private _balance = 0;

    async syncBalance(): Promise<void> {
        const res = await fetch(`${this.baseUrl}/api/v1/balance`, {
            headers: { 'Authorization': `Bearer ${this.getToken()}` },
        });
        const data = await res.json();
        this._balance = data.balance;
    }

    getBalance()           { return this._balance; }
    canAfford(amt: number) { return this._balance >= amt; }
    debit(_amt: number)    { /* 實際扣款由 server 完成，此處為 optimistic UI */ }
    credit(_amt: number)   { /* server 回傳 newBalance 後由 RemoteEngineAdapter 更新 */ }
}
```

**GameBootstrap 切換 Server 版**（Phase 1 完成前提下，只改 wiring）：
```typescript
// 單機版
const adapter = new LocalEngineAdapter(new SlotEngine());
const account = new LocalAccountService(session);

// Server 版（只要改這兩行）
const account = new RemoteAccountService(API_URL, getAuthToken);
const adapter = new RemoteEngineAdapter(API_URL, getAuthToken);
```

### 5.3 後端 API 設計

#### POST /api/v1/spin

**Request**:
```json
{
  "totalBet":    0.25,
  "extraBet":    false,
  "inFreeGame":  false,
  "fgMultIndex": 0,
  "marks":       ["1,2", "3,0"],
  "sessionId":   "sess_abc123"
}
```

**Response**:
```json
{
  "grid":         [["P1","L2","W","P3","SC","L4"], ...],
  "cascadeSteps": [...],
  "tbStep":       null,
  "totalWin":     1.25,
  "fgTriggered":  false,
  "finalRows":    3,
  "maxWinCapped": false,
  "newMarks":     ["0,1", "2,2"],
  "newBalance":   998.75,
  "spinId":       "spin_xyz789",
  "serverTime":   1742534400000
}
```

**Error Codes**:
| HTTP Status | Code | 說明 |
|-------------|------|------|
| 402 | `INSUFFICIENT_FUNDS` | 餘額不足 |
| 401 | `UNAUTHORIZED` | JWT 失效 |
| 429 | `RATE_LIMITED` | 超過每秒請求限制 |
| 409 | `SESSION_CONFLICT` | 同一 session 有未完成 spin |
| 500 | `ENGINE_ERROR` | 引擎運算異常 |

#### GET /api/v1/balance

**Response**:
```json
{
  "balance":    998.75,
  "currency":   "CREDIT",
  "updatedAt":  1742534400000
}
```

### 5.4 後端 SpinController 設計

**最佳化 Spin Flow（單一 DB 原子操作 + Redis 快取讀）**

```
步驟  │ 動作                                              │ 時間（估算）
──────┼───────────────────────────────────────────────────┼─────────────
  ①  │ spin:lock NX EX 30（Redis）                       │  ~1ms
     │   → 已存在 → 回傳 409 SESSION_CONFLICT             │
  ②  │ Redis pipeline GET balance:{uid}, session:{uid}   │  ~1ms
     │   → Redis miss → 穿透讀 DB → 回填 Redis           │  ~1 or 20ms
     │   → balance < totalBet → 回傳 402（預判，非授權）  │
  ③  │ simulateSpin(session)                             │  ~5ms
     │   → 機率引擎純計算，無 I/O                         │
  ④  │ DB 原子更新（單一 round-trip）                     │  ~15ms
     │   UPDATE accounts                                 │
     │     SET balance = balance + ($win - $totalBet)    │
     │     WHERE id = $uid AND balance >= $totalBet      │
     │     RETURNING balance                             │
     │   → 0 rows → 回傳 402（授權扣款失敗，真實餘額不足）│
  ⑤  │ Redis pipeline SET balance:{uid}, session:{uid}   │  ~1ms
     │   （更新快取，TTL 重置）                           │
  ⑥  │ Audit queue enqueue（async, fire-and-forget）     │  ~0ms
     │   → Worker 批次寫入 spin_audit_log，不在請求路徑   │
  ⑦  │ spin:lock DEL（Redis）                            │  ~1ms
     │ → return SpinResponse                             │
──────┴───────────────────────────────────────────────────┴─────────────
 正常總計（Redis 命中）：~24ms 計算 + 網路 → p99 ≤ 300ms
```

```typescript
// server/controllers/SpinController.ts
export class SpinController {
    constructor(
        private engine:  SlotEngine,
        private cache:   ISpinCache,      // Redis cache layer（可 mock）
        private db:      IAccountStore,   // PostgreSQL（Source of Truth）
        private audit:   IAuditQueue,     // 非同步審計佇列
    ) {}

    async handleSpin(userId: string, req: SpinRequest): Promise<SpinResponse> {
        // ① 分散式鎖（防快速重複點擊）
        const locked = await this.cache.acquireLock(userId);
        if (!locked) throw new SessionConflictError();

        try {
            // ② 快取讀取（Redis → DB fallback）
            const [balance, session] = await this.cache.getPlayerState(userId)
                ?? await this.db.loadPlayerState(userId);  // cache miss

            // 預判：節省一次 DB roundtrip（非授權，DB 仍會做最終驗證）
            if (balance < req.totalBet) throw new InsufficientFundsError();

            // ③ 機率引擎（純計算，~5ms）
            const result = this.engine.simulateSpin({
                totalBet:       req.totalBet,
                extraBet:       req.extraBet,
                inFreeGame:     session.inFreeGame,
                fgMultiplier:   FG_MULTIPLIERS[session.fgMultIndex],
                lightningMarks: new Set(session.marks),
            });

            // ④ 原子 DB 更新（單一 round-trip，含授權扣款）
            const net = result.totalRawWin - req.totalBet;
            const newBalance = await this.db.atomicCredit(userId, net, req.totalBet);
            //   → throws InsufficientFundsError if balance < totalBet

            // ⑤ 更新 Redis 快取
            const newSession = deriveSession(session, result);
            await this.cache.setPlayerState(userId, newBalance, newSession);

            // ⑥ 非同步審計（不在請求路徑）
            this.audit.enqueue({ userId, req, result, newBalance });

            return { ...toSpinResponse(result), newBalance };

        } finally {
            // ⑦ 釋放鎖（即使例外也確保釋放）
            await this.cache.releaseLock(userId);
        }
    }
}
```

#### ISpinCache 介面（方便 mock 與降級）

```typescript
export interface ISpinCache {
    acquireLock(userId: string): Promise<boolean>;
    releaseLock(userId: string): Promise<void>;
    getPlayerState(userId: string): Promise<[balance: number, session: SessionState] | null>;
    setPlayerState(userId: string, balance: number, session: SessionState): Promise<void>;
}

// 正常實作：RedisSpinCache（使用 ioredis pipeline）
// 降級實作：NullSpinCache（所有 get 回傳 null，lock 用 DB advisory lock）
```

### 5.5 Session 防衝突設計

#### 正常路徑：Redis Distributed Lock

```
POST /spin
  → Redis SET spin:lock:{userId} 1 NX EX 30
  → 若已存在 → 回傳 409 SESSION_CONFLICT
  → spin 完成（finally 區塊）→ Redis DEL spin:lock:{userId}
```

前端 `RemoteEngineAdapter` 在收到 409 時等待 300ms 後 retry（最多 3 次）。

#### 降級路徑：Redis 故障時改用 PostgreSQL Advisory Lock

```sql
-- 取鎖（非阻塞）
SELECT pg_try_advisory_lock($userId::bigint);
-- 若回傳 false → 409（另一 spin 仍在進行）

-- 釋放鎖
SELECT pg_advisory_unlock($userId::bigint);
```

`NullSpinCache.acquireLock()` 內部呼叫 DB advisory lock，確保無 Redis 時邏輯完全一致。

### 5.6 1,000 人同時在線設計

#### 無狀態原則
- Application Server 無任何記憶體 session state
- 遊戲狀態（marks、fgMultIndex、currentRows）快取於 Redis，TTL 30 分鐘；同時在 PostgreSQL `user_sessions` 表持久化
- Redis 故障不影響資料正確性（DB 為 Source of Truth）
- 任何 instance 可處理任何 userId 的請求

#### 容量估算

| 指標 | 數值 | 說明 |
|------|------|------|
| 同時在線 | 1,000 人 | 目標 |
| 平均 spin 間隔 | 4 秒 | 含動畫時間 |
| 峰值 RPS | 250 req/s | 1,000 ÷ 4 |
| 安全目標 RPS | 500 req/s | 2× buffer |
| 單 spin 引擎時間 | < 5ms | simulateSpin 純計算 |
| **延遲目標（有 Redis）** | **p99 ≤ 300ms** | Redis 快取命中 |
| **延遲目標（降級）** | **p99 ≤ 1,000ms** | 純 DB，Redis 故障 |
| DB 並行連線需求 | ~20 conn | 250 RPS × 0.015s ÷ 3 instances |

#### 資源配置

```
Load Balancer (Nginx)
  ├── App Server × 3 (Node.js, 4 core, 8GB)
  │     每個 instance 處理 ~85 req/s 安全邊界
  │     DB connection pool: 20 per instance（共 60）
  ├── Redis Cluster × 3 nodes（Hot Cache Layer）
  │     balance / session / lock / rate-limit
  │     AOF 持久化開啟（防 Redis 重啟資料丟失）
  └── PostgreSQL（主從複製）
        主庫：debit/credit 原子更新
        從庫：audit log 查詢、RTP 統計
```

### 5.7 Redis Cache 策略

#### Key 命名空間與 TTL

| Key | 內容 | TTL | 策略 |
|-----|------|-----|------|
| `balance:{uid}` | 帳號餘額（Number）| 5 分鐘 | Read cache；每次 DB 寫入後同步更新 |
| `session:{uid}` | 遊戲狀態 JSON（marks, fgMultIndex, rowCount, inFG）| 30 分鐘 | 同上 |
| `spin:lock:{uid}` | 分散式鎖（值 = spinId）| 30 秒 | NX SET；finally DEL |
| `rate:{uid}` | 請求計數（INCR）| 1 秒 | 每秒 > 5 次 → 429 |

#### Read-Through（讀取流程）

```
getPlayerState(uid):
  1. Redis GET balance:{uid}, session:{uid}  （pipeline, ~1ms）
  2. 若任一 miss
     → DB SELECT balance, fg_state FROM accounts, user_sessions WHERE id = uid
     → Redis SET balance:{uid} / session:{uid}（回填快取）
  3. 回傳 [balance, session]
```

#### Write-Through（寫入流程）

```
DB atomicCredit() 成功後
  → Redis SET balance:{uid} {newBalance} EX 300
  → Redis SET session:{uid} {newSession} EX 1800
  （兩步 pipeline，~1ms，非阻塞）
```

> **金融資料一致性**：餘額的授權扣款**永遠以 DB 為準**（步驟 ④ 原子 UPDATE）。  
> Redis `balance:{uid}` 僅用於步驟 ② 的**預判快速失敗**，降低已知餘額不足時的 DB 壓力。  
> 即使快取與 DB 短暫不一致（Redis stale），最壞情況是讓玩家多一次 DB round-trip，結果永遠正確。

#### Redis 故障降級（Circuit Breaker）

```typescript
// 使用 opossum circuit breaker 監控 Redis 健康狀態
const redisBreaker = new CircuitBreaker(redisOperation, {
    timeout:          200,   // 200ms 無回應 → 視為故障
    errorThresholdPct: 50,   // 50% 失敗率 → 開路
    resetTimeout:      10000, // 10s 後嘗試半開
});

// SpinController 自動使用降級實作
const cache: ISpinCache = redisBreaker.opened
    ? new NullSpinCache(db)   // 降級：DB advisory lock + 無快取
    : new RedisSpinCache(redis);
```

**降級時 spin 完整流程（目標 p99 ≤ 1,000ms）**

```
① pg_try_advisory_lock(uid)                            ~5ms
② DB SELECT balance, session（無快取，直接讀）         ~20ms
   → balance < totalBet → 402
③ simulateSpin()                                       ~5ms
④ DB atomicCredit()                                   ~15ms
⑤ DB UPDATE user_sessions（同 transaction）           ~0ms（含在④）
⑥ Audit enqueue（async）                              ~0ms
⑦ pg_advisory_unlock(uid)                              ~2ms
   總計：~47ms 計算 + 網路 → p99 ≤ 1,000ms @ 1,000VU
```

---

## 6. 壓力測試計劃（Load Testing）

### 6.1 工具選型

| 工具 | 用途 |
|------|------|
| **k6** | 主要壓測工具（JS 腳本，CI 整合友善）|
| **autocannon** | 快速 throughput 驗證 |
| **clinic.js** | Node.js 效能瓶頸分析 |
| **Grafana + Prometheus** | 即時 RPS / latency / error rate 監控 |

### 6.2 壓測場景

#### Scenario 1：基本負載（200 VU）
```javascript
// load-test/scenarios/normal.js
import http from 'k6/http';
export const options = {
    scenarios: {
        normal: {
            executor: 'constant-vus',
            vus: 200,
            duration: '3m',
        },
    },
    thresholds: {
        http_req_duration: ['p95 < 100'],  // 95th percentile < 100ms
        http_req_failed:   ['rate < 0.01'], // error rate < 1%
    },
};
export default function () {
    const res = http.post(`${BASE_URL}/api/v1/spin`, spinPayload, { headers });
    check(res, { 'status 200': r => r.status === 200 });
    sleep(4); // simulate player think time
}
```

#### Scenario 2：峰值衝刺（1,000 VU，30 秒）
```javascript
export const options = {
    stages: [
        { duration: '10s', target: 1000 },  // ramp up
        { duration: '30s', target: 1000 },  // sustain peak
        { duration: '10s', target: 0   },   // ramp down
    ],
    thresholds: {
        http_req_duration: ['p99 < 500'],
        http_req_failed:   ['rate < 0.05'],
    },
};
```

#### Scenario 3：重複 Spin 衝突測試（驗 session lock）
```javascript
// 同一 userId 快速送出 3 個並行 spin
export default function () {
    const reqs = [
        ['POST', `${BASE_URL}/api/v1/spin`, ...],
        ['POST', `${BASE_URL}/api/v1/spin`, ...],
        ['POST', `${BASE_URL}/api/v1/spin`, ...],
    ];
    const resps = http.batch(reqs);
    const codes = resps.map(r => r.status).sort();
    // 預期：1 個 200, 2 個 409
    check(resps, { 'only one success': () => codes.filter(c => c === 200).length === 1 });
}
```

#### Scenario 4：Redis 故障降級測試

```javascript
// load-test/scenarios/redis-down.js
// 測試前：停止 Redis（docker stop redis）
export const options = {
    scenarios: {
        redis_down: {
            executor: 'constant-vus',
            vus: 200,
            duration: '2m',
        },
    },
    thresholds: {
        http_req_duration: ['p99 < 1000'],  // 降級 SLA：1 秒內
        http_req_failed:   ['rate < 0.01'],  // 功能不可中斷
    },
};
// 驗：服務仍正常運作，延遲上升但不超過 1s，無 500 error
```

### 6.3 合格標準

| 指標 | Scenario 1（200VU 正常）| Scenario 2（1,000VU 峰值）| Scenario 4（降級）|
|------|----------------------|--------------------------|------------------|
| RPS | ≥ 250 | ≥ 400 | ≥ 200 |
| p95 response time | < 100ms | < 200ms | < 700ms |
| p99 response time | < 300ms | < 300ms | < 1,000ms |
| Error rate | < 0.1% | < 1% | < 1% |
| DB connection pool | < 70% 使用率 | < 90% 使用率 | < 95% 使用率 |
| Redis cache hit rate | ≥ 95% | ≥ 90% | N/A（降級中）|

---

## 7. RTP 一致性驗證

### 7.1 目標

確保 Server 版的 `SlotEngine.simulateSpin()` 與單機版行為完全一致；  
長期 RTP 落在目標值 **97.5% ± 0.5%**（驗證 98.53%）。

### 7.2 Seeded RNG 驗證測試

```typescript
// tests/unit/SlotEngine.unit.test.ts（新增）
describe('SlotEngine seeded RNG reproducibility')
  it('should produce identical results with same seed')
  // 使用 xorshift64 deterministic RNG
  const seededRng = createSeededRng(42);
  const engine1 = new SlotEngine(seededRng.next.bind(seededRng));
  const engine2 = new SlotEngine(createSeededRng(42).next.bind(...));
  const r1 = engine1.simulateSpin({ totalBet: 1 });
  const r2 = engine2.simulateSpin({ totalBet: 1 });
  expect(r1).toEqual(r2); // 完全相同
```

### 7.3 百萬 Spin RTP 測試

```typescript
// tests/rtp/RTPValidation.rtp.test.ts
describe('RTP Validation (1,000,000 spins)')
  it('should achieve RTP within 97.0% ~ 99.0%')
    const engine = new SlotEngine(Math.random);
    let totalBet = 0, totalWin = 0;
    for (let i = 0; i < 1_000_000; i++) {
        const r = engine.simulateSpin({ totalBet: 1 });
        totalBet += 1;
        totalWin += r.totalRawWin;
    }
    const rtp = totalWin / totalBet;
    expect(rtp).toBeGreaterThan(0.970);
    expect(rtp).toBeLessThan(0.990);
```

> RTP 測試標記為 `@slow`，不含在每次 CI push，只在 weekly build 或 release 前執行。

### 7.4 Server vs Local 一致性測試

```typescript
// tests/integration/ServerLocalParity.test.ts
describe('Server/Local engine parity')
  it('should produce same totalWin distribution for same seed sequence')
    const seed = 12345;
    const localEngine  = new SlotEngine(createSeededRng(seed).next);
    const serverEngine = new SlotEngine(createSeededRng(seed).next); // 模擬 server 端

    const N = 10_000;
    const localWins  = [];
    const serverWins = [];
    for (let i = 0; i < N; i++) {
        localWins.push(localEngine.simulateSpin({ totalBet: 1 }).totalRawWin);
        serverWins.push(serverEngine.simulateSpin({ totalBet: 1 }).totalRawWin);
    }
    expect(localWins).toEqual(serverWins); // 每一局全部相同
```

### 7.5 押注總量一致性（Server 版額外）

每日排程任務驗證：

```
SUM(audit_log.totalBet) × RTP_TARGET
  ≈ SUM(audit_log.totalWin)
  ± 2σ（統計允許範圍）
```

---

## 8. Phase 2 後端測試計劃

### 8.1 Unit Tests（後端）

```
server/tests/unit/
  ├── SpinController.unit.test.ts
  │     - mock SlotEngine, AccountService, SessionManager
  │     - 驗：正常 spin flow
  │     - 驗：餘額不足 → InsufficientFundsError
  │     - 驗：session 鎖定衝突 → ConflictError
  │     - 驗：Math.random 可由測試注入
  │
  ├── AccountService.unit.test.ts
  │     - mock DB
  │     - 驗：debit/credit 的 DB transaction 邊界
  │     - 驗：concurrent debit race condition → 使用 DB row lock
  │
  └── SessionManager.unit.test.ts
        - mock Redis
        - 驗：lock/unlock 流程
        - 驗：lock 超時自動釋放（TTL）
```

### 8.2 Integration Tests（後端）

```
server/tests/integration/
  ├── SpinFlow.integration.test.ts
  │     - 使用真實 PostgreSQL（test container）
  │     - 使用真實 Redis（test container）
  │     - 驗：完整 debit → simulate → credit → audit 流程
  │     - 驗：DB balance 與 audit log 一致
  │
  └── ConcurrentSpin.integration.test.ts
        - 同一 userId 並行 10 個請求
        - 驗：只有 1 個成功，其餘 409
        - 驗：balance 正確（只扣一次押注）
```

### 8.3 E2E Tests（跨層）

```
tests/e2e/
  ├── ServerGameFlow.e2e.test.ts
  │     - 模擬完整玩家流程（登入 → spin → cascade → FG → collect）
  │     - 使用 supertest 打真實 HTTP
  │     - 驗：前端收到的 SpinResponse 所有欄位正確
  │
  └── LoadTest（k6 scripts，見 §6）
```

---

## 9. 工時估算

### Phase 1（單機版 MVC + DI）

| 步驟 | 內容 | 工時 |
|------|------|------|
| 1-A/B | 消除重複（WinChecker merge + REEL_STRIP 副作用）| 0.5 天 |
| 1-C | 建立 contracts/ Interface 定義 | 0.5 天 |
| 1-D | GameSession.ts + Unit Tests | 1 天 |
| 1-E | LocalAccountService.ts + Unit Tests | 0.5 天 |
| 1-F/G | UIController / ReelManager DI 改造 | 1.5 天 |
| 1-H | SceneBuilder 抽離 | 0.5 天 |
| 1-I | LocalEngineAdapter + Unit + Integration Tests | 1 天 |
| 1-J | GameFlowController 抽離 + Tests | 2 天 |
| 1-K/L/M | GameBootstrap 瘦身 + Integration + E2E 更新 | 1 天 |
| **合計** | | **8.5 天** |

### Phase 2（Client-Server）

| 步驟 | 內容 | 工時 |
|------|------|------|
| 2-A | RemoteEngineAdapter + RemoteAccountService | 1 天 |
| 2-B | 後端框架建立（Fastify + TypeScript + DI）| 1 天 |
| 2-C | SpinController + DB（atomicCredit、IAccountStore）+ Unit Tests | 2 天 |
| 2-D | ISpinCache 介面 + RedisSpinCache 實作（balance/session/lock）| 1.5 天 |
| 2-D' | NullSpinCache（DB fallback）+ Circuit Breaker 接線 + 降級 Tests | 1 天 |
| 2-E | 後端 Integration Tests（含 Redis-miss 穿透測試）| 2 天 |
| 2-F | E2E 跨層測試 | 1 天 |
| 2-G | k6 壓測（Scenario 1/2/4）+ tuning + 合格確認 | 2.5 天 |
| 2-H | RTP 一致性驗證（百萬 spin + Server parity）| 1 天 |
| 2-I | 部署配置（Nginx + PM2 cluster / Docker Compose + Redis AOF 設定）| 1 天 |
| **合計** | | **14 天** |

---

## 10. CI/CD 整合

### 每次 Push（< 5 分鐘）
```yaml
- npx jest --no-coverage --testPathIgnorePatterns=rtp
  # 必須全部 pass：unit + integration + e2e（排除 @slow）
```

### 每日 Build（< 30 分鐘）
```yaml
- npx jest --no-coverage
  # 包含 RTPValidation.rtp.test.ts（1M spin）
- k6 run load-test/scenarios/normal.js
  # 200 VU × 3 分鐘基本壓測
```

### Release 前（< 2 小時）
```yaml
- k6 run load-test/scenarios/peak.js
  # 1,000 VU 峰值壓測
- node server/tools/rtp-audit.js --days 7
  # 驗上週 RTP 是否在允許範圍
```

---

## 11. 決策記錄

| 決策 | 選擇 | 理由 |
|------|------|------|
| Interface vs Abstract Class | Interface | 零 runtime overhead，更易 mock，TS structural typing |
| SlotEngine 共用方式 | 直接 import（同一個 TypeScript package）| Server/Client 跑完全相同的機率邏輯，防止分歧 |
| 後端框架 | Fastify（建議）| 比 Express 快 2-3×，內建 schema validation，TypeScript 友善 |
| Session 存儲 | Redis + PostgreSQL | Redis for locks/TTL, PostgreSQL for durable balance/history |
| RNG at Server | `Math.random()` + seeded override for testing | server 端不信任 client RNG，所有 spin 由 server 產生 |
| `gs` singleton 廢棄時機 | Phase 1 步驟 1-D 後漸進替換 | 減少 merge conflict 風險，每步穩定後才繼續 |
| WinChecker 留存 | 刪除，統一用 SlotEngine | 避免邏輯分歧，SlotEngine 版本已覆蓋所有案例 |
| 壓測工具 | k6 | JS 腳本易寫，CI 整合，社群活躍，支援 threshold 斷言 |

---

## 12. 不在本次範圍

- WebSocket 即時推播（多人榜單）
- 後端框架最終選型（Fastify / NestJS / Express 皆可適配）
- 資料庫 Schema 完整設計
- 帳號系統 / KYC / 合規文件
- 多語系 i18n
- 手機 App（Cocos Native）build

