# Thunder Blessing Slot — 開發啟動指南

> **[已過期 — Phase 1 舊文件]**
>
> 本文件描述的是 Phase 1 單機版設定方式，**目前專案已升級為 Phase 2 K8s 連線版**。
>
> 請改看 **[README.md](README.md)** 的「三、K8s Dev 模式啟動」章節。
> 一鍵啟動指令：`./infra/k8s/start-dev.sh`

---

> ⚠️ 以下為歷史參考，僅適用於需要在無 K8s 環境下跑 Phase 1 單機版的情境。

---

## 📋 你現在有什麼

```
C:\Projects\thunder-blessing-slot\
├── assets\
│   ├── scenes\
│   │   └── Main.scene          ← 遊戲主場景
│   └── scripts\
│       ├── GameConfig.ts       ← 所有遊戲常數（賠率、符號、尺寸）
│       ├── GameState.ts        ← 遊戲狀態管理
│       ├── WinChecker.ts       ← 中獎判斷邏輯
│       ├── ReelManager.ts      ← 滾輪視覺 + 動畫
│       ├── UIController.ts     ← UI 元素管理
│       └── GameBootstrap.ts    ← 主控制器（遊戲主流程）
├── project.json                ← Cocos 專案設定
├── tsconfig.json
└── GEMINI_IMAGE_PROMPTS.md     ← 生成遊戲圖片用的 AI Prompts
```

---

## 🛠 STEP 1：安裝 Cocos Dashboard

**Cocos Dashboard 是 Cocos Creator 的啟動器（類似 Unity Hub）**

1. 開啟瀏覽器，前往：
   https://www.cocos.com/creator

2. 點選 **「下載」** → 選擇 **Cocos Dashboard**

3. 安裝後開啟 **Cocos Dashboard**

4. 登入（免費帳號即可）或跳過

5. 在 Dashboard 左側點選 **「安裝」** 頁籤

6. 選擇 **Cocos Creator 3.8.x（最新版）** → 點「安裝」

   > ⏳ 第一次安裝約需 10-20 分鐘，檔案約 1-2 GB

---

## 🚀 STEP 2：在 Cocos Creator 開啟專案

1. 在 Cocos Dashboard 中，點選左側 **「Projects」** 頁籤

2. 點選右上角 **「Add」** 或 **「Open Other」**

3. 瀏覽至：
   ```
   C:\Projects\thunder-blessing-slot
   ```

4. 選擇該資料夾後點 **「Open」**

5. Cocos Creator 會開啟並開始「建立 Library」

   > ⏳ 首次開啟需要 1-3 分鐘初始化，請耐心等候

---

## 👀 STEP 3：確認場景和腳本

Cocos Creator 開啟後，你會看到：

```
┌─────────────────────────────────────────────┐
│  菜單列   File Edit Node Component ...      │
├──────────┬──────────────────────┬────────────┤
│ 場景樹   │    [場景預覽視窗]    │  屬性面板  │
│ Hierarchy│                      │ Inspector  │
├──────────┴──────────────────────┴────────────┤
│           資源管理器 Assets                  │
└─────────────────────────────────────────────┘
```

**確認步驟：**

a. 左下角 **Assets** 面板中，展開 `assets/scripts/`
   → 應看到 6 個 `.ts` 腳本檔案 ✓

b. 在 Assets 雙擊 `assets/scenes/Main.scene`
   → 場景應該載入到場景預覽視窗

c. 在左上角 **Hierarchy** 面板中，應看到：
   ```
   Scene
    └── Canvas
   ```

---

## ▶️ STEP 4：執行遊戲

1. 確認場景已載入（Hierarchy 有 Canvas節點）

2. 點選頂部工具列的 **▶ 播放按鈕**（綠色三角形）

   > 第一次點選會開啟瀏覽器視窗顯示遊戲

3. 你應該看到：
   - 黑色背景的遊戲畫面
   - 5 × 3 的彩色格子（符號以色塊 + 文字顯示）
   - 底部有 SPIN 按鈕、餘額、投注額

4. 點選 **SPIN** 按鈕開始遊戲！

---

## 🎮 第一版功能清單

| 功能 | 狀態 |
|------|------|
| 5 × 3 滾輪（可擴展至 5 × 6） | ✅ |
| 10 種符號（色塊佔位） | ✅ |
| 25 條連線中獎判斷 | ✅ |
| Wild 替換功能 | ✅ |
| Cascade 連鎖消除 | ✅ |
| 滾輪擴展動畫 | ✅ |
| 閃電標記系統 | ✅ |
| 雷霆祝福 Scatter 觸發 | ✅ |
| Coin Toss（自動隨機） | ✅ |
| Free Game + 倍率系統 | ✅ |
| Extra Bet | ✅ |
| Buy Free Game | ✅ |
| 最高獎金上限（30,000×） | ✅ |
| 真實遊戲圖片 | ❌ 需用 Gemini 生成後替換 |

---

## ⚠️ 常見問題排解

### 問題 1：腳本有紅色錯誤
**原因：** 可能是 Cocos Creator 版本與腳本不完全相容
**解法：**
- 在 Cocos Creator 左下 Console 查看具體錯誤
- 常見修正：某些 import 名稱在舊版本不同

### 問題 2：場景空白
**原因：** Main.scene 可能未正確包含 GameBootstrap
**解法：**
1. 在 Hierarchy 選中 Canvas 節點
2. 在右側 Inspector 面板最下方點「Add Component」
3. 搜尋 `GameBootstrap` 並添加

### 問題 3：點 SPIN 沒反應
**原因：** 腳本可能有編譯錯誤
**解法：**
- 確認 Console（左下角）沒有紅色錯誤
- 如有，貼上錯誤訊息給 AI 助手協助修改

### 問題 4：Cocos Dashboard 找不到 Creator 3.8
**解法：**
- 更新 Dashboard 到最新版
- 或安裝 3.7.x 版本（3.7 也相容）
- 在 project.json 中把 `"creator_version": "3.8.0"` 改為你安裝的版本

---

## 🖼 STEP 5（選用）：替換真實遊戲圖片

1. 參考 `GEMINI_IMAGE_PROMPTS.md` 中的 Prompt
2. 到 Gemini (https://gemini.google.com) 或其他 AI 圖片工具生成
3. 將生成圖片存入 `assets/textures/symbols/`
4. 在 Cocos Creator 中，Assets 面板會自動顯示新圖片
5. 要替換占位符，需修改 `ReelManager.ts` 的 `drawCell()` 函式
   （可以再請 AI 協助改這段程式碼）

---

## 📦 STEP 6：打包成 HTML5 檔案

想要把遊戲給別人玩：

1. 在 Cocos Creator 頂部選單：**Project → Build**

2. 在打包設定中：
   - **Platform** 選 `Web Mobile` 或 `Web Desktop`
   - **Build Path** 設為 `C:\Projects\thunder-blessing-slot\build\`

3. 點 **Build** → 等待完成

4. 完成後打開 `build\web-desktop\index.html`
   → 可在任何現代瀏覽器直接開啟！

5. 將整個 `build\web-desktop\` 資料夾上傳到主機
   → 任何人都可以用瀏覽器玩！

---

## 🗺 後續版本計畫（V2）

目前 V1 有些功能用隨機模擬：
- Coin Toss：自動 50/50 隨機（V2 可改為玩家手動翻）

V2 新增功能：
- [ ] 真實圖片替換色塊
- [ ] 音效系統（旋轉聲、獲獎聲）
- [ ] 手動 Coin Toss 動畫
- [ ] 57 條連線（目前 V1 使用 25 條連線，因為擴展後正確連線定義複雜）
- [ ] 粒子特效（閃電、贏得獎金時的金幣噴出）
- [ ] 投注額選擇 UI 改善

---

## 📞 需要幫助時

把以下資訊貼給 AI 助手（GitHub Copilot 或 ChatGPT）：

```
我正在用 Cocos Creator 3.8 開發 Thunder Blessing 老虎機
專案路徑：C:\Projects\thunder-blessing-slot
[貼上錯誤訊息或需求]
```
