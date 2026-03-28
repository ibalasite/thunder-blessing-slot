# Thunder Blessing Slot

🎮 **Demo：[https://ibalasite.github.io/thunder-blessing-slot/](https://ibalasite.github.io/thunder-blessing-slot/)**

希臘神話風格老虎機遊戲，以 Cocos Creator 3.8 開發。

高賠符號為宙斯（Zeus）、天馬（Pegasus）、雅典娜（Athena）、雄鷹（Eagle）；低賠符號為英文字母 Z、E、U、S。

特色：滾輪自動擴展（Cascade）、雷霆 Scatter 變換符號、硬幣翻轉決定免費遊戲次數與倍率、最高 30,000× 總投注額獎金。

---

## 專案結構

```
thunder-blessing-slot/               ← Mono-repo root (pnpm workspace)
├── assets/scripts/                  ← Cocos 遊戲邏輯（SlotEngine、GameConfig 等）
├── tests/                           ← 遊戲引擎測試（Jest）
├── apps/
│   ├── web/                         ← Next.js API Server（Phase 2A）
│   │   ├── src/
│   │   │   ├── app/api/v1/         ← Route Handlers（auth/wallet/game）
│   │   │   ├── interfaces/         ← DI 介面（IAuthProvider、IWalletRepo 等）
│   │   │   ├── adapters/           ← Supabase / Redis 實作
│   │   │   ├── rng/                ← CryptoRNGProvider / SeededRNGProvider
│   │   │   ├── services/           ← BetRangeService 等
│   │   │   ├── shared/             ← AppError / errorHandler / withAuth
│   │   │   └── container.ts        ← Composition Root（DI 接線）
│   │   └── tests/unit/             ← 100% coverage unit tests
│   └── worker/                     ← 每日 RTP 報表 / spin_logs 歸檔
├── infra/k8s/                       ← Kubernetes 設定（base + overlays/dev）
├── supabase/
│   ├── config.toml                  ← Supabase local config
│   ├── migrations/                  ← 版本化 SQL（9 張資料表）
│   └── seed.sql                     ← 開發用測試資料
├── .github/workflows/
│   ├── ci.yml                       ← 每次 Push 執行測試
│   ├── db-migrate.yml               ← migration 觸發
│   └── deploy-demo.yml              ← Render 部署
├── pnpm-workspace.yaml
├── package.json
└── docs/EDD-refactor-architecture.md  ← 完整架構設計文件 (v6.0)
```

---

## 遊戲規則概述

| 項目 | 內容 |
|------|------|
| 滾輪數量 | 5 個 |
| 基本列數 | 3 列（最大擴展至 6 列） |
| 基本連線數 | 25 條（最大 57 條） |
| 最大獎金 | 30,000 × 總投注額 |

---

## 開發環境建置

### 系統需求

| | Mac | Windows 11 |
|--|-----|------------|
| Node.js | 22 LTS | 22 LTS |
| pnpm | 10+ | 10+ |
| Cocos Creator | 3.8.x | 3.8.x |
| Supabase CLI | 2.x | 2.x |
| Rancher Desktop | 1.x（可選）| 1.x（可選）|

---

## Mac 本地開發建置步驟

### 1. 安裝必要工具

```bash
# 安裝 Node.js 22 (使用 nvm)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
nvm install 22
nvm use 22

# 安裝 pnpm
npm install -g pnpm

# 安裝 Supabase CLI
brew install supabase/tap/supabase

# 安裝 Cocos Dashboard
# 前往 https://www.cocos.com/creator 下載 Mac 版
# 安裝後在 Dashboard 安裝 Cocos Creator 3.8.x
```

### 2. Clone & 安裝依賴

```bash
git clone https://github.com/<owner>/thunder-blessing-slot.git
cd thunder-blessing-slot

# 安裝 workspace 依賴（root + apps/web + apps/worker）
pnpm install
```

### 3. 設定環境變數

```bash
# 複製 web 環境變數範本
cp apps/web/.env.example apps/web/.env.local
```

編輯 `apps/web/.env.local`：

```env
NODE_ENV=development
SUPABASE_URL=http://localhost:54321
SUPABASE_SERVICE_ROLE_KEY=<取自 supabase start 輸出>
JWT_SECRET=dev-local-jwt-secret-min-32-chars-ok
```

### 4. 啟動 Supabase 本地服務

```bash
# 啟動 Supabase（PostgreSQL + Auth + Studio）
supabase start

# 輸出範例：
#   API URL: http://localhost:54321
#   DB URL: postgresql://postgres:postgres@localhost:54322/postgres
#   Studio URL: http://localhost:54323
#   Service Role Key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# 執行 migrations
supabase db push

# （可選）植入測試資料
supabase db reset --db-url postgresql://postgres:postgres@localhost:54322/postgres
```

### 5. 啟動 Next.js 開發伺服器

```bash
# 從 workspace root 啟動
pnpm web

# 或直接進入 apps/web
cd apps/web && pnpm dev

# API 在 http://localhost:3001
# 測試 health: curl http://localhost:3001/api/v1/health
```

### 6. 執行測試

```bash
# 遊戲引擎測試（根目錄）
pnpm test                              # 全部（888 tests）
pnpm test:unit                         # 單元測試
pnpm test:integration                  # 整合測試

# API Server 測試（apps/web，100% coverage）
pnpm web:test                          # 全部 + coverage
cd apps/web && pnpm test:unit          # unit only
```

### 7. 開啟 Cocos Creator 遊戲

```bash
# 在 Cocos Dashboard 開啟根目錄作為專案
# 選擇 Cocos Creator 3.8.x
# 雙擊 assets/scenes/Main.scene → 點 Play ▶
```

---

## Windows 11 本地開發建置步驟

### 1. 安裝必要工具

**方法一：使用 PowerShell（管理員）**

```powershell
# 安裝 winget（如尚未安裝）
# 通常 Windows 11 已內建 winget

# 安裝 Node.js 22
winget install OpenJS.NodeJS.LTS

# 或使用 nvm-windows
winget install CoreyButler.NVMforWindows
# 重開 PowerShell 後：
nvm install 22
nvm use 22

# 安裝 pnpm
npm install -g pnpm

# 安裝 Scoop（用於安裝 Supabase CLI）
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
irm get.scoop.sh | iex

# 安裝 Supabase CLI
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase

# 安裝 Git
winget install Git.Git
```

**方法二：手動下載安裝**

| 工具 | 下載網址 |
|------|---------|
| Node.js 22 LTS | https://nodejs.org/en/download |
| Git | https://git-scm.com/download/win |
| Supabase CLI | https://github.com/supabase/cli/releases（`.exe`）|
| Cocos Dashboard | https://www.cocos.com/creator |

### 2. Clone & 安裝依賴

```powershell
# 在 PowerShell 中執行
git clone https://github.com/<owner>/thunder-blessing-slot.git
cd thunder-blessing-slot

# 安裝 workspace 依賴
pnpm install
```

### 3. 設定環境變數

```powershell
# 複製範本
Copy-Item apps\web\.env.example apps\web\.env.local
```

用記事本或 VS Code 編輯 `apps\web\.env.local`：

```env
NODE_ENV=development
SUPABASE_URL=http://localhost:54321
SUPABASE_SERVICE_ROLE_KEY=<取自 supabase start 輸出>
JWT_SECRET=dev-local-jwt-secret-min-32-chars-ok
```

### 4. 啟動 Supabase 本地服務

> **前提**：Windows 11 需安裝 [Docker Desktop](https://www.docker.com/products/docker-desktop/)
> 開啟 Docker Desktop → Settings → Use WSL 2 → Apply

```powershell
# 啟動 Supabase
supabase start

# 執行 migrations
supabase db push
```

### 5. 啟動 Next.js 開發伺服器

```powershell
# 從 workspace root 啟動（PowerShell）
pnpm web

# API 在 http://localhost:3001
# 測試：在瀏覽器開啟 http://localhost:3001/api/v1/health
```

### 6. 執行測試

```powershell
# 遊戲引擎測試
pnpm test

# API Server 測試
pnpm web:test
```

### 7. 開啟 Cocos Creator 遊戲

1. 安裝並開啟 Cocos Dashboard
2. 左側點選「安裝」→ 安裝 **Cocos Creator 3.8.x**
3. 左側點選「Projects」→「Add」→ 選擇專案根目錄
4. 等待初始化（首次約 2-3 分鐘）
5. 雙擊 `assets/scenes/Main.scene` → 點 **▶ Play**

---

## 常見問題

### pnpm install 出現 lockfile 錯誤

```bash
pnpm install --no-frozen-lockfile
```

### Supabase 啟動失敗（Docker 未啟動）

```bash
# Mac
open -a Docker

# Windows: 手動開啟 Docker Desktop 應用程式
```

### JWT_SECRET 長度不足

`JWT_SECRET` 必須至少 32 個字元，否則 `env.ts` Zod 驗證會失敗並輸出錯誤訊息。

### apps/web 找不到 next

```bash
cd apps/web && pnpm install
```

---

## CI/CD

| 觸發 | 動作 |
|------|------|
| 每次 Push | 遊戲引擎測試 + API unit tests（100% coverage）|
| main branch | 執行全部測試 → Deploy to Render |
| `supabase/migrations/` 變更 | 觸發 DB migration |

---

## 架構文件

完整 Phase 2A 架構設計請參閱 [docs/EDD-refactor-architecture.md](docs/EDD-refactor-architecture.md)（v6.1）。

---

*RTP 目標：97.5% ± 0.5%（4 種模式均已驗證）*
*測試數量：888 tests（遊戲引擎）+ 138 tests（API unit，100% coverage）= 1,026 tests*
*Phase 2A：13/16 步驟完成（2026-03-28）*
