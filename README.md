# Thunder Blessing Slot

🎮 **Demo：[https://ibalasite.github.io/thunder-blessing-slot/](https://ibalasite.github.io/thunder-blessing-slot/)**

希臘神話風格老虎機遊戲，以 Cocos Creator 3.8 開發。

高賠符號為宙斯（Zeus）、天馬（Pegasus）、雅典娜（Athena）、雄鷹（Eagle）；低賠符號為英文字母 Z、E、U、S。

特色：滾輪自動擴展（Cascade）、雷霆 Scatter 變換符號、硬幣翻轉決定免費遊戲次數與倍率、最高 30,000× 總投注額獎金。

---

## 遊戲規則概述

| 項目 | 內容 |
|------|------|
| 滾輪數量 | 5 個 |
| 基本列數 | 3 列（最大擴展至 6 列） |
| 基本連線數 | 25 條（最大 57 條） |
| 最大獎金 | 30,000 × 總投注額 |

---

## 遊戲模式（重要：先看這裡）

遊戲有兩個執行模式，差異如下：

| | **Phase 1 單機版** | **Phase 2 連線版（目前使用）** |
|--|--|--|
| spin 由誰執行 | Cocos 本地引擎 | K8s Fastify API |
| 錢包 | 純 client 記憶體 | Supabase DB |
| 需要伺服器 | **不需要** | 需要 K8s stack |
| RNG | 本地 CSPRNG | 伺服器端 CSPRNG |
| 適用場景 | UI 開發、demo | 正式上線、RTP 驗證 |

### 目前狀態：Phase 2 連線版

`GameBootstrap.ts` 的 `start()` 固定呼叫 `startRemote()`，遊戲一律連線 K8s API。

### 切換到哪個 API 伺服器

連線版可以指定要連的 API，優先順序：

1. `window.__THUNDER_CONFIG.apiUrl`（nginx 或測試框架注入）
2. URL query param：`?apiUrl=...`
3. 預設：`http://localhost:30001`（K8s API NodePort）

**連預設 K8s API：**
```
http://localhost:30080
```

**連本機 Fastify（pnpm dev，port 3001）：**
```
http://localhost:30080?apiUrl=http://localhost:3001
```

**連 Cocos Creator 預覽（port 7456）時也一樣加參數：**
```
http://localhost:7456?apiUrl=http://localhost:3001
```

---

## 專案結構

```
thunder-blessing-slot/               ← Mono-repo root (pnpm workspace)
├── assets/scripts/                  ← Cocos 遊戲邏輯（SlotEngine、GameConfig 等）
│   └── services/
│       ├── RemoteApiClient.ts       ← 連線版：呼叫 K8s API
│       ├── RemoteEngineAdapter.ts   ← 連線版：spin 委派給伺服器
│       ├── RemoteWalletService.ts   ← 連線版：錢包從伺服器讀寫
│       ├── LocalEngineAdapter.ts    ← 單機版：spin 在本地執行
│       └── LocalWalletService.ts   ← 單機版：錢包在記憶體
├── build/web-desktop/               ← Cocos 編譯產出（靜態檔，部署至 K8s nginx pod）
├── tests/                           ← 遊戲引擎測試（Jest）
├── apps/
│   └── web/                         ← Fastify API Server（Clean Architecture）
│       ├── src/
│       │   ├── infrastructure/fastify/
│       │   ├── domain/
│       │   ├── usecases/
│       │   ├── adapters/
│       │   ├── services/
│       │   └── container.ts
│       └── tests/                   ← unit（100% coverage）/ integration / e2e
├── infra/k8s/
│   ├── base/                        ← Deployment / Service / Ingress
│   ├── overlays/dev/                ← kustomize patch（local ENV、NodePort）
│   ├── build.sh                     ← Fastify API 一鍵 build + deploy
│   └── cocos/
│       ├── build-cocos.sh           ← Cocos 一鍵 build + deploy
│       ├── Dockerfile
│       └── nginx.conf
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   └── seed.sql
├── tests/
│   ├── e2e/k8s-server.e2e.test.ts  ← K8s API E2E（10 tests）
│   ├── visual-e2e/e2e_slot_test.py ← RPA 視覺 E2E（11 steps，Playwright）
│   ├── integration/                 ← RTP 模擬、SlotEngine 整合
│   ├── unit/                        ← SlotEngine、GameFlow、BuyFG 等
│   └── security/                    ← CSPRNG 攻擊防禦
└── docs/EDD-refactor-architecture.md
```

---

## 一、環境安裝

### Mac

**步驟 1：Homebrew（若尚未安裝）**

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

**步驟 2：Node.js 20+ 與 pnpm**

```bash
brew install nvm
echo 'export NVM_DIR="$HOME/.nvm"' >> ~/.zshrc
echo '[ -s "$(brew --prefix nvm)/nvm.sh" ] && . "$(brew --prefix nvm)/nvm.sh"' >> ~/.zshrc
source ~/.zshrc
nvm install 20 && nvm use 20
npm install -g pnpm
```

**步驟 3：Rancher Desktop（K8s）**

1. 下載 [https://rancherdesktop.io](https://rancherdesktop.io) → 安裝 `.dmg`
2. Preferences → Kubernetes → Enable Kubernetes → Apply
3. 等待右下角圖示變綠（約 3–5 分鐘）
4. 確認：`kubectl cluster-info`

```bash
# PATH 設定（若找不到 kubectl / helm / rdctl）
echo 'export PATH="$PATH:$HOME/.rd/bin"' >> ~/.zshrc
source ~/.zshrc
```

**步驟 4：Helm**

```bash
brew install helm
```

**步驟 5：Cocos Creator（選用，只在修改 `assets/scripts/` 時需要）**

[https://www.cocos.com/creator](https://www.cocos.com/creator) → Cocos Dashboard → 安裝 Creator 3.8.7

### Windows 11

> **終端說明**：
> - **Git Bash**：執行所有 `.sh` 腳本（`start-dev.sh`、`build.sh`、`build-cocos.sh`）
> - **PowerShell**：執行 `pnpm`、`npx`、`kubectl`、`helm` 等一般指令
>
> Git 安裝時會自動包含 Git Bash。

**步驟 1：啟用 WSL2（必要，PowerShell 系統管理員）**

> `build.sh` 使用 `wsl -d rancher-desktop` 設定 K8s 容器 registry，WSL2 未啟用時會失敗。

```powershell
# 啟用 WSL2 及 Virtual Machine Platform
wsl --install
# 若已安裝 WSL1，升級至 WSL2：
wsl --set-default-version 2
```

> 完成後**重新開機**。重開後確認：`wsl --status` 應顯示 `Default Version: 2`。

**步驟 2：安裝基本工具（PowerShell 系統管理員）**

```powershell
# Git（含 Git Bash）
winget install Git.Git

# Node.js 20+
winget install OpenJS.NodeJS.LTS

# pnpm
npm install -g pnpm

# Helm
winget install Helm.Helm
```

**步驟 3：安裝 Rancher Desktop（K8s）**

1. 下載 [https://rancherdesktop.io](https://rancherdesktop.io) → 安裝 `.exe`
2. 開啟後：Preferences → WSL → 確認 **rancher-desktop** distro 已勾選
3. Preferences → Kubernetes → Enable → Apply & Restart
4. 等右下角 Kubernetes 圖示變綠（約 3–5 分鐘）
5. 確認（PowerShell）：`kubectl cluster-info`
6. 確認 WSL distro（PowerShell）：`wsl -l -v` → 應有 `rancher-desktop` 且 VERSION=2

> **PATH 確認**：若找不到 `kubectl`、`helm`、`rdctl`，手動將 `%USERPROFILE%\.rd\bin` 加入系統 PATH 後重開終端。

**步驟 4：Cocos Creator（選用，只在修改 `assets/scripts/` 時需要）**

[https://www.cocos.com/creator](https://www.cocos.com/creator) → Cocos Dashboard → 安裝 Creator 3.8.7

---

## 二、Clone & 安裝依賴

**Mac（Terminal）/ Windows（PowerShell 或 Git Bash）**：

```bash
git clone https://github.com/ibalasite/thunder-blessing-slot.git
cd thunder-blessing-slot
pnpm install
```

安裝 Playwright 瀏覽器（RPA 測試用，Mac/Windows 都要執行一次）：

```bash
npx playwright install chromium
```

---

## 三、K8s Dev 模式啟動（完整 stack）

| 服務 | URL |
|------|-----|
| 遊戲（Cocos） | `http://localhost:30080` |
| Fastify API | `http://localhost:30001` |
| Supabase Kong | `http://localhost:30000` |

> `build/web-desktop/` 已版控：**不需安裝 Cocos Creator** 即可部署完整 Phase 2 連線版遊戲。
> 只有修改 `assets/scripts/` 後才需要重新 build Cocos。

### 步驟 1：首次部署

> **Windows 請用 Git Bash 執行 `.sh` 腳本**（PowerShell 不支援）

```bash
# Mac Terminal 或 Windows Git Bash
./infra/k8s/start-dev.sh
```

首次約 **10–15 分鐘**，自動完成：
1. 建立 `thunder-dev` namespace
2. Helm install Supabase（PostgreSQL + GoTrue Auth + PostgREST + Kong）
3. 執行 DB migrations
4. Kaniko build + deploy Fastify API
5. Kaniko build + deploy Cocos nginx pod

### 步驟 2：確認所有服務正常

```bash
# Mac Terminal / Windows PowerShell / Windows Git Bash
kubectl get pods -n thunder-dev
```

預期全部 `Running`：

```
NAME                                    READY   STATUS
thunder-web-xxx                         1/1     Running   ← Fastify API
thunder-cocos-xxx                       1/1     Running   ← Cocos nginx
registry-xxx                            1/1     Running   ← image registry
supabase-supabase-db-0                  1/1     Running   ← PostgreSQL
supabase-supabase-kong-xxx              1/1     Running   ← Kong API Gateway
supabase-supabase-auth-xxx              1/1     Running   ← GoTrue Auth
supabase-supabase-rest-xxx              1/1     Running   ← PostgREST
supabase-supabase-meta-xxx              1/1     Running   ← Meta
```

### 步驟 3：開啟遊戲

瀏覽器開啟 `http://localhost:30080`，遊戲自動以 Phase 2 連線模式啟動。

### 步驟 4：更新 Fastify API（修改 `apps/web/src/` 後）

```bash
# Windows Git Bash 或 Mac Terminal
./infra/k8s/build.sh
kubectl rollout status deployment/thunder-web -n thunder-dev
```

### 步驟 5：更新 Cocos 遊戲（修改 `assets/scripts/` 後）

> 需已安裝 Cocos Creator 3.8.7。沒有 Creator 時腳本會跳過 build，直接使用現有 `build/web-desktop/`。

```bash
# Windows Git Bash 或 Mac Terminal
./infra/k8s/cocos/build-cocos.sh
kubectl rollout status deployment/thunder-cocos -n thunder-dev
```

---

## 四、API Dev 模式（只改 Fastify，不重 build Docker image）

> 只想改 API 邏輯並快速迭代。Fastify 跑在本機 port 3001，Supabase 仍在 K8s。
> **不需要 build Docker image，存檔即可自動重啟。**

前提：K8s stack 已透過 `start-dev.sh` 啟動（Supabase 需要在 K8s 裡）。

### 設定環境變數

**Mac（Terminal）**：
```bash
cp apps/web/.env.example apps/web/.env.local
```

**Windows（PowerShell）**：
```powershell
copy apps\web\.env.example apps\web\.env.local
```

編輯 `apps/web/.env.local`（內容相同，Mac/Windows 都一樣）：

```env
NODE_ENV=development
SUPABASE_URL=http://localhost:30000
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE2NDE3NjkyMDAsImV4cCI6MTc5OTUzNTYwMH0.ywbHA4mc8iwfpziFbKDMxj6K9HsJ5x3Y_34-PA8vQm8
JWT_SECRET=dev-jwt-secret-min-32-chars-long-here
ALLOWED_ORIGIN=*
```

### 啟動 Fastify

**Mac Terminal 或 Windows PowerShell**：

```bash
cd apps/web
pnpm dev
# API 在 http://localhost:3001
```

### 讓 Cocos 遊戲連到本機 Fastify

```
http://localhost:30080?apiUrl=http://localhost:3001
```

---

## 五、執行測試

### 測試分類總覽

| 測試類型 | 指令 | 需要 K8s |
|---------|------|---------|
| 遊戲引擎 unit | `pnpm test:unit` | 否 |
| 遊戲引擎全部 | `pnpm test` | 否 |
| API unit | `cd apps/web && pnpm test` | 否 |
| API integration | `cd apps/web && INTEGRATION=1 pnpm test:int` | 是（Supabase）|
| API E2E live | `cd apps/web && E2E_LIVE=1 pnpm test:e2e:live` | 是（完整 stack）|
| K8s E2E | `npx jest tests/e2e/ --no-coverage` | 是（完整 stack）|
| RPA 瀏覽器 | `npx playwright test tests/rpa/` | 是（完整 stack）|

---

### 不需要 K8s（可直接執行）

```bash
# ── Mac Terminal ──────────────────────────────────────────
# 遊戲引擎測試（根目錄）
pnpm test:unit               # unit 測試
pnpm test                    # 全部（unit + integration + e2e）
pnpm test:coverage           # 含覆蓋率報告

# Fastify API unit 測試
cd apps/web && pnpm test
cd apps/web && pnpm test:coverage
```

```powershell
# ── Windows PowerShell ───────────────────────────────────
# 遊戲引擎測試（根目錄）
pnpm test:unit
pnpm test
pnpm test:coverage

# Fastify API unit 測試
cd apps\web; pnpm test
cd apps\web; pnpm test:coverage
```

---

### 需要 K8s stack（先完成三、K8s Dev 模式啟動）

```bash
# ── Mac Terminal ──────────────────────────────────────────
cd apps/web

# API integration（需要 K8s Supabase）
INTEGRATION=1 pnpm test:int

# API live E2E（需要完整 K8s stack）
E2E_LIVE=1 pnpm test:e2e:live

# K8s E2E（根目錄）
cd ..
npx jest tests/e2e/ --no-coverage
```

```powershell
# ── Windows PowerShell ───────────────────────────────────
cd apps\web

# API integration（需要 K8s Supabase）
$env:INTEGRATION=1; pnpm test:int

# API live E2E（需要完整 K8s stack）
$env:E2E_LIVE=1; pnpm test:e2e:live

# K8s E2E（根目錄）
cd ..
npx jest tests/e2e/ --no-coverage
```

---

### RPA 瀏覽器測試（Playwright，需要完整 K8s stack）

> 前提：`npx playwright install chromium` 已執行過（見二、Clone & 安裝依賴）
> K8s 未啟動時 `beforeAll` 自動偵測，所有 RPA 測試會 skip（不會 fail）。
>
> ⚠️ **注意：不可加 `--timeout` 或 `--retries` 覆蓋旗標**，playwright.config.ts 已設好 `timeout: 60000, retries: 1`，
> 手動縮短 timeout 會造成大量誤判 fail。

```bash
# ── Mac Terminal 或 Windows PowerShell（指令相同）────────

# 全部 RPA 測試
npx playwright test tests/rpa/

# 只跑按鈕互動測試
npx playwright test tests/rpa/AllButtons.rpa.spec.ts

# 只跑儲值流程測試
npx playwright test tests/rpa/Deposit.rpa.spec.ts

# 互動式 UI 模式（可逐步觀察每個步驟）
npx playwright test --ui
```

---

## 六、K8s 管理（k9s）

**Mac**：
```bash
brew install derailed/k9s/k9s
k9s -n thunder-dev
```

**Windows**：
```powershell
scoop install k9s
# 或：winget install k9s
k9s -n thunder-dev
```

| 按鍵 | 功能 |
|------|------|
| `:pod` | Pod 列表 |
| `:deploy` | Deployment 列表 |
| `l` | Pod log |
| `d` | Describe |
| `ctrl+d` | 刪除 |
| `q` | 離開 |

---

## 七、常見問題

### `kubectl` / `helm` / `rdctl` 找不到指令

**Mac**：
```bash
echo 'export PATH="$PATH:$HOME/.rd/bin"' >> ~/.zshrc && source ~/.zshrc
```

**Windows PowerShell（永久設定）**：
```powershell
[Environment]::SetEnvironmentVariable("PATH", "$env:PATH;$env:USERPROFILE\.rd\bin", "User")
# 重新開啟 PowerShell 後生效
```

### `start-dev.sh` 在 Windows 無法執行

確認使用 **Git Bash**（不是 PowerShell 或 cmd）：
```bash
# 在 Git Bash 中執行
./infra/k8s/start-dev.sh
```

### Helm 安裝 Supabase 失敗（`nil pointer` / `kong.credentials.anonKey`）

Supabase Helm chart 不同版本的 values schema 有差異。`values-dev.yaml` 已同時提供
`secret.jwt` 與 `kong.credentials` 兩種格式，理論上任何版本均可渲染。
若仍失敗，請先更新 helm repo 再重試：
```bash
# Git Bash 或 Mac Terminal
helm repo update supabase
./infra/k8s/start-dev.sh
```

### `build.sh` 失敗：`tee: C:/Program Files/Git/etc/rancher/k3s/...`

這表示 WSL2 未正確啟用，`wsl -d rancher-desktop` 指令找不到 distro。
確認步驟：
```powershell
# PowerShell — 應看到 rancher-desktop (Version 2)
wsl -l -v
```
若缺少 `rancher-desktop`：重新開啟 Rancher Desktop → Preferences → WSL → 勾選 `rancher-desktop` → Apply。

### `build-cocos.sh` 失敗：`one of src or dest must be a local file specification`

這是 `kubectl cp` 在 Git Bash 下的路徑辨識問題。指令碼已內建 `cygpath` 轉換，
確認使用最新 code（`git pull`）後重試。若問題持續，確認 Rancher Desktop
版本 ≥ 1.10（kubectl ≥ 1.28）：
```powershell
kubectl version --client
```

### Build 時 kaniko 失敗

```bash
kubectl logs -n thunder-dev -l build-tag=<IMAGE_TAG> --tail=50
kubectl delete job -n thunder-dev -l app=kaniko --ignore-not-found
./infra/k8s/build.sh
```

### Pod 一直 `ImagePullBackOff`

```bash
curl http://localhost:30500/v2/thunder-web/tags/list
curl http://localhost:30500/v2/thunder-cocos/tags/list
# tag 不存在 → 重新執行 build script
```

### Supabase pod 一直 `Pending`

```bash
kubectl describe pod -n thunder-dev -l app.kubernetes.io/instance=supabase | grep -A5 Events
# 通常是 PVC 無法建立 → 確認 Rancher Desktop 已啟用 local-path provisioner
kubectl get storageclass
# 應有 local-path (default)
```

### pnpm lockfile 錯誤

```bash
pnpm install --no-frozen-lockfile
```

### `JWT_SECRET` 長度不足

`JWT_SECRET` 必須至少 32 個字元，否則 Fastify 啟動會報錯。

### Port 衝突

**Mac**：
```bash
lsof -i :30001
lsof -i :30080
lsof -i :30000
```

**Windows（PowerShell）**：
```powershell
netstat -ano | findstr :30001
netstat -ano | findstr :30080
netstat -ano | findstr :30000
# 找到 PID 後：
taskkill /PID <PID> /F
```

### Rancher Desktop K8s 重置後需重新部署

```bash
# 重新執行一鍵啟動
./infra/k8s/start-dev.sh
```

### `git pull` 後 Live E2E / RPA 測試失敗

`git pull` 只更新本機程式碼，K8s 裡的 image **不會自動更新**。
若 pull 後 `apps/web/src/` 或 `build/web-desktop/` 有變更，需重新 build 並部署：

```bash
# Mac Terminal 或 Windows Git Bash

# 更新 Fastify API image
./infra/k8s/build.sh
kubectl rollout status deployment/thunder-web -n thunder-dev

# 若 Cocos 前端也有變更
./infra/k8s/cocos/build-cocos.sh
kubectl rollout status deployment/thunder-cocos -n thunder-dev
```

> 跳過此步驟會導致：balance 型別錯誤、replay 404、HUD 按鈕標籤顯示舊內容等。

---

## CI/CD

| 觸發 | 動作 |
|------|------|
| 每次 Push | 遊戲引擎測試 + API unit tests（100% coverage）|
| main branch | 全部測試 → Deploy to Render |
| `supabase/migrations/` 變更 | DB migration |

---

## 架構文件

完整設計請參閱 [docs/EDD-refactor-architecture.md](docs/EDD-refactor-architecture.md)。

---

*RTP 目標：97.5% ± 0.5%（4 種模式均已驗證）*
*測試：888 tests（遊戲引擎）+ 269 tests（API unit，100% coverage）+ K8s E2E + RPA Visual E2E（14 steps）*
