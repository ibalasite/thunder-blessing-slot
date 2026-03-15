# Thunder Blessing Slot

希臘神話風格老虎機遊戲，以 Cocos Creator 3.8 開發。

高賠符號為宙斯（Zeus）、天馬（Pegasus）、雅典娜（Athena）、雄鷹（Eagle）；低賠符號為英文字母 Z、E、U、S。

特色：滾輪自動擴展（Cascade）、雷霆 Scatter 變換符號、硬幣翻轉決定免費遊戲次數與倍率、最高 30,000× 總投注額獎金。

---

## 專案結構

```
thunder-blessing-slot/
├── assets/
│   ├── scenes/
│   │   └── Main.scene          ← 遊戲主場景
│   └── scripts/
│       ├── GameConfig.ts       ← 所有遊戲常數（賠率、符號、尺寸）
│       ├── GameState.ts        ← 遊戲狀態管理
│       ├── WinChecker.ts       ← 中獎判斷邏輯
│       ├── ReelManager.ts      ← 滾輪視覺 + 動畫
│       ├── UIController.ts     ← UI 元素管理
│       └── GameBootstrap.ts    ← 主控制器（遊戲主流程）
├── project.json
├── tsconfig.json
├── GDD_Thunder_Blessing_Slot.md   ← 完整遊戲設計文件
├── SETUP_GUIDE.md                 ← 詳細開發環境設定指南
└── GEMINI_IMAGE_PROMPTS.md        ← 遊戲美術 AI Prompts
```

---

## 環境需求

- [Cocos Dashboard](https://www.cocos.com/creator)（免費）
- Cocos Creator **3.8.x**

---

## 安裝 & 執行

### 1. 安裝 Cocos Creator

1. 前往 https://www.cocos.com/creator 下載 **Cocos Dashboard**
2. 安裝並開啟 Dashboard
3. 左側點選「安裝」頁籤 → 選擇 **Cocos Creator 3.8.x** → 安裝（約 1-2 GB）

### 2. 開啟專案

1. 在 Cocos Dashboard 左側點選「Projects」
2. 點選「Add」或「Open Other」
3. 瀏覽並選擇此資料夾：`C:\Projects\thunder-blessing-slot`
4. 等待初始化完成（首次約 1-3 分鐘）

### 3. 執行遊戲

1. 在 Assets 面板中雙擊 `assets/scenes/Main.scene` 載入場景
2. 點選頂部工具列的 **▶ Play** 按鈕
3. 遊戲會在 Cocos Creator 內建預覽視窗中啟動

> 詳細步驟請參考 [SETUP_GUIDE.md](SETUP_GUIDE.md)

---

## 遊戲規則概述

| 項目 | 內容 |
|------|------|
| 滾輪數量 | 5 個 |
| 基本列數 | 3 列（最大擴展至 6 列） |
| 基本連線數 | 25 條（最大 57 條） |
| 最大獎金 | 30,000 × 總投注額 |

### 核心機制

- **Cascade（連鎖消除）**：中獎符號消除後，上方符號下落，滾輪逐步擴展至 6 列
- **Thunder Blessing Scatter**：閃電標記出現時，Scatter 可將特定符號全部替換成同一種
- **Coin Toss（硬幣翻轉）**：進入免費遊戲前，翻轉硬幣決定遊戲次數（8 / 12 / 20 次）及倍率
- **Free Game（免費遊戲）**：Scatter 觸發，可累積再次觸發
- **Extra Bet**：額外投注提升 Scatter 出現機率
- **Buy Feature**：直接購買免費遊戲（25× 或 100× 總投注額）

> 完整詳細規則請參考 [GDD_Thunder_Blessing_Slot.md](GDD_Thunder_Blessing_Slot.md)
