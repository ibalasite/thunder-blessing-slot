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

```bash
# 1. Node.js 20+
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.zshrc
nvm install 20 && nvm use 20

# 2. pnpm
npm install -g pnpm

# 3. Rancher Desktop（K8s + 容器執行環境）
#    下載：https://rancherdesktop.io → 安裝 .dmg
#    Preferences → Kubernetes → Enable Kubernetes → Apply
#    確認：kubectl cluster-info

# 4. Python + Playwright（RPA 視覺 E2E 測試用）
pip3 install playwright && playwright install chromium

# 5. Cocos Creator（修改遊戲邏輯時才需要）
#    下載 Cocos Dashboard：https://www.cocos.com/creator
#    安裝 Cocos Creator 3.8.x
```

### Windows 11

```powershell
# 1. Git
winget install Git.Git

# 2. Node.js 20+
winget install OpenJS.NodeJS.LTS

# 3. pnpm
npm install -g pnpm

# 4. Rancher Desktop
#    下載：https://rancherdesktop.io → 安裝 .exe
#    Preferences → Kubernetes → Enable Kubernetes → Apply
#    確認：kubectl cluster-info

# 5. Python + Playwright
winget install Python.Python.3
pip install playwright
playwright install chromium

# 6. Cocos Creator（修改遊戲邏輯時才需要）
#    https://www.cocos.com/creator
```

---

## 二、Clone & 安裝依賴

```bash
git clone https://github.com/ibalasite/thunder-blessing-slot.git
cd thunder-blessing-slot
pnpm install
```

---

## 三、K8s Dev 模式啟動（完整 stack）

> Cocos 遊戲（nginx）、Fastify API、Supabase 全在 K8s（Rancher Desktop k3s）。
>
> - 遊戲：`http://localhost:30080`
> - Fastify API：`http://localhost:30001`
> - Supabase：`http://localhost:30005`

### 步驟 1：首次部署

```bash
./infra/k8s/build.sh
# 首次約 5-10 分鐘（下載 kaniko、建立 namespace、啟動 Supabase）
```

### 步驟 2：確認所有服務正常

```bash
kubectl get pods -n thunder-dev
# 預期全部 Running：
#   thunder-web-xxx      ← Fastify API
#   thunder-cocos-xxx    ← Cocos nginx
#   registry-xxx         ← in-cluster image registry（port 30500）
#   supabase-*           ← DB / Kong / Auth / REST / Meta
```

### 步驟 3：開啟遊戲

```
http://localhost:30080
```

### 步驟 4：更新 Fastify API（修改 apps/web/src/ 後）

```bash
IMAGE_TAG=$(git rev-parse --short HEAD)
./infra/k8s/build.sh $IMAGE_TAG
kubectl rollout status deployment/thunder-web -n thunder-dev
```

### 步驟 5：更新 Cocos 遊戲（修改 assets/scripts/ 後）

```bash
IMAGE_TAG="cocos-$(git rev-parse --short HEAD)"
./infra/k8s/cocos/build-cocos.sh $IMAGE_TAG
kubectl rollout status deployment/thunder-cocos -n thunder-dev
```

---

## 四、API Dev 模式（只改 Fastify，不重 build Docker image）

> 只想改 API 邏輯並快速迭代時使用。Fastify 跑在本機，Supabase 仍在 K8s。
> **不需要 build Docker image，存檔即可重啟。**

### 前提

K8s stack 已在運行（Supabase 需要在 K8s 裡）。

### 設定環境變數

```bash
cp apps/web/.env.example apps/web/.env.local
```

編輯 `apps/web/.env.local`：

```env
NODE_ENV=development
SUPABASE_URL=http://localhost:30005
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE2NDE3NjkyMDAsImV4cCI6MTc5OTUzNTYwMH0.ywbHA4mc8iwfpziFbKDMxj6K9HsJ5x3Y_34-PA8vQm8
JWT_SECRET=dev-jwt-secret-min-32-chars-long-here
ALLOWED_ORIGIN=*
```

### 啟動 Fastify

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

```bash
# ── 遊戲引擎測試（根目錄）─────────────────────────────────────
pnpm test                          # 全部（888 tests）

# ── Fastify API 測試（apps/web）──────────────────────────────
cd apps/web
pnpm test                          # unit tests（100% coverage）
pnpm test:coverage                 # unit tests + coverage report
INTEGRATION=1 pnpm test:int        # integration tests（需要 K8s Supabase）
E2E_LIVE=1 pnpm test:e2e:live     # live API E2E（需要 K8s stack 運行）

# ── K8s 端對端測試────────────────────────────────────────────
npx jest tests/e2e/k8s-server.e2e.test.ts --no-coverage

# ── RPA 視覺 E2E（Cocos client 全流程）───────────────────────
python3 tests/visual-e2e/e2e_slot_test.py --target k8s
```

Windows PowerShell：

```powershell
$env:INTEGRATION=1; pnpm test:int
$env:E2E_LIVE=1; pnpm test:e2e:live
```

---

## 六、K8s 管理（k9s）

```bash
brew install derailed/k9s/k9s   # Mac
scoop install k9s               # Windows

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

### kubectl: command not found

```bash
# Mac
export PATH="$PATH:$HOME/.rd/bin"
source ~/.zshrc
```

### Build 時 kaniko 失敗

```bash
kubectl logs -n thunder-dev -l build-tag=<IMAGE_TAG> --tail=50
kubectl delete job -n thunder-dev -l app=kaniko --ignore-not-found
./infra/k8s/build.sh
```

### Pod 一直 ImagePullBackOff

```bash
curl http://localhost:30500/v2/thunder-web/tags/list
curl http://localhost:30500/v2/thunder-cocos/tags/list
# tag 不存在 → 重新執行 build script
```

### pnpm lockfile 錯誤

```bash
pnpm install --no-frozen-lockfile
```

### JWT_SECRET 長度不足

`JWT_SECRET` 必須至少 32 個字元。

### Port 衝突

```bash
lsof -i :30001   # Mac
lsof -i :30080
```

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
*測試：888 tests（遊戲引擎）+ 269 tests（API unit，100% coverage）+ K8s E2E + RPA Visual E2E（11 steps）*
