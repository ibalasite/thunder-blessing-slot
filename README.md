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

## 專案結構

```
thunder-blessing-slot/               ← Mono-repo root (pnpm workspace)
├── assets/scripts/                  ← Cocos 遊戲邏輯（SlotEngine、GameConfig 等）
├── build/web-desktop/               ← Cocos 編譯產出（靜態檔，部署至 K8s nginx pod）
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
│   │   └── tests/                  ← unit（100% coverage）/ integration / e2e
│   └── worker/                     ← 每日 RTP 報表 / spin_logs 歸檔
├── infra/k8s/
│   ├── base/                        ← Deployment / Service / Ingress
│   ├── overlays/dev/                ← kustomize patch（local ENV、NodePort）
│   ├── build.sh                     ← Fastify API 一鍵 build + deploy
│   └── cocos/
│       ├── build-cocos.sh           ← Cocos 一鍵 build + deploy
│       ├── Dockerfile               ← nginx static server
│       └── nginx.conf
├── supabase/
│   ├── config.toml
│   ├── migrations/                  ← 版本化 SQL
│   └── seed.sql
├── tests/
│   ├── e2e/k8s-server.e2e.test.ts  ← K8s API E2E（10 tests）
│   ├── visual-e2e/e2e_slot_test.py ← RPA 視覺 E2E（11 steps，Playwright）
│   ├── integration/                 ← RTP 模擬、SlotEngine 整合
│   ├── unit/                        ← SlotEngine、GameFlow、BuyFG 等
│   └── security/                    ← CSPRNG 攻擊防禦
├── pnpm-workspace.yaml
├── package.json
└── docs/EDD-refactor-architecture.md  ← 完整架構設計文件
```

---

## 開發模式說明

| 模式 | 說明 | 適用場景 |
|------|------|---------|
| **Local Dev** | Fastify `pnpm dev` + Supabase in K8s | 修改 API 邏輯、跑 unit / integration tests |
| **K8s Dev** | 完整 K8s stack（Fastify + Cocos + Supabase 全在 K8s）| 端對端驗證、RPA 測試、模擬 production |

兩種模式都使用 **Rancher Desktop**（k3s）作為 K8s 與容器執行環境，Mac 和 Windows 操作一致。

---

## 一、環境安裝

### Mac

```bash
# 1. Node.js 20+（使用 nvm）
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.zshrc   # 或 ~/.bashrc
nvm install 20 && nvm use 20

# 2. pnpm
npm install -g pnpm

# 3. Supabase CLI
brew install supabase/tap/supabase

# 4. Rancher Desktop（K8s + 容器執行環境）
#    下載：https://rancherdesktop.io → 安裝 .dmg
#    安裝後：Rancher Desktop → Preferences → Kubernetes → 勾選 Enable Kubernetes → Apply
#    等待 K8s 啟動（約 1-2 分鐘）
#    確認：kubectl cluster-info

# 5. Python + Playwright（RPA 視覺 E2E 測試用）
pip3 install playwright && playwright install chromium

# 6. Cocos Creator（遊戲開發用，非必要）
#    下載 Cocos Dashboard：https://www.cocos.com/creator（Mac 版）
#    安裝後：Dashboard → 安裝 → Cocos Creator 3.8.x
```

### Windows 11

```powershell
# 以下指令在 PowerShell（管理員）執行

# 1. Git
winget install Git.Git

# 2. Node.js 20+
winget install OpenJS.NodeJS.LTS
# 重開 PowerShell 後確認：node -v

# 3. pnpm
npm install -g pnpm

# 4. Supabase CLI
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
irm get.scoop.sh | iex
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase

# 5. Rancher Desktop（K8s + 容器執行環境）
#    下載：https://rancherdesktop.io → 安裝 .exe
#    安裝後：Rancher Desktop → Preferences → Kubernetes → 勾選 Enable Kubernetes → Apply
#    等待 K8s 啟動（約 1-2 分鐘）
#    確認（PowerShell）：kubectl cluster-info

# 6. Python + Playwright（RPA 視覺 E2E 測試用）
winget install Python.Python.3
pip install playwright
playwright install chromium

# 7. Cocos Creator（遊戲開發用，非必要）
#    下載 Cocos Dashboard：https://www.cocos.com/creator（Windows 版）
#    安裝後：Dashboard → 安裝 → Cocos Creator 3.8.x
```

---

## 二、Clone & 安裝依賴

Mac 和 Windows 操作相同：

```bash
git clone https://github.com/ibalasite/thunder-blessing-slot.git
cd thunder-blessing-slot
pnpm install
```

---

## 三、Local Dev 模式啟動

> Fastify API 跑在本機（`localhost:3000`），Supabase 跑在 K8s（`localhost:30005`）。
> 適合修改 API 邏輯時快速迭代，不需要重新 build Docker image。

### 前提：K8s 中已有 Supabase

Supabase 是 K8s 的一部分，第一次需要先啟動 K8s stack（見「K8s Dev 模式」第 1-3 步）。

### 設定環境變數

複製範本並填入 K8s Supabase 的連線資訊：

```bash
# Mac
cp apps/web/.env.example apps/web/.env.local

# Windows（PowerShell）
Copy-Item apps\web\.env.example apps\web\.env.local
```

編輯 `apps/web/.env.local`：

```env
NODE_ENV=development
SUPABASE_URL=http://localhost:30005
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE2NDE3NjkyMDAsImV4cCI6MTc5OTUzNTYwMH0.ywbHA4mc8iwfpziFbKDMxj6K9HsJ5x3Y_34-PA8vQm8
JWT_SECRET=dev-jwt-secret-min-32-chars-long-here
ALLOWED_ORIGIN=*
```

### 啟動 Fastify API

```bash
# Mac / Windows（PowerShell）
cd apps/web
pnpm dev
# API 在 http://localhost:3000

# 驗證
# Mac：
curl http://localhost:3000/api/v1/health
# Windows（PowerShell）：
Invoke-RestMethod http://localhost:3000/api/v1/health
# 回應：{"status":"ok"}
```

---

## 四、K8s Dev 模式啟動

> 完整 stack 跑在 K8s（Rancher Desktop k3s）：
> - 遊戲（Cocos nginx）：`http://localhost:30080`
> - Fastify API：`http://localhost:30001`
> - Supabase（Kong gateway）：`http://localhost:30005`

### 步驟 1：首次部署完整 stack

```bash
# Mac（Terminal）/ Windows（Git Bash 或 WSL）
./infra/k8s/build.sh
# 首次約 5-10 分鐘（下載 kaniko、建立 namespace、啟動 Supabase）
```

### 步驟 2：確認所有服務正常

```bash
kubectl get pods -n thunder-dev
# 預期看到以下 pod 全部 Running：
#   thunder-web-xxx         ← Fastify API
#   thunder-cocos-xxx       ← Cocos nginx
#   registry-xxx            ← in-cluster image registry（port 30500）
#   supabase-supabase-db-0
#   supabase-supabase-kong-xxx
#   supabase-supabase-auth-xxx
#   supabase-supabase-rest-xxx
#   supabase-supabase-meta-xxx
```

### 步驟 3：開啟遊戲

```
http://localhost:30080
```

### 步驟 4：更新 Fastify API（有 code 異動時）

修改 `apps/web/src/` 後重新 build 並 deploy：

```bash
# 取得目前 git commit SHA 作為 image tag
IMAGE_TAG=$(git rev-parse --short HEAD)

# Build + push 至 in-cluster registry + deploy
./infra/k8s/build.sh $IMAGE_TAG

# 確認 rollout 完成
kubectl rollout status deployment/thunder-web -n thunder-dev
```

### 步驟 5：更新 Cocos 遊戲（有 Cocos code 異動時）

修改 `assets/scripts/` 後，需重新 build Cocos 並 deploy：

```bash
# 方法一：使用自動化腳本（建議）
# 腳本會自動呼叫 Cocos Creator CLI build，再透過 kaniko 打包進 K8s
IMAGE_TAG="cocos-$(git rev-parse --short HEAD)"
./infra/k8s/cocos/build-cocos.sh $IMAGE_TAG

# 確認 rollout 完成
kubectl rollout status deployment/thunder-cocos -n thunder-dev
```

> **說明**：Cocos 遊戲打包流程：
> 1. `build-cocos.sh` 呼叫 Cocos Creator CLI → 產出 `build/web-desktop/`
> 2. 將 build output 上傳至 K8s PVC（build context）
> 3. 在 K8s 內執行 kaniko job → build nginx image → push 至 in-cluster registry（`localhost:30500`）
> 4. `kubectl set image` 更新 thunder-cocos deployment

---

## 五、K8s 管理（k9s）

k9s 是 K8s 的 Terminal UI，可以即時查看 pod、log、event，不需要一直打 kubectl。

### 安裝

```bash
# Mac
brew install derailed/k9s/k9s

# Windows（Scoop）
scoop install k9s
```

### 啟動

```bash
# 進入 thunder-dev namespace
k9s -n thunder-dev
```

### 常用操作

| 按鍵 | 功能 |
|------|------|
| `:pod` | Pod 列表 |
| `:deploy` | Deployment 列表 |
| `:svc` | Service 列表 |
| `:job` | Job 列表（kaniko build job）|
| `l` | 看 Pod log |
| `d` | Describe 資源 |
| `ctrl+d` | 刪除資源 |
| `/` | 搜尋過濾 |
| `esc` | 返回上一層 |
| `q` | 離開 |

### 常見用途

```bash
# 啟動後直接進 pod log
k9s -n thunder-dev
# → 選 thunder-web pod → 按 l → 即時 log

# 確認 kaniko build job 狀態
# → 按 :job → 看 kaniko-build-xxx 的狀態
```

---

## 七、切換 API 目標（Local Fastify ↔ K8s API）

Cocos 遊戲啟動時會讀取 API URL，優先順序：

1. `window.__THUNDER_CONFIG.apiUrl`（由 nginx 或測試框架注入）
2. URL query param：`?apiUrl=...`
3. 預設值：`http://localhost:30001`（K8s API）

### 連線到 K8s API（預設）

直接開啟：

```
http://localhost:30080
```

### 連線到 Local Fastify（pnpm dev，port 3000）

在 URL 加上 query param：

```
http://localhost:30080?apiUrl=http://localhost:3000
```

> 或在 Cocos Creator 開發預覽時（port 7456），同樣加上 `?apiUrl=http://localhost:3000`

---

## 八、執行測試

以下指令 Mac / Windows 相同（Windows 在 PowerShell 或 Git Bash 執行）：

```bash
# ── 遊戲引擎測試（根目錄）─────────────────────────────────────
pnpm test                          # 全部（888 tests：unit + integration + security）

# ── Fastify API Server 測試（apps/web）───────────────────────
cd apps/web
pnpm test                          # unit tests（100% coverage）
pnpm test:coverage                 # unit tests + coverage report
INTEGRATION=1 pnpm test:int        # integration tests（需要 Supabase 在 K8s 運行）
E2E=1 pnpm test:e2e               # full HTTP flow E2E

# ── K8s 端對端測試（需要 K8s stack 運行中）────────────────────
npx jest tests/e2e/k8s-server.e2e.test.ts --no-coverage   # 10 tests：health/auth/spin/replay

# ── RPA 視覺 E2E（需要 K8s stack + Playwright）────────────────
python3 tests/visual-e2e/e2e_slot_test.py --target k8s    # 11 steps：完整遊戲流程
```

Windows PowerShell 的環境變數寫法不同：

```powershell
# Integration tests
$env:INTEGRATION=1; pnpm test:int

# E2E tests
$env:E2E=1; pnpm test:e2e
```

---

## 九、常見問題

### kubectl: command not found

Rancher Desktop 的 `kubectl` 路徑可能未加入 shell PATH。

```bash
# Mac：加入 ~/.zshrc 或 ~/.bash_profile
export PATH="$PATH:$HOME/.rd/bin"
source ~/.zshrc

# Windows：Rancher Desktop 安裝時會提示加入 PATH，重開 PowerShell 即可
```

### Build 時 kaniko 失敗

```bash
# 查看 kaniko job log
kubectl logs -n thunder-dev -l build-tag=<IMAGE_TAG> --tail=50

# 清除失敗的 job 後重試
kubectl delete job -n thunder-dev -l app=kaniko --ignore-not-found
./infra/k8s/build.sh
```

### Pod 一直 ImagePullBackOff

確認 image 已成功 push 至 in-cluster registry：

```bash
curl http://localhost:30500/v2/thunder-web/tags/list
# 或
curl http://localhost:30500/v2/thunder-cocos/tags/list
```

如果 tag 不存在，重新執行 build script。

### pnpm install 出現 lockfile 錯誤

```bash
pnpm install --no-frozen-lockfile
```

### JWT_SECRET 長度不足

`JWT_SECRET` 必須至少 32 個字元，否則 Zod 驗證失敗。

### Port 衝突

```bash
# 查看佔用 port 的 process（Mac）
lsof -i :30001
lsof -i :30080

# Windows（PowerShell）
netstat -ano | findstr :30001
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

完整設計請參閱 [docs/EDD-refactor-architecture.md](docs/EDD-refactor-architecture.md)。

---

*RTP 目標：97.5% ± 0.5%（4 種模式均已驗證）*
*測試數量：888 tests（遊戲引擎）+ 138 tests（API unit，100% coverage）+ 10 tests（K8s E2E）+ 11 steps（RPA Visual E2E）*
*Phase 2：全部完成（2026-03-29）— Cocos ↔ K8s Fastify API 全端整合驗證 ✅*
