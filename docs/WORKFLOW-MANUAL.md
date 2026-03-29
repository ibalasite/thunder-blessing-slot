# Thunder Blessing Slot — 工作流操作手冊

> 使用 gstack + Claude Code 的 AI 輔助 20 人工程團隊開發流程
> 適用版本：Cocos Creator 3.8.7 + Fastify v5 + K8s

---

## 目錄

1. [環境確認](#1-環境確認)
2. [日常開發週期](#2-日常開發週期)
3. [新功能開發流程](#3-新功能開發流程)
4. [數學模型修改流程](#4-數學模型修改流程)
5. [Bug 調查流程](#5-bug-調查流程)
6. [前端 Cocos 開發流程](#6-前端-cocos-開發流程)
7. [後端 API 開發流程](#7-後端-api-開發流程)
8. [測試流程](#8-測試流程)
9. [安全審計流程](#9-安全審計流程)
10. [部署流程](#10-部署流程)
11. [週回顧](#11-週回顧)
12. [緊急情況處理](#12-緊急情況處理)
13. [Skill 快速參考](#13-skill-快速參考)

---

## 1. 環境確認

### 背景

每次開始工作前先確認環境正常，避免在壞掉的環境上浪費時間。Thunder Blessing 需要三個服務同時運行才能做完整測試：Supabase（資料庫）、Fastify API、Cocos build server。

### 確認清單

```bash
# 確認 K8s 正常
export PATH="$PATH:$HOME/.rd/bin"
kubectl get pods -n thunder-dev

# 確認 API 健康
curl -s http://localhost:30001/api/v1/health

# 確認 gstack 正常
cd ~/.claude/skills/gstack && ls bin/gstack-update-check
```

### 確認 gstack skills 可用

打開 Claude Code，在 thunder-blessing-slot 目錄下輸入：
```
/gstack-upgrade
```

看到版本資訊代表正常。如果失敗：
```bash
cd ~/.claude/skills/gstack && ./setup
```

---

## 2. 日常開發週期

### 背景

gstack 的核心概念是把軟體開發的 sprint 流程映射成 AI 指令。每個功能從「想清楚」到「上線」都有對應的 skill，而且每個 skill 的輸出會自動成為下一個 skill 的輸入。

### 標準開發節奏

```
早上：確認環境 → 看 /retro 了解昨天進度
↓
開始新任務：/office-hours 或直接 /plan-eng-review（如果已知要做什麼）
↓
實作（Claude 寫程式）
↓
下午：/review → /qa → /ship
↓
結束前：確認 PR 狀態
```

### 決策樹：我現在該用哪個 skill？

```
我不確定要做什麼
    └→ /office-hours

我知道要做什麼，但不確定怎麼做
    └→ /plan-eng-review

我要改數學模型（reel strip / paytable / RTP）
    └→ /careful 先開啟安全模式，然後 /plan-eng-review

我有一個 bug 要修
    └→ /investigate

程式碼已經寫好，要出 PR
    └→ /review → /qa → /ship

要改 UI
    └→ /design-review https://ibalasite.github.io/thunder-blessing-slot/

要上線
    └→ /ship → /land-and-deploy → /canary
```

---

## 3. 新功能開發流程

### 背景

Thunder Blessing 有兩個開發層面：**遊戲機制**（Cocos + 數學引擎）和**後端服務**（Fastify API + Supabase）。新功能通常會同時涉及兩者。在動手寫程式之前，先讓 AI 幫你想清楚，避免做到一半發現方向錯了。

### Step 1：定義功能

```
你：我想加入 Buy Feature（玩家付費直接觸發 Free Game）
你：/office-hours
```

Claude 會問你：
- 「這個功能對哪類玩家最有價值？」
- 「Buy Feature 的價格怎麼定？（通常是 80–100x 總投注）」
- 「這會影響 RTP 分配嗎？」
- 「監管法規允許嗎？你的目標市場是？」

**重要**：Buy Feature 在某些市場（英國 UKGC）被禁止。`/office-hours` 會逼你面對這個問題。

### Step 2：工程規劃

```
你：/plan-eng-review
```

對 Thunder Blessing 的 Buy Feature，Claude 會規劃：

```
前端（Cocos）
├── UIController：加入 BUY FG 按鈕，顯示費用
├── GameBootstrap：startBuyFeature() 方法
└── 確認 Extra Bet 狀態時 Buy Feature 費用計算

後端（Fastify）
├── POST /api/v1/game/buy-feature
│   ├── 驗證餘額（需 100x bet）
│   ├── 扣款
│   ├── 直接進入 Free Game 狀態
│   └── 回傳 FG 初始狀態
├── usecases/game/BuyFeature.ts（新 use case）
└── 更新 spin 狀態機支援 buy-feature 入口

資料庫
└── spin_logs：新增 trigger_type = 'buy_feature'

數學
└── Buy Feature 不影響 base RTP，只改變觸發路徑
    驗證：buy feature 後的 FG 平均贏額應與自然觸發相同
```

### Step 3：實作

告訴 Claude 實作順序：

```
你：先實作後端 BuyFeature use case，Clean Architecture 規範：
    - domain 層不 import infrastructure
    - use case 只有 execute() 方法
    - 先寫測試再實作
```

### Step 4：程式碼審查

```
你：/review
```

Claude 會特別關注：
- Buy Feature 的費用計算有沒有 race condition（兩個請求同時扣款）
- 餘額不足時的錯誤處理
- 是否有測試覆蓋 buy-feature 路徑

### Step 5：測試

```
你：/qa http://localhost:30001
```

測試項目：
1. BUY FG 按鈕在餘額足夠時可點
2. 費用正確扣除（100x 總投注）
3. 直接進入 Free Game
4. 餘額不足時按鈕禁用或顯示錯誤
5. Auto Spin 開著時 Buy Feature 的行為

### Step 6：出 PR

```
你：/ship
```

---

## 4. 數學模型修改流程

### 背景

這是 Thunder Blessing 開發中**風險最高**的操作。數學模型（reel strip、paytable、RTP 分配）一旦改錯，可能導致：
- 實際 RTP 偏離設計值 → 玩家體驗差或莊家虧損
- Bonus 觸發頻率不對 → 玩家放棄
- Max Win 無法達到 → 廣告誤導問題

**規則：任何數學模型修改都必須跑 100 萬次模擬驗證。**

### Step 1：開啟安全模式

```
你：/careful
你：/freeze apps/web/src/   # 只允許改後端數學引擎，不會意外動到其他地方
```

### Step 2：說明修改目標

```
你：/plan-eng-review

    我要調整 Base Game 的 Cascade 機制觸發頻率：
    目前平均每轉 0.8 次 Cascade，感覺不夠刺激
    目標：調整到平均每轉 1.2 次 Cascade
    限制：整體 RTP 必須維持在 97.5% ±0.1%

    請分析：
    1. 需要修改哪些 reel strip 權重
    2. 對 base game RTP 的影響
    3. 對 Bonus 觸發率的影響
    4. 驗證腳本
```

### Step 3：修改並驗證

修改 `Probability_Design.md` 和對應的 `SlotEngine.ts` 後，必須跑驗證：

```
你：用修改後的數學模型跑驗證：
    - 100 萬次模擬
    - 確認 RTP 在 97.4%–97.6%
    - 確認 Cascade 平均次數在 1.1–1.3
    - 確認 Bonus 觸發率沒有超出設計範圍（每 X 轉）
    - 輸出完整統計報告
```

**驗證報告範例：**

```
模擬結果（1,000,000 次）
══════════════════════════════════════════
RTP:              97.52%   目標: 97.5%   ✓
Base Game RTP:    60.8%    目標: ~60%    ✓
Bonus RTP:        36.7%    目標: ~37%    ✓
Cascade 平均次數:  1.19     目標: 1.2     ✓
Bonus 觸發率:     每 143 轉  前版: 每140轉  ✓ (在容許範圍)
══════════════════════════════════════════
```

### Step 4：解除安全模式

```
你：/unfreeze
```

### Step 5：審查 + 出 PR

```
你：/review
你：/ship
```

---

## 5. Bug 調查流程

### 背景

Thunder Blessing 的 bug 通常出現在幾個地方：
- Cascade 連鎖計算錯誤（邊界條件）
- Coin Toss 倍率累積邏輯
- Cocos 前端狀態和後端不同步
- WebSocket 斷線重連後遊戲狀態

`/investigate` 的 **Iron Law**：沒有徹底調查就不能修復。Claude 會先追蹤問題，確認根本原因，才會動手修。

### 調查步驟

```
你：/investigate

    問題描述：
    Free Game 結束後返回 Base Game，有時候滾輪列數沒有重置回 3 列，
    仍然顯示 6 列，但後端已經回傳 base game 狀態

    重現步驟：
    1. 觸發 Free Game
    2. 讓 Cascade 擴展到 6 列
    3. Free Game 結束
    4. 約 20% 機率滾輪仍顯示 6 列
```

Claude 會自動：
1. 追蹤 `ReelManager.ts` 的狀態重置邏輯
2. 追蹤 WebSocket 訊息的接收時序
3. 建立假說（可能是 animation callback 的 race condition）
4. 驗證假說
5. 最多嘗試 3 種修法，如果都失敗會停下來告訴你卡在哪裡

### 如果問題在後端 API

```
你：/investigate
你：/freeze apps/web/src/usecases/game/  # 鎖定調查範圍
```

### 如果問題在 Cocos 前端

```
你：/investigate
你：/freeze assets/scripts/
```

---

## 6. 前端 Cocos 開發流程

### 背景

Cocos Creator 的開發有一個重要原則：**前端只做展示，不做數學**。RNG 結果、贏額計算、RTP 全在後端。前端只是把後端回傳的結果播放成動畫。

### Build 指令

```bash
# Cocos CLI build（web-desktop）
"/Applications/Cocos/Creator/3.8.7/CocosCreator.app/Contents/MacOS/CocosCreator" \
  --project /Users/tobala/projects/thunder-blessing-slot \
  --build "platform=web-desktop;debug=false;outputPath=./build"

# 部署到 GitHub Pages
pnpm deploy
```

### 開發 Cocos 組件

```
你：修改 ReelManager.ts，加入 anticipation 動畫：
    當剩下最後兩個滾輪停止時，如果前三個滾輪有 2 個 SC，
    最後兩個滾輪要減速並加特效，暗示可能觸發 Bonus

    注意：
    - 不可在前端判斷 SC 是否觸發 Bonus（後端決定）
    - 只根據前端看到的符號做視覺效果
    - 動畫結束後才能允許下一次 spin
```

### 視覺審查

每次改完 UI，deploy 到 GitHub Pages 後：

```
你：/design-review https://ibalasite.github.io/thunder-blessing-slot/

    重點審查：
    1. 符號大小和間距是否一致
    2. 贏錢動畫是否清晰可讀
    3. 手機版（375px）UI 是否擠壓
    4. Free Game 計數器位置是否清楚
```

### 測試 Cocos 前端

Cocos build 成 web 後，`/qa` 可以直接測試：

```
你：/qa https://ibalasite.github.io/thunder-blessing-slot/

    測試：
    1. SPIN 按鈕點擊後滾輪正常轉動
    2. 連線高亮顯示正確
    3. 贏錢動畫依金額分級（小贏/大贏/MEGA WIN）
    4. Auto Spin 100 次不崩潰
    5. 手機版觸控操作正常
```

---

## 7. 後端 API 開發流程

### 背景

Thunder Blessing 後端使用 Clean Architecture，有四個層次：
- **Domain**：純邏輯，不依賴任何框架
- **Use Cases**：業務流程，只依賴 domain
- **Adapters**：Controllers（Fastify）、Repositories（Supabase）
- **Infrastructure**：Fastify app、資料庫連線、RNG

**最重要的規則**：內層不依賴外層。Domain 不 import Fastify，Use Case 不 import Supabase。

### 新增 API Endpoint

```
你：/plan-eng-review

    新增 GET /api/v1/game/history endpoint
    - 回傳玩家最近 50 筆 spin 紀錄
    - 包含：時間、下注額、贏額、trigger type（normal/extra_bet/buy_feature）
    - 需要分頁（cursor-based）
    - 需要認證

    請按照現有 Clean Architecture 規範，說明：
    1. 新增哪些 domain 介面
    2. 新增哪些 use case
    3. 新增哪些 adapter
    4. 測試策略
```

### 測試策略

Thunder Blessing 的測試分四層：

| 層次 | 目錄 | 執行指令 | 速度 |
|------|------|---------|------|
| 單元測試 | `tests/unit/` | `pnpm test:unit` | 快（<10s）|
| 整合測試 | `tests/integration/` | `INTEGRATION=1 pnpm test:integration` | 慢（需 Supabase）|
| E2E 測試 | `tests/e2e/` | `E2E=1 pnpm test:e2e` | 慢（需 K8s）|
| 安全測試 | `tests/security/` | `pnpm jest tests/security/` | 中等 |

**開發時只跑單元測試**。PR 前跑整合測試。上線前跑 E2E。

### 覆蓋率目標

```bash
pnpm test:coverage
```

目標：
- Statements: 100%
- Functions: 100%
- Lines: 100%
- Branches: 90%+

---

## 8. 測試流程

### 背景

Thunder Blessing 目前有多層測試覆蓋，但最重要的是：**數學測試**。遊戲邏輯測試可以發現 bug，但只有百萬次模擬才能驗證 RTP 是否符合設計。

### 日常開發測試

```bash
# 快速確認（開發時隨時跑）
pnpm test:unit

# PR 前必跑
pnpm test:integration

# 上線前必跑
E2E_LIVE=1 E2E_BASE_URL=http://localhost:30001 pnpm test:e2e
```

### 讓 Claude 補充測試

```
你：/qa http://localhost:30001

    特別測試這些 edge cases：
    1. 餘額剛好等於 bet 時可以 spin
    2. Cascade 第 6 列出現後再觸發 Cascade 的行為
    3. Coin Toss 連續 5 次正面達到 ×77 後繼續 Coin Toss 不再升
    4. Free Game 剩 1 轉時再觸發 Scatter 的行為
    5. 同時開兩個分頁登同一帳號的競爭條件
```

每個發現的 bug，`/qa` 會自動：
1. 修復
2. 提交 atomic commit
3. 生成一個防止該 bug 再次出現的回歸測試
4. 重新測試確認修好了

### 數學驗證測試（修改數學模型後必做）

```
你：跑完整的數學驗證：

    基準版本：apps/web/src/domain/SlotEngine.ts 當前版本

    驗證項目：
    1. 整體 RTP：97.4%–97.6%（100萬次）
    2. Base Game RTP 分配：~60%
    3. Bonus RTP 分配：~37%
    4. SC 觸發率（3個）：符合 Probability_Design.md 規格
    5. Coin Toss 正面率：50% ±2%
    6. Free Game 平均轉數
    7. Max Win 可達性驗證（理論上 30,000x 必須可達）

    輸出 JSON 格式報告存到 tests/analysis/rtp-validation-{日期}.json
```

---

## 9. 安全審計流程

### 背景

Slot 遊戲涉及真實金錢，安全要求比一般 Web App 嚴格。Thunder Blessing 有幾個特別需要關注的攻擊面：

1. **RNG 攻擊**：玩家試圖預測或影響隨機結果
2. **Spin Replay**：重複送出同一個 spin 請求，得到不同結果
3. **餘額操控**：利用 race condition 讓餘額不一致
4. **Session 劫持**：偷取其他玩家的 token

### 何時做安全審計

- 每次大功能上線前
- 修改 RNG 相關程式碼後
- 修改認證流程後
- 每季例行審計

### 執行安全審計

```
你：/cso

    除了標準 OWASP Top 10，特別關注 Slot 特有風險：

    1. RNG 安全性
       - CryptoRNGProvider.ts 的熵源是否足夠
       - Seed 是否可被外部觀測或影響
       - tests/security/CRNGAttack.security.test.ts 的測試是否充分

    2. Spin 完整性
       - 每個 spin 是否有唯一 spinId，防止 replay
       - spinId 是否在資料庫層做唯一性驗證
       - client 能否影響 spin 結果（例如透過修改 request body）

    3. 餘額原子性
       - 扣款和增加餘額是否在同一個 DB transaction
       - 網路中斷時，spin 結果是否會保存但餘額不更新（或反過來）

    4. 速率限制
       - /auth/register 和 /auth/login 是否有 rate limit
       - /game/spin 是否有 rate limit（防止刷 spin）

    5. 審計追蹤
       - spin_logs 表是否完整記錄所有操作
       - 紀錄是否可被竄改
```

---

## 10. 部署流程

### 背景

Thunder Blessing 有兩個部署目標：
1. **GitHub Pages**：Cocos 前端 demo（靜態）
2. **Kubernetes**：完整遊戲（前端 + Fastify API + Supabase）

### 部署前設定（第一次）

```
你：/setup-deploy

    部署資訊：
    - GitHub Pages URL：https://ibalasite.github.io/thunder-blessing-slot/
    - K8s namespace：thunder-dev
    - API URL：http://localhost:30001（本機）
    - 部署指令：bash infra/k8s/build.sh
```

### 標準部署流程

```
你：/ship              # 跑測試、push、開 PR
你：/land-and-deploy   # merge PR、等 CI、驗證上線
you：/canary           # 監控上線後 15 分鐘
```

### GitHub Pages 快速部署（Cocos demo）

```bash
# Build Cocos
"/Applications/Cocos/Creator/3.8.7/CocosCreator.app/Contents/MacOS/CocosCreator" \
  --project /Users/tobala/projects/thunder-blessing-slot \
  --build "platform=web-desktop;debug=false;outputPath=./build"

# 部署
pnpm deploy
```

### K8s 完整部署

```bash
export PATH="$PATH:$HOME/.rd/bin"

# Build Docker image + deploy
bash infra/k8s/build.sh

# 確認部署狀態
kubectl get pods -n thunder-dev
kubectl rollout status deployment/thunder-web -n thunder-dev

# 確認 API 正常
curl -s http://localhost:30001/api/v1/health
```

### 部署後監控

```
你：/canary

    監控項目：
    - API error rate（/api/v1/health）
    - spin endpoint 回應時間
    - 有沒有新的 console error
    - 餘額計算有沒有異常
```

---

## 11. 週回顧

### 背景

每週做一次回顧，了解進度、找出問題模式、調整下週計劃。`/retro` 會分析 git log 和測試變化，給出客觀的統計數字，不是主觀感受。

### 執行回顧

```
你：/retro
```

你會看到：

```
Thunder Blessing Slot — 週回顧
週期：2026-03-24 至 2026-03-30
════════════════════════════════
本週貢獻：
  提交：23 commits
  新增：1,847 行
  刪除：342 行
  淨增：1,505 行

測試健康度：
  單元測試：193 → 201（+8）✓
  覆蓋率：100% → 100% ✓

重點變更：
  - Buy Feature API 實作完成
  - Cascade 動畫 anticipation 效果
  - 修復 Free Game 結束後滾輪列數不重置

下週建議：
  - tests/integration/ 覆蓋率只有 78%，建議補強
  - /cso 上次執行是 2 週前，建議做一次安全審計
```

### 跨專案回顧

如果你同時在開發多個專案：

```
你：/retro global
```

---

## 12. 緊急情況處理

### 線上 RTP 異常

**症狀**：監控發現實際 RTP 偏離設計值超過 0.5%

```bash
# 立刻凍結下注功能（後端加 feature flag）
你：/careful
你：/freeze apps/web/src/usecases/game/

# 調查
你：/investigate

    緊急：線上 RTP 監控顯示今天實際 RTP 是 102.3%，
    遠超設計值 97.5%。

    請調查：
    1. 最近的 git commits 有沒有改動 SlotEngine 或數學模型
    2. Cascade 計算邏輯有沒有邊界條件問題
    3. Free Game 倍率有沒有被重複套用
```

### Spin 請求異常（玩家反映卡住）

```
你：/investigate

    玩家反映 spin 後 loading 無限轉，但餘額有被扣除

    查看 K8s logs：
    kubectl logs -n thunder-dev deployment/thunder-web --tail=50
```

### 資料庫連線問題

```bash
export PATH="$PATH:$HOME/.rd/bin"
kubectl get pods -n thunder-dev | grep supabase
kubectl logs -n thunder-dev deployment/supabase-supabase-db --tail=20
```

---

## 13. Skill 快速參考

### 本專案最常用

| 情境 | 指令 |
|------|------|
| 不確定要做什麼 | `/office-hours` |
| 開始新功能規劃 | `/plan-eng-review` |
| 改數學模型前 | `/careful` → `/freeze apps/web/src/` |
| Debug | `/investigate` |
| PR 前程式碼審查 | `/review` |
| 測試功能 | `/qa http://localhost:30001` |
| 測試前端 | `/qa https://ibalasite.github.io/thunder-blessing-slot/` |
| 視覺審查 | `/design-review https://ibalasite.github.io/thunder-blessing-slot/` |
| 安全審計 | `/cso` |
| 出 PR | `/ship` |
| 部署上線 | `/land-and-deploy` |
| 部署後監控 | `/canary` |
| 週回顧 | `/retro` |

### 安全工具

| 指令 | 作用 |
|------|------|
| `/careful` | 危險指令執行前先警告 |
| `/freeze <目錄>` | 只允許改指定目錄 |
| `/guard` | `/careful` + `/freeze` 合一 |
| `/unfreeze` | 解除 freeze |

### 常用組合

**安全修改數學模型：**
```
/careful → /freeze apps/web/src/ → [修改] → [跑模擬驗證] → /unfreeze → /review → /ship
```

**完整上線流程：**
```
/review → /cso → /qa http://localhost:30001 → /ship → /land-and-deploy → /canary
```

**快速 debug：**
```
/investigate → /freeze <問題範圍> → [修復] → /unfreeze → /review
```

---

## 附錄：本專案技術速查

### 關鍵檔案

| 檔案 | 作用 |
|------|------|
| `GDD_Thunder_Blessing_Slot.md` | 遊戲完整規格，修改任何遊戲邏輯前必讀 |
| `Probability_Design.md` | 數學模型規格，RTP/paytable/reel strip |
| `assets/scripts/SlotEngine.ts` | Phase 1 本地數學引擎 |
| `apps/web/src/usecases/game/` | Phase 2 後端遊戲 use cases |
| `tests/security/CRNGAttack.security.test.ts` | RNG 安全測試 |

### 關鍵數值

| 參數 | 數值 |
|------|------|
| 目標 RTP | 97.5% (±0.1%) |
| Max Win | 30,000x |
| Free Game 最高倍率 | ×77 |
| 滾輪數 | 5 |
| 基本列數 / 最大列數 | 3 / 6 |
| 基本連線 / 最大連線 | 25 / 57 |

### 環境 URL

| 環境 | URL |
|------|------|
| K8s API（本機）| http://localhost:30001 |
| GitHub Pages demo | https://ibalasite.github.io/thunder-blessing-slot/ |
| K8s Web UI | http://localhost:30080 |
