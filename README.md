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
│   ├── web/                         ← Fastify API Server（Clean Architecture）
│   │   ├── src/
│   │   │   ├── infrastructure/fastify/ ← app.ts / server.ts / routes/
│   │   │   ├── domain/             ← Entities（SpinEntity、WalletEntity）
│   │   │   ├── usecases/           ← SpinUseCase、LoginUseCase 等
│   │   │   ├── adapters/           ← Supabase / Redis 實作
│   │   │   ├── services/           ← BetRangeService 等
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

有兩種執行模式：

| 模式 | 說明 | 適用 |
|------|------|------|
| **Local Dev**（Supabase + Fastify）| Supabase local + `pnpm dev` 啟動 API | 開發、改 code |
| **K8s Dev**（Rancher Desktop）| 完整 K8s stack，模擬 production | 整合測試、端對端驗證 |

### 系統需求

| | Mac | Windows 11 |
|--|-----|------------|
| Node.js | 20+ LTS | 20+ LTS |
| pnpm | 9+ | 9+ |
| Cocos Creator | 3.8.x | 3.8.x |
| Docker Desktop | 必須（Supabase / K8s）| 必須（Supabase）|
| Supabase CLI | 2.x | 2.x |
| Rancher Desktop | K8s 模式必須（含 k3s + kubectl）| ⚠️ K8s 模式需 WSL2（有限支援）|
| Python 3 + Playwright | RPA 視覺 E2E 測試 | RPA 視覺 E2E 測試 |

---

## 啟動步驟（Local Dev 模式）

> 適用：改 code、跑單元測試。不需要 K8s。

### Mac

**Prerequisites：**
- Node.js 20+ LTS、pnpm 9+
- Docker Desktop（Supabase local 需要）
- Supabase CLI：`brew install supabase/tap/supabase`

```bash
# 1. 安裝依賴
pnpm install

# 2. 建立環境變數檔
cp apps/web/.env.example apps/web/.env.local
# 編輯 apps/web/.env.local — JWT_SECRET 至少 32 字元

# 3. 啟動 Supabase（需要 Docker Desktop）
supabase start
# 輸出中複製 service_role key → 填入 .env.local 的 SUPABASE_SERVICE_ROLE_KEY

# 4. 執行 DB migrations
supabase db push

# 5. 啟動 Fastify API server
cd apps/web && pnpm dev
# API 在 http://localhost:3000

# 6. 驗證
curl http://localhost:3000/api/v1/health
# {"status":"ok"}

# 7. 停止 Supabase
supabase stop
```

### Windows 11

**Prerequisites：**
- Node.js 20+ LTS（`winget install OpenJS.NodeJS.LTS`）
- pnpm：`npm install -g pnpm`
- Docker Desktop + 啟用 WSL2（Settings → Use WSL 2 backend）
- Supabase CLI：
  ```powershell
  Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
  irm get.scoop.sh | iex
  scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
  scoop install supabase
  ```

```powershell
# 1. 安裝依賴
pnpm install

# 2. 建立環境變數檔
Copy-Item apps\web\.env.example apps\web\.env.local
# 用 VS Code 編輯 apps\web\.env.local — JWT_SECRET 至少 32 字元

# 3. 啟動 Supabase（需要 Docker Desktop 已啟動）
supabase start
# 複製 service_role key → 填入 .env.local 的 SUPABASE_SERVICE_ROLE_KEY

# 4. 執行 DB migrations
supabase db push

# 5. 啟動 Fastify API server
Set-Location apps\web
pnpm dev
# API 在 http://localhost:3000

# 6. 驗證
Invoke-RestMethod http://localhost:3000/api/v1/health

# 7. 停止 Supabase
supabase stop
```

---

## 啟動步驟（K8s Dev 模式）

> 適用：完整 stack 驗證、端對端測試。遊戲在 `http://localhost:30080`，API 在 `http://localhost:30001`。

### Mac（Rancher Desktop）

**Prerequisites：**
- [Rancher Desktop](https://rancherdesktop.io/) — 安裝後確認 `kubectl` 可用
- `kubectl`、`kustomize`（Rancher Desktop 內建）

```bash
# 1. 確認 K8s cluster 正常
kubectl cluster-info

# 2. 部署完整 stack（一次性，首次需 5-10 分鐘）
./infra/k8s/build.sh

# 3. 確認所有 pod 正常
kubectl get pods -n thunder-dev
# 應看到 thunder-web、thunder-cocos、supabase-* 全部 Running

# 4. 開啟遊戲
open http://localhost:30080

# 5. 驗證 API
curl http://localhost:30001/api/v1/health
# {"status":"ok"}

# 6. 跑 K8s E2E tests（需要 K8s stack 運行中）
npx jest tests/e2e/k8s-server.e2e.test.ts --no-coverage

# 7. 跑 RPA 視覺 E2E（需要 Python + Playwright）
pip install playwright
playwright install chromium
python3 tests/visual-e2e/e2e_slot_test.py --target k8s
```

### Windows 11（K8s）

> ⚠️ K8s dev 模式在 Windows 上需透過 WSL2，建議使用 Mac 執行 K8s 模式。
> 若需在 Windows 開發，使用 Local Dev 模式（Supabase + pnpm dev）即可。

若仍要在 Windows 使用 K8s：
1. 安裝 [Rancher Desktop for Windows](https://rancherdesktop.io/)（需要 WSL2）
2. 在 WSL2 terminal 執行與 Mac 相同的指令
3. 確認 `kubectl cluster-info` 正常後執行 `./infra/k8s/build.sh`

---

## Mac 完整開發環境建置步驟

### 1. 安裝必要工具

```bash
# Node.js 20+（使用 nvm）
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
nvm install 20 && nvm use 20

# pnpm
npm install -g pnpm

# Supabase CLI（Local Dev 模式）
brew install supabase/tap/supabase

# Rancher Desktop（K8s 模式）
# 前往 https://rancherdesktop.io 下載 Mac 版 .dmg
# 安裝後：偏好設定 → Kubernetes → 啟用 → Apply
# 確認：kubectl cluster-info

# Python + Playwright（RPA 視覺 E2E）
pip3 install playwright && playwright install chromium

# Cocos Creator（遊戲開發）
# 前往 https://www.cocos.com/creator 下載 Cocos Dashboard（Mac 版）
# 安裝後在 Dashboard → 安裝 → Cocos Creator 3.8.x
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

### 5. 啟動 Fastify API 開發伺服器

```bash
# 從 workspace root 啟動
pnpm web

# 或直接進入 apps/web
cd apps/web && pnpm dev

# API 在 http://localhost:3000
# 測試 health: curl http://localhost:3000/api/v1/health
```

### 6. 執行測試

```bash
# 遊戲引擎測試（根目錄）
pnpm test                                    # 全部（888 tests：unit + integration + security + e2e）

# API Server 測試（apps/web）
cd apps/web
pnpm test:coverage                           # unit tests（100% coverage）
INTEGRATION=1 pnpm test:int                  # integration tests（需要 Supabase 運行中）
E2E=1 pnpm test:e2e                         # full HTTP flow E2E

# K8s API E2E（需要 K8s stack 運行）
npx jest tests/e2e/k8s-server.e2e.test.ts --no-coverage   # 10 tests

# RPA 視覺 E2E（需要 K8s stack + Playwright）
python3 tests/visual-e2e/e2e_slot_test.py --target k8s    # 11 steps
```

### 7. 開啟 Cocos Creator 遊戲

```bash
# 在 Cocos Dashboard 開啟根目錄作為專案
# 選擇 Cocos Creator 3.8.x
# 雙擊 assets/scenes/Main.scene → 點 Play ▶
```

---

## Windows 11 完整開發環境建置步驟

### 1. 安裝必要工具

**方法一：使用 PowerShell（管理員）**

```powershell
# Git
winget install Git.Git

# Node.js 20+
winget install OpenJS.NodeJS.LTS
# 或 nvm-windows：
winget install CoreyButler.NVMforWindows
# 重開 PowerShell 後：nvm install 20 && nvm use 20

# pnpm
npm install -g pnpm

# Scoop + Supabase CLI（Local Dev 模式）
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
irm get.scoop.sh | iex
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase

# Docker Desktop（Supabase 需要）
winget install Docker.DockerDesktop
# 安裝後：Docker Desktop → Settings → General → Use WSL 2 based engine → Apply

# Python + Playwright（RPA 視覺 E2E）
winget install Python.Python.3
pip install playwright
playwright install chromium
```

**方法二：手動下載安裝**

| 工具 | 下載 |
|------|------|
| Node.js 20+ LTS | https://nodejs.org/en/download |
| Git | https://git-scm.com/download/win |
| Supabase CLI | https://github.com/supabase/cli/releases（`.exe`）|
| Docker Desktop | https://www.docker.com/products/docker-desktop |
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

### 5. 啟動 Fastify API 開發伺服器

```powershell
# 從 workspace root 啟動（PowerShell）
pnpm web

# 或直接進入 apps/web
Set-Location apps\web
pnpm dev

# API 在 http://localhost:3000
# 測試：在瀏覽器開啟 http://localhost:3000/api/v1/health
```

### 6. 執行測試

```powershell
# 遊戲引擎測試
pnpm test

# API Server 測試（apps/web）
Set-Location apps\web
pnpm test:coverage

# Integration tests（需要 Supabase 運行中）
$env:INTEGRATION=1; pnpm test:int

# E2E tests（需要 Supabase 運行中）
$env:E2E=1; pnpm test:e2e
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

### Docker not running → Supabase 啟動失敗

```bash
# Mac
open -a Docker

# Windows: 手動開啟 Docker Desktop 應用程式
```

### Port 54321 already in use

```bash
supabase stop
supabase start
```

### JWT_SECRET 長度不足

`JWT_SECRET` 必須至少 32 個字元，否則 `env.ts` Zod 驗證會失敗並輸出錯誤訊息。

### apps/web 缺少依賴

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

完整 Phase 2A 架構設計請參閱 [docs/EDD-refactor-architecture.md](docs/EDD-refactor-architecture.md)（v7.1）。

---

*RTP 目標：97.5% ± 0.5%（4 種模式均已驗證）*
*測試數量：888 tests（遊戲引擎）+ 138 tests（API unit，100% coverage）+ 10 tests（K8s E2E）+ 11 steps（RPA Visual E2E）*
*Phase 2A：15/15 步驟全部完成（2026-03-29）| Cocos → K8s Fastify API 全端整合驗證 ✅*
