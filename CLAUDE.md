# Thunder Blessing Slot — Claude Code 工作指引

## 專案概覽

希臘神話風格老虎機，Cocos Creator 3.8 前端 + Fastify 後端，pnpm monorepo。

| 項目 | 內容 |
|------|------|
| 遊戲引擎 | Cocos Creator 3.8.7 |
| 後端 | Fastify v5 + Clean Architecture (`apps/web/src/`) |
| 資料庫 | Supabase (PostgreSQL) |
| 部署 | Kubernetes (Rancher Desktop) |
| 測試 | Jest — unit / integration / e2e / security |
| RTP 目標 | 97.5% |
| Max Win | 30,000x |

## 專案結構

```
thunder-blessing-slot/
├── assets/scripts/         # Cocos Creator TypeScript 組件
│   ├── SlotEngine.ts       # 本地數學引擎（Phase 1 單機版）
│   ├── ReelManager.ts      # 滾輪動畫控制
│   ├── GameBootstrap.ts    # 遊戲啟動（startRemote() = Phase 2）
│   └── UIController.ts     # HUD、按鈕
├── apps/web/               # Fastify API 後端（@thunder/web）
│   └── src/
│       ├── domain/         # 實體、介面
│       ├── usecases/       # Auth / Wallet / Game
│       ├── adapters/       # Controllers、Repositories
│       └── infrastructure/ # Fastify app、RNG、DB
├── tests/
│   ├── unit/               # 純邏輯測試
│   ├── integration/        # 含 Supabase 的整合測試
│   ├── e2e/                # HTTP 全流程測試
│   └── security/           # CSPRNG 攻擊測試
├── infra/k8s/              # Kubernetes manifests + Helm
├── supabase/               # DB migrations
├── GDD_Thunder_Blessing_Slot.md    # 遊戲設計文件
├── Probability_Design.md           # 數學模型規格
└── SETUP_GUIDE.md                  # 環境設定指南
```

## 常用指令

```bash
# 測試
pnpm test:unit              # 單元測試（快速，開發時用）
pnpm test:integration       # 整合測試（需 Supabase）
pnpm test:e2e               # E2E 測試（需 K8s stack）
pnpm test:coverage          # 覆蓋率報告

# 後端開發
pnpm web                    # 啟動 Fastify dev server

# 部署
pnpm deploy                 # 部署 Cocos build 到 GitHub Pages
bash infra/k8s/build.sh     # 建 Docker image + push 到 K8s
```

## 遊戲模式

| 模式 | 說明 | 啟動方式 |
|------|------|---------|
| Phase 1 單機版 | 本地 RNG，無後端 | `startLocal()` in GameBootstrap.ts |
| Phase 2 連線版（目前）| Fastify API + Supabase | `startRemote()` — 預設 |

## 重要設計文件

- **GDD_Thunder_Blessing_Slot.md** — 完整遊戲規格（務必閱讀再動工）
- **Probability_Design.md** — 數學模型：RTP 97.5%、paytable、reel strip
- **SETUP_GUIDE.md** — K8s 環境設定

## 開發注意事項

- **RNG 永遠在後端**：不可在 Cocos 前端做任何影響 spin 結果的計算
- **數學變更必須驗證**：修改 reel strip 或 paytable 後需跑 100 萬次模擬驗證 RTP
- **測試覆蓋率目標**：Statements 100% / Functions 100% / Lines 100%
- **Clean Architecture**：後端 domain 層不得 import infrastructure 層
- **Cocos build**：使用 CocosCreator CLI，不要手動改 build 產出

---

## gstack — AI 20 人工程團隊

Use /browse from gstack for all web browsing. Never use mcp__claude-in-chrome__* tools.

Available skills:
/office-hours, /plan-ceo-review, /plan-eng-review, /plan-design-review,
/design-consultation, /design-shotgun, /review, /ship, /land-and-deploy,
/canary, /benchmark, /browse, /connect-chrome, /qa, /qa-only,
/design-review, /setup-browser-cookies, /setup-deploy, /retro,
/investigate, /document-release, /codex, /cso, /autoplan,
/careful, /freeze, /guard, /unfreeze, /gstack-upgrade

If gstack skills aren't working, run: cd ~/.claude/skills/gstack && ./setup

### 本專案的 gstack 工作流

**新功能開發：**
```
/office-hours → /plan-eng-review → [實作] → /review → /qa http://localhost:30001 → /ship
```

**數學模型修改：**
```
/careful → /plan-eng-review → [修改 Probability_Design.md + SlotEngine.ts]
→ [跑 100萬次模擬驗證 RTP] → /review → /ship
```

**Bug 調查：**
```
/investigate → /freeze assets/scripts/  # 或 apps/web/src/
```

**安全審計（上線前）：**
```
/cso  # 重點：RNG 不可預測性、防止 spin replay 攻擊
```

**UI 改版：**
```
/design-review https://ibalasite.github.io/thunder-blessing-slot/
```

**測試 staging：**
```
/qa http://localhost:30001
```
