#!/usr/bin/env python3
"""
generate_gdd_html.py
將 Thunder Blessing Slot GDD 產生成含嵌入圖片的獨立 HTML 檔案
包含 SVG 說明圖、base64 截圖、企劃說明
"""
import base64, os
from PIL import Image
import io

IMG_DIR = r"C:\Projects\videosplit\gdd_images"
OUT_PATH = r"C:\Projects\videosplit\GDD_Thunder_Blessing.html"
MAX_W = 900  # 圖片最大寬度（px），超過就縮小

def img_to_b64(path, max_w=MAX_W):
    ext = os.path.splitext(path)[1].lower()
    mime = "image/png" if ext == ".png" else "image/jpeg"
    im = Image.open(path).convert("RGB")
    if im.width > max_w:
        ratio = max_w / im.width
        im = im.resize((max_w, int(im.height * ratio)), Image.LANCZOS)
    buf = io.BytesIO()
    fmt = "PNG" if mime == "image/png" else "JPEG"
    quality = 75 if fmt == "JPEG" else None
    if quality:
        im.save(buf, format=fmt, quality=quality, optimize=True)
    else:
        im.save(buf, format=fmt, optimize=True)
    b64 = base64.b64encode(buf.getvalue()).decode()
    return f"data:{mime};base64,{b64}"

print("載入圖片中（圖片較大請稍候）...")
imgs = {}
for fname in os.listdir(IMG_DIR):
    key = os.path.splitext(fname)[0]
    imgs[key] = img_to_b64(os.path.join(IMG_DIR, fname))
    print(f"  ✓ {fname}")

print("產生 HTML...")

# ── SVG 圖表定義 ──────────────────────────────────────────

SVG_REEL_BASIC = """
<svg viewBox="0 0 540 220" xmlns="http://www.w3.org/2000/svg" style="max-width:540px;display:block;margin:auto">
  <defs>
    <radialGradient id="g1" cx="50%" cy="50%"><stop offset="0%" stop-color="#fff8dc"/><stop offset="100%" stop-color="#c8860a"/></radialGradient>
  </defs>
  <rect width="540" height="220" rx="12" fill="#1a0a00"/>
  <text x="270" y="24" fill="#ffd700" font-size="13" text-anchor="middle" font-family="Arial">╔ 基本盤面 3列×5滾輪 ╗</text>
  <!-- 滾輪標題 -->
  <text x="54"  y="46" fill="#aaa" font-size="11" text-anchor="middle">滾輪1</text>
  <text x="162" y="46" fill="#aaa" font-size="11" text-anchor="middle">滾輪2</text>
  <text x="270" y="46" fill="#aaa" font-size="11" text-anchor="middle">滾輪3</text>
  <text x="378" y="46" fill="#aaa" font-size="11" text-anchor="middle">滾輪4</text>
  <text x="486" y="46" fill="#aaa" font-size="11" text-anchor="middle">滾輪5</text>
  <!-- 格子 3列 -->
  <g stroke="#8b6914" stroke-width="1.5" fill="url(#g1)">
    <rect x="10"  y="52" width="88" height="44" rx="6"/>
    <rect x="118" y="52" width="88" height="44" rx="6"/>
    <rect x="226" y="52" width="88" height="44" rx="6"/>
    <rect x="334" y="52" width="88" height="44" rx="6"/>
    <rect x="442" y="52" width="88" height="44" rx="6"/>
    <rect x="10"  y="100" width="88" height="44" rx="6"/>
    <rect x="118" y="100" width="88" height="44" rx="6"/>
    <rect x="226" y="100" width="88" height="44" rx="6"/>
    <rect x="334" y="100" width="88" height="44" rx="6"/>
    <rect x="442" y="100" width="88" height="44" rx="6"/>
    <rect x="10"  y="148" width="88" height="44" rx="6"/>
    <rect x="118" y="148" width="88" height="44" rx="6"/>
    <rect x="226" y="148" width="88" height="44" rx="6"/>
    <rect x="334" y="148" width="88" height="44" rx="6"/>
    <rect x="442" y="148" width="88" height="44" rx="6"/>
  </g>
  <!-- 列號 -->
  <text x="3" y="78"  fill="#ff9900" font-size="10" font-family="Arial">列1</text>
  <text x="3" y="126" fill="#ff9900" font-size="10" font-family="Arial">列2</text>
  <text x="3" y="174" fill="#ff9900" font-size="10" font-family="Arial">列3</text>
  <!-- 底部說明 -->
  <text x="270" y="208" fill="#ffd700" font-size="11" text-anchor="middle" font-family="Arial">↑ 每次 SPIN 開始時的初始狀態 → 25條連線</text>
</svg>"""

SVG_REEL_EXPANDED = """
<svg viewBox="0 0 580 340" xmlns="http://www.w3.org/2000/svg" style="max-width:580px;display:block;margin:auto">
  <rect width="580" height="340" rx="12" fill="#0a0a1a"/>
  <text x="290" y="22" fill="#00cfff" font-size="13" text-anchor="middle" font-family="Arial">Cascade 連鎖 → 滾輪逐步擴展至6列 × 57條連線</text>
  <!-- 擴展過程 -->
  <g font-family="Arial" font-size="10">
    <!-- Stage 1 -->
    <rect x="15" y="32" width="70" height="200" rx="6" fill="#1a2a1a" stroke="#00ff44" stroke-width="1.5"/>
    <text x="50" y="48" fill="#00ff44" text-anchor="middle">3列</text>
    <text x="50" y="62" fill="#aaa" text-anchor="middle">初始</text>
    <rect x="20" y="68" width="60" height="28" rx="4" fill="#2a4a2a" stroke="#00ff44"/>
    <rect x="20" y="100" width="60" height="28" rx="4" fill="#2a4a2a" stroke="#00ff44"/>
    <rect x="20" y="132" width="60" height="28" rx="4" fill="#2a4a2a" stroke="#00ff44"/>
    <text x="50" y="225" fill="#00ff44" font-size="9" text-anchor="middle">25線</text>
    <!-- Arrow -->
    <text x="97" y="130" fill="#ffd700" font-size="18" text-anchor="middle">→</text>
    <!-- Stage 2 -->
    <rect x="110" y="32" width="70" height="200" rx="6" fill="#1a2a1a" stroke="#66ff44" stroke-width="1.5"/>
    <text x="145" y="48" fill="#66ff44" text-anchor="middle">4列</text>
    <text x="145" y="62" fill="#aaa" text-anchor="middle">1次Cascade</text>
    <rect x="115" y="68" width="60" height="24" rx="4" fill="#2a4a2a" stroke="#66ff44"/>
    <rect x="115" y="96" width="60" height="24" rx="4" fill="#2a4a2a" stroke="#66ff44"/>
    <rect x="115" y="124" width="60" height="24" rx="4" fill="#2a4a2a" stroke="#66ff44"/>
    <rect x="115" y="152" width="60" height="24" rx="4" fill="#3a5a3a" stroke="#66ff44" stroke-dasharray="3"/>
    <text x="145" y="225" fill="#66ff44" font-size="9" text-anchor="middle">+多條</text>
    <!-- Arrow -->
    <text x="192" y="130" fill="#ffd700" font-size="18" text-anchor="middle">→</text>
    <!-- Stage 3 -->
    <rect x="205" y="32" width="70" height="200" rx="6" fill="#1a2a1a" stroke="#aaff44" stroke-width="1.5"/>
    <text x="240" y="48" fill="#aaff44" text-anchor="middle">5列</text>
    <text x="240" y="62" fill="#aaa" text-anchor="middle">2次Cascade</text>
    <rect x="210" y="68" width="60" height="20" rx="4" fill="#2a4a2a" stroke="#aaff44"/>
    <rect x="210" y="92" width="60" height="20" rx="4" fill="#2a4a2a" stroke="#aaff44"/>
    <rect x="210" y="116" width="60" height="20" rx="4" fill="#2a4a2a" stroke="#aaff44"/>
    <rect x="210" y="140" width="60" height="20" rx="4" fill="#3a5a3a" stroke="#aaff44" stroke-dasharray="3"/>
    <rect x="210" y="164" width="60" height="20" rx="4" fill="#3a5a3a" stroke="#aaff44" stroke-dasharray="3"/>
    <text x="240" y="225" fill="#aaff44" font-size="9" text-anchor="middle">+更多條</text>
    <!-- Arrow -->
    <text x="287" y="130" fill="#ffd700" font-size="18" text-anchor="middle">→</text>
    <!-- Stage 4 max -->
    <rect x="300" y="32" width="70" height="200" rx="6" fill="#1a1a00" stroke="#ffd700" stroke-width="2.5"/>
    <text x="335" y="48" fill="#ffd700" text-anchor="middle" font-weight="bold">6列</text>
    <text x="335" y="62" fill="#ffa500" text-anchor="middle">3次Cascade</text>
    <rect x="305" y="68" width="60" height="18" rx="4" fill="#4a4a00" stroke="#ffd700"/>
    <rect x="305" y="89" width="60" height="18" rx="4" fill="#4a4a00" stroke="#ffd700"/>
    <rect x="305" y="110" width="60" height="18" rx="4" fill="#4a4a00" stroke="#ffd700"/>
    <rect x="305" y="131" width="60" height="18" rx="4" fill="#5a5a00" stroke="#ffd700"/>
    <rect x="305" y="152" width="60" height="18" rx="4" fill="#5a5a00" stroke="#ffd700"/>
    <rect x="305" y="173" width="60" height="18" rx="4" fill="#6a6a00" stroke="#ffdd00" stroke-width="2"/>
    <text x="335" y="222" fill="#ffd700" font-size="10" text-anchor="middle" font-weight="bold">★ 57條連線</text>
    <!-- Coin toss trigger -->
    <text x="335" y="237" fill="#ff6600" font-size="9" text-anchor="middle">→ 再次Cascade</text>
    <text x="335" y="250" fill="#ff6600" font-size="9" text-anchor="middle">→ 觸發Coin Toss!</text>
  </g>
  <!-- Reset note -->
  <rect x="15" y="270" width="550" height="30" rx="6" fill="#2a0a0a" stroke="#ff4444" stroke-width="1"/>
  <text x="290" y="290" fill="#ff8888" font-size="11" text-anchor="middle" font-family="Arial">⚠ 新的 SPIN 開始時，滾輪重置回 3列 25條連線</text>
  <!-- New spin state -->
  <text x="290" y="320" fill="#555" font-size="10" text-anchor="middle" font-family="Arial">每輪 Cascade 積累的列數不會帶入下一輪</text>
</svg>"""

SVG_LIGHTNING = """
<svg viewBox="0 0 560 320" xmlns="http://www.w3.org/2000/svg" style="max-width:560px;display:block;margin:auto">
  <rect width="560" height="320" rx="12" fill="#0a0a1a"/>
  <text x="280" y="22" fill="#00cfff" font-size="13" text-anchor="middle" font-family="Arial">閃電標記 + 雷霆祝福 Scatter 流程</text>
  <!-- Step 1: Cascade happens -->
  <g transform="translate(15,35)">
    <rect width="150" height="120" rx="8" fill="#1a1a2a" stroke="#4444aa" stroke-width="1.5"/>
    <text x="75" y="18" fill="#aaaaff" font-size="10" text-anchor="middle">① Cascade 消除後</text>
    <!-- mini reel 3x3 -->
    <g font-family="Arial" font-size="9">
      <rect x="10" y="24" width="36" height="28" rx="3" fill="#aa3300" stroke="#ff6600"/>
      <text x="28" y="43" fill="#fff" text-anchor="middle">P1</text>
      <rect x="50" y="24" width="36" height="28" rx="3" fill="#aa3300" stroke="#ff6600"/>
      <text x="68" y="43" fill="#fff" text-anchor="middle">P1</text>
      <rect x="90" y="24" width="36" height="28" rx="3" fill="#aa3300" stroke="#ff6600"/>
      <text x="108" y="43" fill="#fff" text-anchor="middle">P1</text>
      <!-- row 2 empty with lightning -->
      <rect x="10" y="56" width="36" height="28" rx="3" fill="#00003a" stroke="#0088ff" stroke-dasharray="4"/>
      <text x="28" y="75" fill="#6699ff" text-anchor="middle" font-size="14">⚡</text>
      <rect x="50" y="56" width="36" height="28" rx="3" fill="#00003a" stroke="#0088ff" stroke-dasharray="4"/>
      <text x="68" y="75" fill="#6699ff" text-anchor="middle" font-size="14">⚡</text>
      <rect x="90" y="56" width="36" height="28" rx="3" fill="#00003a" stroke="#0088ff" stroke-dasharray="4"/>
      <text x="108" y="75" fill="#6699ff" text-anchor="middle" font-size="14">⚡</text>
      <!-- row 3 -->
      <rect x="10" y="88" width="36" height="28" rx="3" fill="#2a4a2a" stroke="#44aa44"/>
      <text x="28" y="107" fill="#fff" text-anchor="middle">L1</text>
      <rect x="50" y="88" width="36" height="28" rx="3" fill="#2a4a2a" stroke="#44aa44"/>
      <text x="68" y="107" fill="#fff" text-anchor="middle">L2</text>
      <rect x="90" y="88" width="36" height="28" rx="3" fill="#2a4a2a" stroke="#44aa44"/>
      <text x="108" y="107" fill="#fff" text-anchor="middle">SC</text>
    </g>
    <text x="75" y="116" fill="#6699ff" font-size="9" text-anchor="middle">藍色格 = 閃電標記</text>
  </g>
  <!-- Arrow -->
  <text x="175" y="100" fill="#ffd700" font-size="22" text-anchor="middle">→</text>
  <!-- Step 2: Scatter lands + TB triggers -->
  <g transform="translate(190,35)">
    <rect width="160" height="120" rx="8" fill="#1a0a2a" stroke="#aa44ff" stroke-width="2"/>
    <text x="80" y="18" fill="#cc88ff" font-size="10" text-anchor="middle">② Scatter落下→雷霆祝福!</text>
    <g font-family="Arial" font-size="9">
      <rect x="10" y="24" width="36" height="28" rx="3" fill="#2a4a2a" stroke="#44aa44"/>
      <text x="28" y="43" fill="#fff" text-anchor="middle">L1</text>
      <rect x="50" y="24" width="36" height="28" rx="3" fill="#2a4a2a" stroke="#44aa44"/>
      <text x="68" y="43" fill="#fff" text-anchor="middle">L2</text>
      <rect x="90" y="24" width="36" height="28" rx="3" fill="#2a4a2a" stroke="#44aa44"/>
      <text x="108" y="43" fill="#fff" text-anchor="middle">L3</text>
      <!-- marked cells flashing -->
      <rect x="10" y="56" width="36" height="28" rx="3" fill="#3a003a" stroke="#ff44ff" stroke-width="2"/>
      <text x="28" y="75" fill="#ff88ff" text-anchor="middle" font-size="14">⚡</text>
      <rect x="50" y="56" width="36" height="28" rx="3" fill="#3a003a" stroke="#ff44ff" stroke-width="2"/>
      <text x="68" y="75" fill="#ff88ff" text-anchor="middle" font-size="14">⚡</text>
      <rect x="90" y="56" width="36" height="28" rx="3" fill="#3a003a" stroke="#ff44ff" stroke-width="2"/>
      <text x="108" y="75" fill="#ff88ff" text-anchor="middle" font-size="14">⚡</text>
      <rect x="10" y="88" width="36" height="28" rx="3" fill="#2a4a2a" stroke="#44aa44"/>
      <text x="28" y="107" fill="#fff" text-anchor="middle">SC</text>
      <rect x="50" y="88" width="36" height="28" rx="3" fill="#2a4a2a" stroke="#44aa44"/>
      <text x="68" y="107" fill="#fff" text-anchor="middle">W</text>
      <rect x="90" y="88" width="36" height="28" rx="3" fill="#5a3a00" stroke="#ffaa00"/>
      <text x="108" y="107" fill="#ffd700" text-anchor="middle">SC ✦</text>
    </g>
    <text x="80" y="116" fill="#ff88ff" font-size="9" text-anchor="middle">Scatter 出現 → 啟動!</text>
  </g>
  <!-- Arrow -->
  <text x="362" y="100" fill="#ffd700" font-size="22" text-anchor="middle">→</text>
  <!-- Step 3: All marked become same symbol -->
  <g transform="translate(378,35)">
    <rect width="165" height="120" rx="8" fill="#1a1a00" stroke="#ffd700" stroke-width="2"/>
    <text x="82" y="18" fill="#ffd700" font-size="10" text-anchor="middle">③ 所有標記格→同種符號</text>
    <g font-family="Arial" font-size="9">
      <rect x="10" y="24" width="36" height="28" rx="3" fill="#2a4a2a" stroke="#44aa44"/>
      <text x="28" y="43" fill="#fff" text-anchor="middle">L1</text>
      <rect x="50" y="24" width="36" height="28" rx="3" fill="#2a4a2a" stroke="#44aa44"/>
      <text x="68" y="43" fill="#fff" text-anchor="middle">L2</text>
      <rect x="90" y="24" width="36" height="28" rx="3" fill="#2a4a2a" stroke="#44aa44"/>
      <text x="108" y="43" fill="#fff" text-anchor="middle">L3</text>
      <!-- transformed to P1 -->
      <rect x="10" y="56" width="36" height="28" rx="3" fill="#aa5500" stroke="#ffd700" stroke-width="2"/>
      <text x="28" y="75" fill="#ffd700" text-anchor="middle">P1</text>
      <rect x="50" y="56" width="36" height="28" rx="3" fill="#aa5500" stroke="#ffd700" stroke-width="2"/>
      <text x="68" y="75" fill="#ffd700" text-anchor="middle">P1</text>
      <rect x="90" y="56" width="36" height="28" rx="3" fill="#aa5500" stroke="#ffd700" stroke-width="2"/>
      <text x="108" y="75" fill="#ffd700" text-anchor="middle">P1</text>
      <rect x="10" y="88" width="36" height="28" rx="3" fill="#2a4a2a" stroke="#44aa44"/>
      <text x="28" y="107" fill="#fff" text-anchor="middle">SC</text>
      <rect x="50" y="88" width="36" height="28" rx="3" fill="#2a4a2a" stroke="#44aa44"/>
      <text x="68" y="107" fill="#fff" text-anchor="middle">W</text>
      <rect x="90" y="88" width="36" height="28" rx="3" fill="#5a3a00" stroke="#ffaa00"/>
      <text x="108" y="107" fill="#ffd700" text-anchor="middle">SC</text>
    </g>
    <text x="82" y="116" fill="#ffd700" font-size="9" text-anchor="middle">全部變 P1 → 重新計算!</text>
  </g>
  <!-- Second strike note -->
  <rect x="15" y="175" width="530" height="50" rx="8" fill="#2a0a2a" stroke="#cc44cc" stroke-width="1.5"/>
  <text x="280" y="197" fill="#ff88ff" font-size="11" text-anchor="middle" font-family="Arial" font-weight="bold">★ 雷霆祝福第二擊（可能觸發）</text>
  <text x="280" y="215" fill="#cc88ff" font-size="10" text-anchor="middle" font-family="Arial">所有標記格符號再升級：例如 P3 → P2 → P1（更高賠率符號）</text>
  <!-- Reset rules -->
  <rect x="15" y="238" width="530" height="65" rx="8" fill="#0a1a0a" stroke="#44aa44" stroke-width="1.5"/>
  <text x="280" y="256" fill="#88ff88" font-size="11" text-anchor="middle" font-family="Arial" font-weight="bold">閃電標記重置規則</text>
  <text x="280" y="274" fill="#88ff88" font-size="10" text-anchor="middle" font-family="Arial">普通遊戲：下一次 SPIN 開始時清除</text>
  <text x="280" y="292" fill="#ffaa44" font-size="10" text-anchor="middle" font-family="Arial">Free Game：整個 Free Game 結束後才清除（標記越積越多！）</text>
</svg>"""

SVG_COIN_TOSS = """
<svg viewBox="0 0 560 260" xmlns="http://www.w3.org/2000/svg" style="max-width:560px;display:block;margin:auto">
  <rect width="560" height="260" rx="12" fill="#0a0a1a"/>
  <text x="280" y="22" fill="#ffd700" font-size="13" text-anchor="middle" font-family="Arial">Coin Toss 硬幣翻轉流程</text>
  <!-- trigger condition -->
  <rect x="190" y="32" width="180" height="36" rx="8" fill="#2a1a00" stroke="#ff9900" stroke-width="2"/>
  <text x="280" y="53" fill="#ff9900" font-size="11" text-anchor="middle" font-family="Arial">6列已展開 + 再次Cascade成功</text>
  <!-- arrow down -->
  <line x1="280" y1="68" x2="280" y2="88" stroke="#ffd700" stroke-width="2" marker-end="url(#arr)"/>
  <defs><marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#ffd700"/></marker></defs>
  <!-- Coin -->
  <circle cx="280" cy="110" r="26" fill="#c8860a" stroke="#ffd700" stroke-width="3"/>
  <text x="280" y="107" fill="#ffd700" font-size="12" text-anchor="middle" font-family="Arial" font-weight="bold">硬幣</text>
  <text x="280" y="121" fill="#ffd700" font-size="10" text-anchor="middle" font-family="Arial">翻轉中</text>
  <!-- Heads branch -->
  <line x1="254" y1="132" x2="140" y2="162" stroke="#00ff88" stroke-width="2"/>
  <rect x="40" y="160" width="180" height="44" rx="8" fill="#002a10" stroke="#00ff88" stroke-width="2"/>
  <text x="130" y="181" fill="#00ff88" font-size="11" text-anchor="middle" font-family="Arial" font-weight="bold">⊙ 正面（Heads）</text>
  <text x="130" y="197" fill="#88ffcc" font-size="10" text-anchor="middle" font-family="Arial">→ 進入 Free Game（倍率 ×3）</text>
  <!-- Tails branch -->
  <line x1="306" y1="132" x2="420" y2="162" stroke="#ff4444" stroke-width="2"/>
  <rect x="340" y="160" width="180" height="44" rx="8" fill="#2a0000" stroke="#ff4444" stroke-width="2"/>
  <text x="430" y="181" fill="#ff6666" font-size="11" text-anchor="middle" font-family="Arial" font-weight="bold">○ 反面（Tails）</text>
  <text x="430" y="197" fill="#ff9999" font-size="10" text-anchor="middle" font-family="Arial">→ 結束，返回普通遊戲</text>
  <!-- Free Game multiplier chain -->
  <rect x="10" y="218" width="540" height="34" rx="8" fill="#1a1a00" stroke="#ffd700" stroke-width="1.5"/>
  <text x="280" y="233" fill="#ffd700" font-size="10" text-anchor="middle" font-family="Arial">Free Game 中每次Spin後再次Coin Toss：</text>
  <text x="280" y="247" fill="#ffaa44" font-size="11" text-anchor="middle" font-family="Arial">Heads → 倍率升：×3 → ×7 → ×17 → ×27 → ×77　　Tails → Free Game 結束</text>
</svg>"""

SVG_MULTIPLIER = """
<svg viewBox="0 0 560 100" xmlns="http://www.w3.org/2000/svg" style="max-width:560px;display:block;margin:auto">
  <rect width="560" height="100" rx="12" fill="#050510"/>
  <text x="280" y="18" fill="#ffd700" font-size="12" text-anchor="middle" font-family="Arial">Free Game 倍率升級路徑</text>
  <!-- stages -->
  <g font-family="Arial" font-size="11" text-anchor="middle">
    <circle cx="55"  cy="58" r="24" fill="#111133" stroke="#4444ff" stroke-width="2"/>
    <text x="55"  y="54" fill="#8888ff">x3</text><text x="55"  y="68" fill="#6666cc" font-size="8">初始</text>
    <text x="96"  y="62" fill="#ffd700" font-size="16">→</text>
    <circle cx="137" cy="58" r="24" fill="#112233" stroke="#4488ff" stroke-width="2"/>
    <text x="137" y="54" fill="#66aaff">x7</text><text x="137" y="68" fill="#4488cc" font-size="8">第2輪</text>
    <text x="178" cy="62" fill="#ffd700" font-size="16">→</text>
    <text x="178" y="62" fill="#ffd700" font-size="16">→</text>
    <circle cx="219" cy="58" r="24" fill="#223311" stroke="#44ff44" stroke-width="2"/>
    <text x="219" y="54" fill="#88ff88">x17</text><text x="219" y="68" fill="#66bb66" font-size="8">第3輪</text>
    <text x="260" y="62" fill="#ffd700" font-size="16">→</text>
    <circle cx="301" cy="58" r="24" fill="#332200" stroke="#ffaa00" stroke-width="2"/>
    <text x="301" y="54" fill="#ffcc44">x27</text><text x="301" y="68" fill="#cc8800" font-size="8">第4輪</text>
    <text x="342" y="62" fill="#ffd700" font-size="16">→</text>
    <circle cx="383" cy="58" r="28" fill="#3a1a00" stroke="#ff6600" stroke-width="3"/>
    <text x="383" y="54" fill="#ff9944" font-size="13" font-weight="bold">x77</text><text x="383" y="70" fill="#ff6600" font-size="8">最高!</text>
    <text x="424" y="62" fill="#ffd700" font-size="16">→</text>
    <rect x="440" y="34" width="105" height="48" rx="8" fill="#1a1a00" stroke="#ffd700" stroke-width="1.5"/>
    <text x="492" y="56" fill="#ffd700" font-size="10">再翻正面</text>
    <text x="492" y="70" fill="#ffaa44" font-size="9">維持 ×77</text>
  </g>
</svg>"""

SVG_EXTRA_BET = """
<svg viewBox="0 0 560 160" xmlns="http://www.w3.org/2000/svg" style="max-width:560px;display:block;margin:auto">
  <rect width="560" height="160" rx="12" fill="#0a0a1a"/>
  <text x="280" y="20" fill="#00cfff" font-size="13" text-anchor="middle" font-family="Arial">Extra Bet 比較說明</text>
  <!-- OFF side -->
  <rect x="15" y="30" width="250" height="118" rx="8" fill="#1a1a1a" stroke="#666666" stroke-width="1.5"/>
  <text x="140" y="50" fill="#aaaaaa" font-size="12" text-anchor="middle" font-family="Arial">Extra Bet OFF</text>
  <text x="140" y="70" fill="#888888" font-size="10" text-anchor="middle" font-family="Arial">每次旋轉花費：× 1 投注額</text>
  <text x="140" y="88" fill="#888888" font-size="10" text-anchor="middle" font-family="Arial">Scatter 出現：隨機（低機率）</text>
  <text x="140" y="106" fill="#888888" font-size="10" text-anchor="middle" font-family="Arial">雷霆祝福機率：一般</text>
  <text x="140" y="138" fill="#888" font-size="10" text-anchor="middle" font-family="Arial">例：投注0.25 → 每次0.25</text>
  <!-- ON side -->
  <rect x="295" y="30" width="250" height="118" rx="8" fill="#001a2a" stroke="#00cfff" stroke-width="2"/>
  <text x="420" y="50" fill="#00cfff" font-size="12" text-anchor="middle" font-family="Arial" font-weight="bold">★ Extra Bet ON</text>
  <text x="420" y="70" fill="#44aaff" font-size="10" text-anchor="middle" font-family="Arial">每次旋轉花費：× 3 投注額</text>
  <text x="420" y="88" fill="#00ff88" font-size="10" text-anchor="middle" font-family="Arial">保證每次至少出現 1 個 Scatter!</text>
  <text x="420" y="106" fill="#00ff88" font-size="10" text-anchor="middle" font-family="Arial">雷霆祝福機率：大幅提升</text>
  <text x="420" y="124" fill="#ffaa44" font-size="10" text-anchor="middle" font-family="Arial">獎金潛力：顯著提高</text>
  <text x="420" y="138" fill="#44aaff" font-size="10" text-anchor="middle" font-family="Arial">例：投注0.25 → 每次0.75</text>
</svg>"""

SVG_FLOW = """
<svg viewBox="0 0 600 580" xmlns="http://www.w3.org/2000/svg" style="max-width:600px;display:block;margin:auto">
  <defs>
    <marker id="a2" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#ffd700"/></marker>
    <marker id="a3" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#00ff88"/></marker>
    <marker id="a4" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#ff4444"/></marker>
  </defs>
  <rect width="600" height="580" rx="12" fill="#050510"/>
  <text x="300" y="20" fill="#ffd700" font-size="14" text-anchor="middle" font-family="Arial" font-weight="bold">完整遊戲流程圖</text>
  <!-- SPIN -->
  <rect x="200" y="28" width="200" height="34" rx="8" fill="#1a3a00" stroke="#00ff44" stroke-width="2"/>
  <text x="300" y="50" fill="#00ff88" font-size="12" text-anchor="middle" font-family="Arial" font-weight="bold">玩家按下 SPIN</text>
  <line x1="300" y1="62" x2="300" y2="80" stroke="#ffd700" stroke-width="2" marker-end="url(#a2)"/>
  <!-- Extra Bet check -->
  <rect x="185" y="80" width="230" height="34" rx="8" fill="#1a1a2a" stroke="#4444cc" stroke-width="1.5"/>
  <text x="300" y="98" fill="#8888ff" font-size="10" text-anchor="middle" font-family="Arial">Extra Bet ON → 花費3× / OFF → 花費1×</text>
  <text x="300" y="110" fill="#6666bb" font-size="9" text-anchor="middle" font-family="Arial">ON保證Scatter出現</text>
  <line x1="300" y1="114" x2="300" y2="130" stroke="#ffd700" stroke-width="2" marker-end="url(#a2)"/>
  <!-- Win check -->
  <polygon points="300,130 400,158 300,186 200,158" fill="#2a2a00" stroke="#ffd700" stroke-width="2"/>
  <text x="300" y="154" fill="#ffd700" font-size="11" text-anchor="middle" font-family="Arial">有中獎?</text>
  <text x="300" y="168" fill="#ffaa44" font-size="9" text-anchor="middle" font-family="Arial">連線符合?</text>
  <!-- No win -->
  <line x1="200" y1="158" x2="90" y2="158" stroke="#ff4444" stroke-width="2" marker-end="url(#a4)"/>
  <rect x="10" y="140" width="80" height="36" rx="6" fill="#2a0000" stroke="#ff4444"/>
  <text x="50" y="158" fill="#ff6666" font-size="10" text-anchor="middle" font-family="Arial">本輪</text>
  <text x="50" y="170" fill="#ff6666" font-size="10" text-anchor="middle" font-family="Arial">結束</text>
  <text x="145" y="152" fill="#ff4444" font-size="9" font-family="Arial">否</text>
  <!-- Yes win -->
  <line x1="300" y1="186" x2="300" y2="204" stroke="#00ff88" stroke-width="2" marker-end="url(#a3)"/>
  <text x="316" y="198" fill="#00ff88" font-size="9" font-family="Arial">是</text>
  <!-- Cascade box -->
  <rect x="160" y="204" width="280" height="50" rx="8" fill="#001a10" stroke="#00ff88" stroke-width="2"/>
  <text x="300" y="222" fill="#00ff88" font-size="10" text-anchor="middle" font-family="Arial">① 計算獎金 ② 中獎位置產生⚡閃電標記</text>
  <text x="300" y="238" fill="#88ffcc" font-size="10" text-anchor="middle" font-family="Arial">③ 消除符號 ④ 滾輪擴展1列 ⑤ 新符號落下</text>
  <line x1="300" y1="254" x2="300" y2="272" stroke="#ffd700" stroke-width="2" marker-end="url(#a2)"/>
  <!-- Scatter check -->
  <polygon points="300,272 420,298 300,324 180,298" fill="#1a002a" stroke="#cc44ff" stroke-width="2"/>
  <text x="300" y="294" fill="#cc88ff" font-size="10" text-anchor="middle" font-family="Arial">有⚡標記</text>
  <text x="300" y="308" fill="#cc88ff" font-size="10" text-anchor="middle" font-family="Arial">且有SC?</text>
  <!-- Yes scatter -->
  <line x1="180" y1="298" x2="100" y2="298" stroke="#cc44ff" stroke-width="2" marker-end="url(#a2)"/>
  <rect x="10" y="276" width="90" height="44" rx="6" fill="#1a002a" stroke="#cc44ff"/>
  <text x="55" y="297" fill="#cc88ff" font-size="9" text-anchor="middle" font-family="Arial">雷霆祝福!</text>
  <text x="55" y="311" fill="#aa66ff" font-size="8" text-anchor="middle" font-family="Arial">標記格→同符號</text>
  <text x="140" y="292" fill="#cc44ff" font-size="9" font-family="Arial">是</text>
  <!-- No scatter -->
  <line x1="300" y1="324" x2="300" y2="342" stroke="#ffd700" stroke-width="2" marker-end="url(#a2)"/>
  <!-- 6 row check -->
  <polygon points="300,342 420,366 300,390 180,366" fill="#2a1a00" stroke="#ff9900" stroke-width="2"/>
  <text x="300" y="362" fill="#ffaa44" font-size="10" text-anchor="middle" font-family="Arial">滾輪已</text>
  <text x="300" y="376" fill="#ffaa44" font-size="10" text-anchor="middle" font-family="Arial">6列?</text>
  <!-- No 6row - loop back -->
  <line x1="420" y1="366" x2="500" y2="366" stroke="#ffd700" stroke-width="2"/>
  <line x1="500" y1="366" x2="500" y2="158" stroke="#ffd700" stroke-width="2"/>
  <line x1="500" y1="158" x2="400" y2="158" stroke="#ffd700" stroke-width="2" marker-end="url(#a2)"/>
  <text x="462" y="360" fill="#ffaa44" font-size="9" font-family="Arial">否→繼續</text>
  <!-- Yes 6row -->
  <line x1="300" y1="390" x2="300" y2="406" stroke="#ff9900" stroke-width="2" marker-end="url(#a2)"/>
  <rect x="200" y="406" width="200" height="32" rx="8" fill="#2a1a00" stroke="#ff9900" stroke-width="2"/>
  <text x="300" y="427" fill="#ff9900" font-size="11" text-anchor="middle" font-family="Arial" font-weight="bold">Coin Toss 硬幣翻轉!</text>
  <line x1="300" y1="438" x2="300" y2="454" stroke="#ffd700" stroke-width="2" marker-end="url(#a2)"/>
  <!-- Result -->
  <line x1="200" y1="466" x2="100" y2="466" stroke="#00ff88" stroke-width="2" marker-end="url(#a3)"/>
  <rect x="10" y="450" width="90" height="32" rx="6" fill="#001a10" stroke="#00ff88"/>
  <text x="55" y="467" fill="#00ff88" font-size="10" text-anchor="middle" font-family="Arial">Heads!</text>
  <text x="55" y="479" fill="#88ffcc" font-size="9" text-anchor="middle" font-family="Arial">進入FG</text>
  <text x="145" y="460" fill="#00ff88" font-size="9" font-family="Arial">正面</text>
  <line x1="400" y1="466" x2="490" y2="466" stroke="#ff4444" stroke-width="2" marker-end="url(#a4)"/>
  <rect x="490" y="450" width="90" height="32" rx="6" fill="#2a0000" stroke="#ff4444"/>
  <text x="535" y="467" fill="#ff6666" font-size="10" text-anchor="middle" font-family="Arial">Tails</text>
  <text x="535" y="479" fill="#ff9999" font-size="9" text-anchor="middle" font-family="Arial">本輪結束</text>
  <text x="402" y="460" fill="#ff4444" font-size="9" font-family="Arial">反面</text>
  <polygon points="300,454 400,466 300,478 200,466" fill="#1a0a2a" stroke="#ffd700" stroke-width="2"/>
  <text x="300" y="470" fill="#ffd700" font-size="10" text-anchor="middle" font-family="Arial">正/反面?</text>
  <!-- max win -->
  <rect x="100" y="530" width="400" height="30" rx="6" fill="#2a0000" stroke="#ff4444" stroke-width="1.5"/>
  <text x="300" y="550" fill="#ff8888" font-size="10" text-anchor="middle" font-family="Arial">⚠ 任何時刻累計獎金超過 30,000× 投注額 → 立即結算</text>
</svg>"""

SVG_PAYTABLE = """
<svg viewBox="0 0 560 340" xmlns="http://www.w3.org/2000/svg" style="max-width:560px;display:block;margin:auto">
  <rect width="560" height="340" rx="12" fill="#0a0a1a"/>
  <text x="280" y="22" fill="#ffd700" font-size="13" text-anchor="middle" font-family="Arial" font-weight="bold">賠率一覽表（以總投注額為基準）</text>
  <!-- header -->
  <g font-family="Arial" font-size="10" text-anchor="middle">
    <rect x="10" y="30" width="540" height="24" rx="4" fill="#2a2a00"/>
    <text x="80"  y="47" fill="#ffd700">符號類型</text>
    <text x="210" y="47" fill="#ffd700">3個連線</text>
    <text x="310" y="47" fill="#ffd700">4個連線</text>
    <text x="410" y="47" fill="#ffd700">5個連線</text>
    <text x="500" y="47" fill="#ffd700">說明</text>
  </g>
  <!-- rows -->
  <g font-family="Arial" font-size="10" text-anchor="middle">
    <!-- Wild -->
    <rect x="10" y="56" width="540" height="22" rx="2" fill="#1a1a3a"/>
    <text x="80"  y="72" fill="#8888ff" font-weight="bold">W Wild百搭</text>
    <text x="210" y="72" fill="#aaaaff">×0.17</text>
    <text x="310" y="72" fill="#aaaaff">×0.43</text>
    <text x="410" y="72" fill="#ccccff">×1.17</text>
    <text x="500" y="72" fill="#6666aa" font-size="9">可替代除SC以外</text>
    <!-- P1 -->
    <rect x="10" y="80" width="540" height="22" rx="2" fill="#1a0a00"/>
    <text x="80"  y="96" fill="#ff8844" font-weight="bold">P1 高賠1</text>
    <text x="210" y="96" fill="#ffaa66">×0.17</text>
    <text x="310" y="96" fill="#ffaa66">×0.43</text>
    <text x="410" y="96" fill="#ffcc88">×1.17</text>
    <text x="500" y="96" fill="#886644" font-size="9">最高賠率符號</text>
    <!-- P2 -->
    <rect x="10" y="104" width="540" height="22" rx="2" fill="#0a0a00"/>
    <text x="80"  y="120" fill="#ffaa44">P2 高賠2</text>
    <text x="210" y="120" fill="#ffcc88">×0.11</text>
    <text x="310" y="120" fill="#ffcc88">×0.27</text>
    <text x="410" y="120" fill="#ffdd99">×0.67</text>
    <text x="500" y="120" fill="#886644" font-size="9"></text>
    <!-- P3 -->
    <rect x="10" y="128" width="540" height="22" rx="2" fill="#1a0a00"/>
    <text x="80"  y="144" fill="#ddaa44">P3 高賠3</text>
    <text x="210" y="144" fill="#ccbb77">×0.09</text>
    <text x="310" y="144" fill="#ccbb77">×0.23</text>
    <text x="410" y="144" fill="#ddcc88">×0.67</text>
    <text x="500" y="144" fill="#886644" font-size="9"></text>
    <!-- P4 -->
    <rect x="10" y="152" width="540" height="22" rx="2" fill="#0a0a00"/>
    <text x="80"  y="168" fill="#ccaa33">P4 高賠4</text>
    <text x="210" y="168" fill="#ccaa66">×0.07</text>
    <text x="310" y="168" fill="#ccaa66">×0.17</text>
    <text x="410" y="168" fill="#ddbb77">×0.57</text>
    <text x="500" y="168" fill="#886644" font-size="9"></text>
    <!-- Low symbols -->
    <rect x="10" y="176" width="540" height="22" rx="2" fill="#0a1a0a"/>
    <text x="80"  y="192" fill="#88bb88">L1 低賠1</text>
    <text x="210" y="192" fill="#88aa88">×0.03</text>
    <text x="310" y="192" fill="#88aa88">×0.07</text>
    <text x="410" y="192" fill="#99bb99">×0.17</text>
    <text x="500" y="192" fill="#446644" font-size="9"></text>
    <rect x="10" y="200" width="540" height="22" rx="2" fill="#001a00"/>
    <text x="80"  y="216" fill="#88bb88">L2 低賠2</text>
    <text x="210" y="216" fill="#88aa88">×0.03</text>
    <text x="310" y="216" fill="#88aa88">×0.07</text>
    <text x="410" y="216" fill="#99bb99">×0.17</text>
    <text x="500" y="216" fill="#446644" font-size="9"></text>
    <rect x="10" y="224" width="540" height="22" rx="2" fill="#0a1a0a"/>
    <text x="80"  y="240" fill="#77aa77">L3 低賠3</text>
    <text x="210" y="240" fill="#779977">×0.02</text>
    <text x="310" y="240" fill="#779977">×0.05</text>
    <text x="410" y="240" fill="#88aa88">×0.13</text>
    <text x="500" y="240" fill="#446644" font-size="9"></text>
    <rect x="10" y="248" width="540" height="22" rx="2" fill="#001a00"/>
    <text x="80"  y="264" fill="#77aa77">L4 低賠4</text>
    <text x="210" y="264" fill="#779977">×0.02</text>
    <text x="310" y="264" fill="#779977">×0.05</text>
    <text x="410" y="264" fill="#88aa88">×0.13</text>
    <text x="500" y="264" fill="#446644" font-size="9"></text>
  </g>
  <!-- note -->
  <rect x="10" y="278" width="540" height="52" rx="6" fill="#1a1a00" stroke="#ffd700" stroke-width="1"/>
  <text x="280" y="296" fill="#ffd700" font-size="10" text-anchor="middle" font-family="Arial">📌 賠率計算方式：「中獎金額 = 總投注額 × 賠率倍數」</text>
  <text x="280" y="312" fill="#ffcc44" font-size="10" text-anchor="middle" font-family="Arial">例：投注額 0.25，中 5個P1 → 0.25 × 1.17 = 0.29元</text>
  <text x="280" y="327" fill="#ff8888" font-size="10" text-anchor="middle" font-family="Arial">Free Game中再乘以倍率(x3~x77)：0.29 × 77 = 22.33元</text>
</svg>"""

# ── HTML 模板 ──────────────────────────────────────────────

def img_tag(key, alt, caption="", width="100%"):
    if key not in imgs:
        return f'<div class="img-placeholder">圖片未找到: {key}</div>'
    src = imgs[key]
    cap = f'<div class="caption">📷 {caption}</div>' if caption else ""
    return f'<div class="screenshot"><img src="{src}" alt="{alt}" style="max-width:{width};border-radius:8px;box-shadow:0 4px 16px #0008"/>{cap}</div>'

html = f"""<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>GDD – Thunder Blessing Slot Game</title>
<style>
:root{{
  --gold:#ffd700;--blue:#00cfff;--green:#00ff88;--red:#ff4444;
  --purple:#cc88ff;--orange:#ff9900;--bg:#070712;--card:#0f0f28;
  --border:#2a2a44;
}}
*{{box-sizing:border-box;margin:0;padding:0}}
body{{background:var(--bg);color:#d0d0e8;font-family:'Segoe UI',Arial,sans-serif;line-height:1.7;font-size:15px}}
h1{{background:linear-gradient(135deg,#1a0a00,#2a1a00);color:var(--gold);padding:28px 32px;font-size:2em;border-bottom:3px solid var(--gold);text-shadow:0 0 24px #ffd70088}}
h2{{color:var(--gold);font-size:1.4em;margin:32px 0 12px;padding:10px 18px;background:linear-gradient(90deg,#1a1000,transparent);border-left:4px solid var(--gold)}}
h3{{color:var(--blue);font-size:1.1em;margin:22px 0 8px;padding:6px 14px;border-left:3px solid var(--blue);background:#00cfff0a}}
h4{{color:var(--orange);margin:16px 0 6px;font-size:1em}}
.container{{max-width:960px;margin:0 auto;padding:20px 24px}}
section{{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:24px 28px;margin:24px 0}}
.intro-box{{background:linear-gradient(135deg,#1a0a00,#0a0a2a);border:2px solid var(--gold);border-radius:12px;padding:20px 24px;margin-bottom:24px}}
.intro-box p{{color:#ffcc88;font-size:1em;line-height:1.8}}
.tip{{background:#001a0f;border-left:4px solid var(--green);border-radius:0 8px 8px 0;padding:12px 16px;margin:14px 0;color:#88ffcc;font-size:0.93em}}
.tip::before{{content:"💡 ";font-size:1.1em}}
.warn{{background:#1a0000;border-left:4px solid var(--red);border-radius:0 8px 8px 0;padding:12px 16px;margin:14px 0;color:#ffaaaa;font-size:0.93em}}
.warn::before{{content:"⚠ ";color:var(--red)}}
.info{{background:#00102a;border-left:4px solid var(--blue);border-radius:0 8px 8px 0;padding:12px 16px;margin:14px 0;color:#aaddff;font-size:0.93em}}
.info::before{{content:"ℹ ";color:var(--blue)}}
table{{width:100%;border-collapse:collapse;margin:14px 0;font-size:0.93em}}
th{{background:#1a1a00;color:var(--gold);padding:9px 12px;border:1px solid #3a3a00;text-align:left}}
td{{padding:8px 12px;border:1px solid var(--border)}}
tr:nth-child(even) td{{background:#0c0c1e}}
tr:hover td{{background:#161626}}
code{{background:#1a1a2a;color:#88ccff;padding:2px 6px;border-radius:4px;font-family:monospace;font-size:0.9em}}
.flow-code{{background:#080820;border:1px solid var(--border);border-radius:8px;padding:18px;font-family:monospace;font-size:0.85em;color:#99aacc;white-space:pre;overflow-x:auto;line-height:1.6}}
.badge{{display:inline-block;padding:2px 10px;border-radius:12px;font-size:0.82em;font-weight:bold;margin:2px}}
.b-wild{{background:#1a1a4a;color:#8888ff;border:1px solid #4444aa}}
.b-scatter{{background:#2a0a2a;color:#cc88ff;border:1px solid #884488}}
.b-premium{{background:#2a1a00;color:#ffaa44;border:1px solid #884400}}
.b-low{{background:#0a1a0a;color:#88bb88;border:1px solid #224422}}
.screenshot{{margin:18px 0;text-align:center}}
.caption{{color:#888;font-size:0.82em;margin-top:6px;font-style:italic}}
.img-row{{display:flex;gap:16px;flex-wrap:wrap;justify-content:center;margin:16px 0}}
.img-row .screenshot{{flex:1;min-width:280px}}
.svg-wrap{{margin:18px 0;overflow-x:auto}}
.toc{{background:#0a0a20;border:1px solid var(--border);border-radius:10px;padding:18px 24px;margin:20px 0;column-count:2;column-gap:32px}}
.toc a{{color:#aaaacc;text-decoration:none;font-size:0.93em;line-height:2}}
.toc a:hover{{color:var(--gold)}}
.checklist li{{list-style:none;padding:5px 0;font-size:0.93em}}
.checklist li::before{{content:"☐ ";color:var(--green)}}
.highlight{{color:var(--gold);font-weight:bold}}
.section-tag{{font-size:0.8em;background:#2a2a00;color:#aaa;padding:2px 8px;border-radius:8px;float:right}}
footer{{text-align:center;padding:30px;color:#444;font-size:0.85em;border-top:1px solid var(--border);margin-top:40px}}
@media(max-width:640px){{.toc{{column-count:1}}.img-row{{flex-direction:column}}h1{{font-size:1.4em}}}}
</style>
</head>
<body>
<h1>⚡ Thunder Blessing Slot — 遊戲設計文件 (GDD)</h1>
<div class="container">

<div class="intro-box">
<p><b>📌 本文件用途說明：</b>這份 GDD（Game Design Document，遊戲設計文件）是根據 Thunder Blessing 老虎機的<b>實機截圖與遊玩影片逐幀分析</b>所產出的設計規格書。</p>
<p>文件目標是讓 <b>AI 開發代理（Agent）</b>能夠完全理解遊戲全部機制，進而開發出功能 100% 對應的遊戲。</p>
<p>每個環節都附有<b>背景說明</b>（給遊戲小白看的白話解釋）、<b>規則規格</b>（給 AI 開發用的精確描述）、以及<b>截圖佐證</b>（來自真實遊戲畫面）。</p>
</div>

<nav>
<h2>📋 目錄</h2>
<div class="toc">
<a href="#s1">1. 遊戲概述</a><br>
<a href="#s2">2. 畫面佈局與 UI</a><br>
<a href="#s3">3. 符號系統</a><br>
<a href="#s4">4. 賠率表</a><br>
<a href="#s5">5. 連線規則（57條）</a><br>
<a href="#s6">6. 基本遊戲流程</a><br>
<a href="#s7">7. Cascade 連鎖消除</a><br>
<a href="#s8">8. 滾輪擴展（Expanding Reels）</a><br>
<a href="#s9">9. 雷霆祝福 Scatter</a><br>
<a href="#s10">10. Coin Toss 硬幣翻轉</a><br>
<a href="#s11">11. Free Game 免費遊戲</a><br>
<a href="#s12">12. Extra Bet 額外投注</a><br>
<a href="#s13">13. Buy Feature 購買功能</a><br>
<a href="#s14">14. 最高獎金上限</a><br>
<a href="#s15">15. 完整流程圖</a><br>
<a href="#s16">16. 開發 Checklist</a><br>
</div>
</nav>

<!-- ═══ SECTION 1 ═══ -->
<section id="s1">
<h2>1. 遊戲概述 <span class="section-tag">Overview</span></h2>
<div class="tip">這裡介紹這款遊戲是什麼、有什麼特色。就好像電影簡介一樣，讓你大致了解玩法方向。</div>

{img_tag('01_main_game_ui', '遊戲主畫面', '實機開局畫面：顯示5個滾輪、底部 UI 按鈕區、餘額 100,000')}

<table>
<tr><th>項目</th><th>規格</th></tr>
<tr><td>遊戲名稱</td><td>Thunder Blessing（雷霆祝福）</td></tr>
<tr><td>主題風格</td><td>中國神話風格，金龍、王字、祥雲等元素</td></tr>
<tr><td>滾輪結構</td><td>5個滾輪（橫向排列），初始每輪顯示3個符號</td></tr>
<tr><td>基本可見格數</td><td>5×3 = 15格，可擴展至 5×6 = 30格</td></tr>
<tr><td>基本連線數</td><td>25條</td></tr>
<tr><td>最大連線數</td><td><b class="highlight">57條</b>（滾輪擴展至6列後）</td></tr>
<tr><td>最大獎金</td><td><b class="highlight">30,000 × 總投注額</b></td></tr>
<tr><td>核心特色</td><td>Cascade消除 + 滾輪擴展 + 閃電標記 + 雷霆祝福Scatter + Coin Toss + Free Game倍率系統</td></tr>
</table>

<div class="info">本遊戲的最大亮點是「Cascade連鎖」機制：每次有符號中獎消除，滾輪會自動多增加一列，連線數也跟著增加，最多能達到57條連線，然後觸發硬幣翻轉進入免費遊戲。</div>
</section>

<!-- ═══ SECTION 2 ═══ -->
<section id="s2">
<h2>2. 畫面佈局與 UI <span class="section-tag">Layout</span></h2>
<div class="tip">「UI」是 User Interface 的縮寫，就是玩家能看到並操作的所有按鈕和顯示資訊。這節告訴開發者每個元素要放在哪裡、長什麼樣子。</div>

<h3>2-1. 滾輪區域</h3>
<div class="svg-wrap">{SVG_REEL_BASIC}</div>
<ul>
<li>初始狀態：<b>5滾輪 × 3列</b>，共15個符號位置</li>
<li>透過 Cascade 機制最多擴展至 <b>5滾輪 × 6列</b></li>
<li>滾輪從左(1)到右(5)橫向排列，符號由上到下</li>
</ul>

<h3>2-2. 底部控制欄 UI（左到右）</h3>
<div class="img-row">
{img_tag('14_gameplay_main_spin', '遊玩畫面底部UI', '底部UI：含餘額、投注額、SPIN按鈕、Auto Spin、Extra Bet開關')}
{img_tag('17_extra_bet_on_ingame', 'Extra Bet ON狀態', 'Extra Bet 開啟後投注額從0.25變為0.75')}
</div>

<table>
<tr><th>UI 元素</th><th>功能說明</th><th>狀態/數值</th></tr>
<tr><td>餘額（Balance）</td><td>玩家帳戶餘額</td><td>即時更新，例: 99,978.77</td></tr>
<tr><td>總投注額（Total Bet）</td><td>每次旋轉花費</td><td>未開Extra Bet: 0.25 / 開啟後: 0.75</td></tr>
<tr><td>SPIN 按鈕</td><td>開始一次旋轉</td><td>點擊觸發</td></tr>
<tr><td>AUTO SPIN</td><td>設定自動旋轉次數</td><td>選擇次數後自動連轉</td></tr>
<tr><td>EXTRA BET 開關</td><td>額外投注切換</td><td>OFF（灰）/ ON（亮）</td></tr>
<tr><td>BUY FREE GAME</td><td>花費固定金額直接購買進入Free Game機會</td><td>點擊開啟購買介面</td></tr>
<tr><td>WIN 顯示</td><td>當局累計獎金</td><td>Cascade期間持續更新</td></tr>
<tr><td>LINES 顯示</td><td>目前有效連線數</td><td>25 ~ 57，依列數變化</td></tr>
<tr><td>REMAINING FREE GAMES</td><td>剩餘免費遊戲次數（Free Game期間顯示）</td><td>僅Free Game時出現</td></tr>
</table>
</section>

<!-- ═══ SECTION 3 ═══ -->
<section id="s3">
<h2>3. 符號系統 <span class="section-tag">Symbols</span></h2>
<div class="tip">「符號」就是滾輪上顯示的圖案，不同的圖案有不同的價值和功能。就像撲克牌有A、K、Q一樣，老虎機也有高價值和低價值的符號。</div>

<table>
<tr><th>代號</th><th>類型</th><th>名稱</th><th>功能說明</th></tr>
<tr>
  <td><span class="badge b-wild">W</span></td>
  <td>特殊</td>
  <td>Wild（百搭符號）</td>
  <td>可代替所有符號構成連線，<b>唯一例外：不能代替 Scatter</b>。Wild 本身也有獨立賠率。</td>
</tr>
<tr>
  <td><span class="badge b-scatter">SC</span></td>
  <td>特殊</td>
  <td>Thunder Blessing Scatter（雷霆祝福散佈符號）</td>
  <td>出現在有閃電標記的盤面時，觸發「雷霆祝福」特效，將所有標記格轉換成同一高價值符號。</td>
</tr>
<tr>
  <td><span class="badge b-premium">P1</span></td>
  <td>高賠</td>
  <td>Premium 1（最高賠率）</td>
  <td rowspan="4">中國風高價值圖示（龍、鳳凰等）。5個同符號連線時賠率最高。P1>P2>P3>P4 的賠率順序遞減。</td>
</tr>
<tr><td><span class="badge b-premium">P2</span></td><td>高賠</td><td>Premium 2</td></tr>
<tr><td><span class="badge b-premium">P3</span></td><td>高賠</td><td>Premium 3</td></tr>
<tr><td><span class="badge b-premium">P4</span></td><td>高賠</td><td>Premium 4</td></tr>
<tr>
  <td><span class="badge b-low">L1</span></td>
  <td>低賠</td>
  <td>Low 1</td>
  <td rowspan="4">低價值符號（牌面A/K/Q等類型）。L1=L2 賠率相同，L3=L4 賠率相同且更低。</td>
</tr>
<tr><td><span class="badge b-low">L2</span></td><td>低賠</td><td>Low 2</td></tr>
<tr><td><span class="badge b-low">L3</span></td><td>低賠</td><td>Low 3</td></tr>
<tr><td><span class="badge b-low">L4</span></td><td>低賠</td><td>Low 4</td></tr>
</table>

<div class="warn">Wild 是最重要的特殊符號，它能幫助玩家「補上缺少的那個符號」來湊成中獎組合。但它無法代替 Scatter，因為 Scatter 是用來「觸發特效」的，功能完全不同。</div>
</section>

<!-- ═══ SECTION 4 ═══ -->
<section id="s4">
<h2>4. 賠率表（Paytable） <span class="section-tag">Paytable</span></h2>
<div class="tip">「賠率」就是你贏了多少倍的錢。這張表是整個遊戲的「獎金計算標準」，所有數字都以「總投注額的N倍」來表示。例如投注0.25，賠率×1.17，就是贏回 0.25×1.17=0.29元。</div>

<div class="svg-wrap">{SVG_PAYTABLE}</div>

<div class="img-row">
{img_tag('02_paytable_wild_premium', 'Paytable截圖 Wild與高賠符號', '遊戲內Paytable：Wild與P1-P4的賠率')}
{img_tag('03_paytable_low_scatter', 'Paytable截圖 低賠與Scatter', '遊戲內Paytable：低賠符號L1-L4與Scatter規則')}
</div>

<div class="info">📐 計算公式：<code>獎金 = 總投注額 × 賠率倍數</code><br>
Free Game 中：<code>獎金 = 總投注額 × 賠率倍數 × 當前倍率(x3~x77)</code></div>

<h4>完整賠率數值（來自實機 OCR）</h4>
<table>
<tr><th>符號</th><th>5個連線</th><th>4個連線</th><th>3個連線</th></tr>
<tr><td>W Wild</td><td>×1.17</td><td>×0.43</td><td>×0.17</td></tr>
<tr><td>P1</td><td>×1.17</td><td>×0.43</td><td>×0.17</td></tr>
<tr><td>P2</td><td>×0.67</td><td>×0.27</td><td>×0.11</td></tr>
<tr><td>P3</td><td>×0.67</td><td>×0.23</td><td>×0.09</td></tr>
<tr><td>P4</td><td>×0.57</td><td>×0.17</td><td>×0.07</td></tr>
<tr><td>L1</td><td>×0.17</td><td>×0.07</td><td>×0.03</td></tr>
<tr><td>L2</td><td>×0.17</td><td>×0.07</td><td>×0.03</td></tr>
<tr><td>L3</td><td>×0.13</td><td>×0.05</td><td>×0.02</td></tr>
<tr><td>L4</td><td>×0.13</td><td>×0.05</td><td>×0.02</td></tr>
</table>
</section>

<!-- ═══ SECTION 5 ═══ -->
<section id="s5">
<h2>5. 連線規則（Paylines） <span class="section-tag">Paylines</span></h2>
<div class="tip">「連線」是老虎機的中獎路徑。符號必須沿著特定路線連續排列才能算贏。這款遊戲最特別的是連線數會隨著滾輪擴展而增加，從25條最多增到57條！</div>

{img_tag('10_paylines_layout', '57條連線走法圖', '遊戲內說明頁：顯示全部連線編號走法')}

<h3>基本規則</h3>
<ul>
<li>符號必須從<b>最左邊（滾輪1）開始</b>，向右連續排列才算中獎</li>
<li>每條連線<b>只計算最高獎金的那一組</b>，不重複計算</li>
<li>Wild 可替代所有符號（除Scatter），幫助湊成連線</li>
</ul>

<h3>連線數與列數的關係</h3>
<table>
<tr><th>當前列數</th><th>有效連線數</th><th>如何到達</th></tr>
<tr><td>3列（初始）</td><td>25條</td><td>每次SPIN從這裡開始</td></tr>
<tr><td>4列</td><td>增加</td><td>第1次Cascade後擴展</td></tr>
<tr><td>5列</td><td>再增加</td><td>第2次Cascade後擴展</td></tr>
<tr><td>6列（最大）</td><td><b class="highlight">57條</b></td><td>第3次Cascade後達到</td></tr>
</table>
<div class="warn">達到6列且57條連線後，下一次Cascade不再擴展，而是觸發 Coin Toss！</div>
</section>

<!-- ═══ SECTION 6 ═══ -->
<section id="s6">
<h2>6. 基本遊戲流程 <span class="section-tag">Base Game</span></h2>
<div class="tip">每次「旋轉（SPIN）」的基本步驟，就像一局牌的流程。理解這個之後，下面的特殊機制才容易看懂。</div>

{img_tag('14_gameplay_main_spin', '主遊戲旋轉畫面', '正在旋轉中的主遊戲盤面')}

<div class="flow-code">玩家按下 SPIN
   ↓
[Extra Bet 判斷]
   ON  → 花費 3 × 投注額，保證出現至少1個 Scatter
   OFF → 花費 1 × 投注額，Scatter 隨機出現
   ↓
5個滾輪隨機轉動後停止，顯示符號
   ↓
系統掃描所有有效連線（Payline），判斷是否有符號中獎
   ↓
有中獎 → 進入 [Cascade 連鎖流程]（見第7節）
無中獎 → 本輪結束，等待下一次 SPIN</div>
</section>

<!-- ═══ SECTION 7 ═══ -->
<section id="s7">
<h2>7. Cascade 連鎖消除 <span class="section-tag">Cascade</span></h2>
<div class="tip">「Cascade」是這個遊戲最核心的機制，就像消消樂一樣：贏了→消掉→新的掉下來→又贏了→再消→持續循環，而且每次消掉都會讓滾輪多長出一列！</div>

<div class="flow-code">有連線中獎
   ↓
① 計算並累加本次獲獎金額（累計到本輪 WIN 總計）
   ↓
② 在【每個中獎符號的位置】生成「⚡ 閃電標記 Lightning Mark」
   ↓
③ 將這些中獎符號從盤面消除
   ↓
④ 滾輪擴展：若當前列數 ＜ 6，則增加1列
   3列 → 4列（第1次消除）
   4列 → 5列（第2次消除）
   5列 → 6列（第3次消除）
   6列時：不再擴展，但保留所有57條連線
   ↓
⑤ 新符號從滾輪頂部落下，填補空格
   ↓
⑥ 重新掃描所有連線，是否又有新的中獎？
   有 → 回到①，再次循環
   無 → 進入下一步（Scatter判斷 / Coin Toss判斷）</div>

<div class="warn">重置時機：新的 SPIN 開始時，滾輪列數會重置回3列、連線回25條。Cascade只在一輪SPIN的過程中累積。</div>
</section>

<!-- ═══ SECTION 8 ═══ -->
<section id="s8">
<h2>8. 滾輪擴展（Expanding Reels） <span class="section-tag">Expanding</span></h2>
<div class="tip">這是視覺上最壯觀的效果——每次Cascade成功，滾輪框會向下長大一格。到了最大6列時，整個畫面幾乎被巨大的滾輪填滿！</div>

<div class="svg-wrap">{SVG_REEL_EXPANDED}</div>

<div class="img-row">
{img_tag('05_lightning_marks_expanding', '閃電標記與擴展說明', '閃電標記產生在消除位置，同時滾輪開始擴展')}
{img_tag('12_expanding_reels_visual', '滾輪擴展視覺說明', '遊戲說明頁：Each winning cascade expands the reels by one row')}
{img_tag('06_expanding_reels_coin_toss', '擴展至6列觸發Coin Toss', '滾輪達到最大後再次Cascade觸發Coin Toss')}
</div>

<table>
<tr><th>Cascade 次數</th><th>事件</th><th>FREE 字母</th></tr>
<tr><td>第1次</td><td>滾輪 3列 → 4列，衝破第1層雲</td><td><b class="highlight">F</b> 亮燈</td></tr>
<tr><td>第2次</td><td>滾輪 4列 → 5列，衝破第2層雲</td><td><b class="highlight">R</b> 亮燈</td></tr>
<tr><td>第3次</td><td>滾輪 5列 → 6列，衝破第3層雲（三層雲全清）</td><td><b class="highlight">E</b> 亮燈</td></tr>
<tr><td>第4次（及以後）</td><td>滾輪已在6列，下一個Cascade勝出</td><td>最後<b class="highlight">E</b> 亮燈！FREE全亮 → 觸發 Coin Toss</td></tr>
</table>
<div class="tip">FREE 字母收集<b>不是</b>純視覺裝飾——它是進度追蹤指示器。3層雲對應3個字母（F、R、E），第4個E在雲全消後的下一次Cascade才亮，代表真正的Coin Toss觸發條件。</div>

<h3>8-2. FG 觸發門檻（FG_TRIGGER_PROB）</h3>
<div class="flow-code">滾輪已在 6 列（MAX_ROWS），且本次 Cascade 有新的連線勝出（FREE 全亮）
   ↓
觸發門檻機率檢查（FG_TRIGGER_PROB = 11%）
   ├── 未通過（89%）→ 本輪繼續，等待下次 Cascade
   └── 通過（11%）↓
       觸發【Coin Toss 硬幣翻轉】
          ↓
       Heads（正面）→ 進入 Free Game，初始倍率 ×3
       Tails（反面）→ 未能進入 Free Game，本輪結束</div>
<div class="info"><b>FG_TRIGGER_PROB（11%）</b> 是 RTP 控制旋鈕：調低可降低整體 RTP，調高可提升。<br>
計算公式：<code>totalRTP ≈ baseRTP + FG_TRIGGER_PROB × fgContribution</code><br>
<b>Buy Free Game 不受此門檻限制</b>——付費即保證進入 Coin Toss 流程。</div>
</section>

<!-- ═══ SECTION 9 ═══ -->
<section id="s9">
<h2>9. 閃電標記 + 雷霆祝福 Scatter <span class="section-tag">Thunder Blessing</span></h2>
<div class="tip">這是創造大獎的關鍵機制！Cascade消除後留下的「閃電標記」就像雷電蓄積起來，一旦Scatter出現，就釋放出雷霆，把所有有標記的格子都變成超高賠率的同種符號！</div>

<div class="svg-wrap">{SVG_LIGHTNING}</div>

{img_tag('04_thunder_blessing_scatter', 'Thunder Blessing Scatter規則截圖', '遊戲說明頁：Thunder Blessing Scatter規則完整說明')}

<div class="img-row">
{img_tag('15_thunder_blessing_ingame', '雷霆祝福觸發畫面', '實際遊玩中觸發Thunder Blessing效果的畫面')}
</div>

<h3>9-1. 閃電標記（Lightning Mark）規則</h3>
<table>
<tr><th>項目</th><th>說明</th></tr>
<tr><td>產生時機</td><td>每次Cascade消除後，被消除的每個格子都留下一個⚡閃電標記</td></tr>
<tr><td>累積方式</td><td>連續多次Cascade，標記會在盤面上越積越多</td></tr>
<tr><td>重置時機（普通）</td><td>新的SPIN開始時全部清除</td></tr>
<tr><td>重置時機（Free Game）</td><td><b class="highlight">整個Free Game結束後才清除</b>（不會在每次FG Spin時清除！）</td></tr>
</table>

<h3>9-2. 雷霆祝福觸發條件</h3>
<ul>
<li>條件1：盤面上<b>有⚡閃電標記存在</b></li>
<li>條件2：<b>Thunder Blessing Scatter 符號落在盤面任意位置</b></li>
<li>兩個條件同時滿足 → 立即觸發雷霆祝福！</li>
</ul>

<h3>9-3. 雷霆祝福效果（2擊制）</h3>
<div class="flow-code">【第一擊】：所有有⚡標記的格子，全部變成「同一種符號」
  → 具體變成哪種符號由系統決定（通常為高賠符號）
  → 重新計算整個盤面的連線和獎金

【第二擊】（可能觸發）：
  → 所有標記格的符號再升級為「高一等級的符號」
  → 例：P3 → P2，P2 → P1
  → 再次重新計算獎金</div>

<div class="info">雷霆祝福最強大的場景：在Free Game中，因為標記從不重置，可以累積整個FG期間的所有Cascade標記，一旦Scatter出現，可能一次性讓大量格子全部變成高賠符號P1！</div>
</section>

<!-- ═══ SECTION 10 ═══ -->
<section id="s10">
<h2>10. Coin Toss 硬幣翻轉 <span class="section-tag">Coin Toss</span></h2>
<div class="tip">「Coin Toss」就是現實中的「猜正面反面」。這是進入免費遊戲的唯一關卡。正面（Heads）就進場，反面（Tails）就出局。Free Game期間每次轉完也要翻一次硬幣決定是否繼續。</div>

<div class="svg-wrap">{SVG_COIN_TOSS}</div>

<div class="img-row">
{img_tag('18_coin_toss_flip', 'Coin Toss翻轉動畫', '畫面顯示「FLIP TO CONTINUE WITH INCREASED MULTIPLIER」提示')}
{img_tag('19_multiplier_x3', 'Coin Toss正面結果x3', '翻到正面，顯示倍率x3，進入Free Game')}
</div>

<h3>10-1. 觸發條件</h3>
<ol>
<li>滾輪已擴展至 <b>6列（最大值）</b></li>
<li>在6列狀態下 <b>再次成功發生一次Cascade</b></li>
</ol>

<h3>10-2. 硬幣翻轉結果</h3>
<table>
<tr><th>結果</th><th>效果</th></tr>
<tr><td>⊙ Heads（正面）</td><td>進入 Free Game，從倍率 ×3 開始</td></tr>
<tr><td>○ Tails（反面）</td><td>Coin Toss 結束，本輪按照已累積獎金結算後結束</td></tr>
</table>

<h3>10-3. Free Game 中每次Spin後的Coin Toss</h3>
<table>
<tr><th>結果</th><th>效果</th></tr>
<tr><td>Heads</td><td>繼續Free Game，倍率提升至下一級（×3→×7→×17→×27→×77）</td></tr>
<tr><td>Tails</td><td>Free Game 結束，回到普通遊戲</td></tr>
</table>

<div class="info">在Free Game的Coin Toss介面，畫面中央會顯示：<br>
<code>"FLIP TO CONTINUE WITH INCREASED MULTIPLIER"</code><br>
（翻轉以繼續並提升倍率）</div>
</section>

<!-- ═══ SECTION 11 ═══ -->
<section id="s11">
<h2>11. Free Game 免費遊戲 <span class="section-tag">Free Game</span></h2>
<div class="tip">「Free Game」是整個遊戲的最高潮！在免費遊戲期間，你不需要花錢，而且所有獎金都會乘以一個很高的倍率（最高×77）！而且閃電標記會一直累積，讓雷霆祝福更容易出現。</div>

<div class="img-row">
{img_tag('16_free_game_screen', 'Free Game說明截圖', 'Free Game規則說明')}
{img_tag('07_free_game_multipliers', 'Free Game倍率系統', '顯示×3→×7→×17→×27→×77的倍率升級路徑')}
</div>

<h3>11-1. 倍率系統</h3>
<div class="svg-wrap">{SVG_MULTIPLIER}</div>

<table>
<tr><th>倍率等級</th><th>倍率值</th><th>說明</th></tr>
<tr><td>第1級（初始）</td><td><b>×3</b></td><td>Coin Toss Heads後進場</td></tr>
<tr><td>第2級</td><td><b>×7</b></td><td>第1次FG Spin後翻到Heads</td></tr>
<tr><td>第3級</td><td><b>×17</b></td><td>第2次FG Spin後翻到Heads</td></tr>
<tr><td>第4級</td><td><b>×27</b></td><td>第3次FG Spin後翻到Heads</td></tr>
<tr><td>第5級（最高）</td><td><b class="highlight">×77</b></td><td>達到後繼續翻Heads維持×77</td></tr>
</table>

<div class="img-row">
{img_tag('20_multiplier_x7_remaining', 'Free Game進行x7倍率', 'Free Game進行中，倍率x7，顯示剩餘局數')}
{img_tag('08_free_game_extra_bet', 'Free Game說明截圖完整版', 'Free Game + Extra Bet完整規則截圖')}
</div>

<h3>11-2. Free Game 完整流程</h3>
<div class="flow-code">Coin Toss → Heads → 進入 Free Game（倍率從 ×3 開始）
   ↓
執行一次 Free Game Spin
（所有機制正常運作：Cascade、擴展、閃電標記、雷霆祝福）
   ↓
本次Spin的所有獎金 × 當前倍率
   ↓
本次Spin結束，執行 Coin Toss
   ↓
Heads → 倍率升一級（×3→×7→×17→×27→×77）→ 繼續下一個 FG Spin
Tails → Free Game 結束，閃電標記全清，回到普通遊戲
   ↓
特例：倍率已達 ×77，再次Heads → 維持 ×77，Free Game 繼續</div>

<h3>11-3. Free Game 特殊規則</h3>
<table>
<tr><th>規則</th><th>說明</th></tr>
<tr><td>閃電標記不重置</td><td>Free Game期間，每次Spin的閃電標記會一直保留並累積，只有整個FG結束才清除</td></tr>
<tr><td>所有機制正常</td><td>Cascade、滾輪擴展、雷霆祝福在FG中全部正常運作</td></tr>
<tr><td>每次FG Spin結算</td><td>每次Spin的獎金立即計算並乘以當前倍率</td></tr>
<tr><td>Free Game次數</td><td>Free Game沒有固定次數，每次結束後Coin Toss決定是否繼續</td></tr>
</table>

<div class="tip">Free Game的最強連鎖：標記不斷累積 → 倍率越來越高 → 雷霆祝福把大量格子變成高賠符號 → 在高倍率下獲得巨額獎金！</div>
</section>

<!-- ═══ SECTION 12 ═══ -->
<section id="s12">
<h2>12. Extra Bet 額外投注 <span class="section-tag">Extra Bet</span></h2>
<div class="tip">Extra Bet 是一個可選擇「付出更多、換取更好機會」的選項。開啟後你每次旋轉要花3倍的錢，但保證每次都會出現Scatter符號，讓雷霆祝福幾乎每次都有機會觸發。</div>

<div class="svg-wrap">{SVG_EXTRA_BET}</div>

<div class="img-row">
{img_tag('17_extra_bet_on_ingame', 'Extra Bet ON實際游玩', 'Extra Bet開啟後，投注額由0.25增加至0.75')}
{img_tag('09_extra_bet_57lines', 'Extra Bet官方說明', '遊戲官方說明：Extra Bet ON保證Scatter出現')}
</div>

<table>
<tr><th>項目</th><th>描述</th></tr>
<tr><td>開啟方式</td><td>點擊「EXTRA BET」按鈕，狀態由OFF切換為ON</td></tr>
<tr><td>費用倍數</td><td><b class="highlight">每次旋轉費用 = 總投注額 × 3</b></td></tr>
<tr><td>費用範例</td><td>投注0.25 → Extra Bet ON後每次花費0.75</td></tr>
<tr><td>效果</td><td>保證每次旋轉至少出現<b>1個 Thunder Blessing Scatter</b></td></tr>
<tr><td>影響</td><td>大幅提升雷霆祝福觸發機率 → 更高頻率的符號轉換 → 更高獎金潛力</td></tr>
</table>

<div class="info">原文規則（截圖OCR直接讀取）：<br>
<code>"Cost of Extra Bet is 3× the total bet. Activating Extra Bet guarantees at least one Thunder Blessing Scatter on every spin, increasing the chance to trigger symbol transformations and higher win potential."</code></div>

{img_tag('13_free_game_extra_bet_desc', 'Free Game + Extra Bet組合規則', 'Free Game與Extra Bet組合說明截圖')}
</section>

<!-- ═══ SECTION 13 ═══ -->
<section id="s13">
<h2>13. Buy Feature 購買功能 <span class="section-tag">Buy</span></h2>
<div class="tip">「Buy Feature」讓你直接花一筆錢跳過等待Cascade的過程，直接進入Coin Toss，有機會馬上進到Free Game。適合不想慢慢等的玩家。</div>

<h3>13-1. 購買 Free Game（Buy Free Game）</h3>
<ul>
<li>入口：點擊底部「BUY FREE GAME」按鈕</li>
<li>費用：<b>固定倍數 × 總投注額</b>（具體倍數顯示於購買介面）</li>
<li>效果：直接觸發 Coin Toss，正面進入Free Game，反面花費白費</li>
</ul>

<h3>13-2. 購買頁面 UI元素</h3>
<ul>
<li>顯示此次購買所需費用（以投注額倍數表示）</li>
<li>功能說明文字</li>
<li>確認（Confirm）/ 取消（Cancel）按鈕</li>
</ul>

<div class="warn">購買後的Coin Toss並不保證正面，仍有機率翻到Tails而無法進入Free Game。</div>
</section>

<!-- ═══ SECTION 14 ═══ -->
<section id="s14">
<h2>14. 最高獎金上限 <span class="section-tag">Max Win</span></h2>
<div class="tip">為了確保遊戲的公平性和財務可控性，遊戲設定了一個「天花板」——單輪最多只能贏30,000倍投注額。達到後系統自動結束這一輪。</div>

{img_tag('11_max_win_gaming_terms', '最高獎金說明截圖', '官方說明：最高獎金限制為30,000×總投注額')}

<table>
<tr><th>項目</th><th>規格</th></tr>
<tr><td>最高獎金上限</td><td><b class="highlight">30,000 × 總投注額</b></td></tr>
<tr><td>觸發條件</td><td>某一輪（包含所有Cascade和Free Game）的累計獎金達到上限</td></tr>
<tr><td>觸發時的處理</td><td>本輪<b>立即結束</b>，給付已達到的30,000×獎金</td></tr>
<tr><td>剩餘功能</td><td>所有尚未完成的功能（如剩餘Free Game）全部放棄</td></tr>
</table>

<div class="info">原文（OCR）：<code>"The maximum win amount is limited to 30,000× bet. If the total win reaches 30,000× bet, the round ends immediately, win is awarded and the remaining features are forfeited."</code></div>

<h3>其他遊戲規則</h3>
<ul>
<li>機器故障（Malfunction）：本局所有獎金和遊玩<b>無效</b></li>
<li>每條Payline只計算最高獎金那一組</li>
</ul>
</section>

<!-- ═══ SECTION 15 ═══ -->
<section id="s15">
<h2>15. 完整遊戲流程圖 <span class="section-tag">Flow Chart</span></h2>
<div class="tip">這是整個遊戲的「地圖」，把所有機制的前後順序都連起來。只要看懂這張圖，你就能理解整個遊戲怎麼運作了。</div>

<div class="svg-wrap">{SVG_FLOW}</div>

<div class="flow-code">╔══════════════════════════════════════════════╗
║           玩家按下 SPIN / AUTO SPIN          ║
╚══════════════════════════════════════════════╝
                      ↓
    Extra Bet ON → 花費3×，保證1個Scatter
    Extra Bet OFF → 花費1×，Scatter隨機
                      ↓
         5個滾輪隨機轉動並停止
                      ↓
─────────────────────────────────────────────
              [每次連線中獎都執行]
  1. 計算累計獎金
  2. 中獎位置 → 產生⚡閃電標記
  3. 消除中獎符號
  4. 未達6列 → 滾輪擴展1列
  5. 新符號落下
  6. 有Scatter + 有標記 → 觸發雷霆祝福
─────────────────────────────────────────────
                      ↓
        [已達6列，且再次Cascade成功]
               ↓
          COIN TOSS 硬幣翻轉
         /               \
      Heads               Tails
    (正面)              (反面)
       ↓                   ↓
  進入FREE GAME        本輪結束
  倍率從 ×3 開始
       ↓
  ┌───────────────────────────┐
  │     FREE GAME SPIN        │
  │  所有機制完整運作          │
  │  獎金 × 當前倍率           │
  │  閃電標記不重置            │
  └───────────┬───────────────┘
              ↓
         COIN TOSS
       /          \
   Heads          Tails
  倍率升一級    Free Game結束
  ×3→×7→×17    閃電標記清除
    →×27→×77

════ 任何時刻累計 ≥ 30,000× 投注額 → 立即結算 ════</div>
</section>

<!-- ═══ SECTION 16 ═══ -->
<section id="s16">
<h2>16. 開發 Checklist <span class="section-tag">Checklist</span></h2>
<div class="tip">這是給開發者用的「自我檢查清單」——開發完成後，逐條核對確認每個功能都已正確實作。也是你未來測試遊戲時的對照標準。</div>

<h3>基本結構</h3>
<ul class="checklist">
<li>滾輪顯示：5列滾輪×3行，初始總共15個符號位置</li>
<li>符號種類：Wild、Scatter、P1-P4（高賠4種）、L1-L4（低賠4種）共10種</li>
<li>Wild可替代所有符號（除Scatter）</li>
<li>連線判斷：從左到右，至少3個連續相同符號才中獎</li>
<li>每條Payline只計算最高獎金</li>
<li>初始25條有效Payline</li>
</ul>

<h3>賠率系統</h3>
<ul class="checklist">
<li>Wild: 3中×0.17, 4中×0.43, 5中×1.17</li>
<li>P1: 3中×0.17, 4中×0.43, 5中×1.17</li>
<li>P2: 3中×0.11, 4中×0.27, 5中×0.67</li>
<li>P3: 3中×0.09, 4中×0.23, 5中×0.67</li>
<li>P4: 3中×0.07, 4中×0.17, 5中×0.57</li>
<li>L1/L2: 3中×0.03, 4中×0.07, 5中×0.17</li>
<li>L3/L4: 3中×0.02, 4中×0.05, 5中×0.13</li>
</ul>

<h3>Cascade 系統</h3>
<ul class="checklist">
<li>中獎符號消除後，新符號從頂部落下</li>
<li>每次Cascade後，滾輪增加1列（3→4→5→6）</li>
<li>每次Cascade在中獎位置產生閃電標記</li>
<li>滾輪最大6列，超過不再擴展</li>
<li>新SPIN開始時，滾輪重置回3列</li>
</ul>

<h3>連線系統</h3>
<ul class="checklist">
<li>3列 = 25條Payline</li>
<li>最大6列 = 57條Payline</li>
<li>列數增加時，相應Payline自動啟用</li>
</ul>

<h3>雷霆祝福系統</h3>
<ul class="checklist">
<li>閃電標記在中獎消除的位置產生</li>
<li>普通遊戲：每次新SPIN，閃電標記清除</li>
<li>Free Game：閃電標記持續到整個FG結束才清除</li>
<li>Scatter出現 + 有閃電標記 → 觸發雷霆祝福</li>
<li>第一擊：所有標記格→同一種符號（高賠為主）</li>
<li>第二擊（機率觸發）：符號升級為更高賠率</li>
<li>雷霆祝福後重新計算所有Payline獎金</li>
</ul>

<h3>Coin Toss 系統</h3>
<ul class="checklist">
<li>觸發條件：6列狀態下再次Cascade成功</li>
<li>正面(Heads) → 進入Free Game，倍率×3</li>
<li>反面(Tails) → 結束，按已累積獎金結算</li>
<li>FG中每次Spin後執行Coin Toss</li>
<li>正面繼續FG並升一級倍率</li>
<li>反面結束FG，閃電標記清除</li>
</ul>

<h3>Free Game 倍率系統</h3>
<ul class="checklist">
<li>初始倍率：×3</li>
<li>升級順序：×3 → ×7 → ×17 → ×27 → ×77</li>
<li>達到×77後繼續翻Heads維持×77</li>
<li>所有FG獎金 × 當前倍率後才加入WIN</li>
</ul>

<h3>Extra Bet 系統</h3>
<ul class="checklist">
<li>OFF/ON切換按鈕</li>
<li>ON時投注額 = 原投注額 × 3</li>
<li>ON時保證每次Spin至少1個Scatter出現</li>
</ul>

<h3>Buy Feature</h3>
<ul class="checklist">
<li>Buy Free Game按鈕開啟購買介面</li>
<li>顯示費用（固定倍數×投注額）</li>
<li>確認後直接觸發Coin Toss</li>
</ul>

<h3>最高獎金保護</h3>
<ul class="checklist">
<li>單輪累計獎金達到30,000×投注額 → 立即結算</li>
<li>剩餘FG次數或功能全部放棄</li>
</ul>

<h3>UI顯示</h3>
<ul class="checklist">
<li>餘額、投注額、WIN金額實時更新</li>
<li>連線數顯示（57 LINES）</li>
<li>Free Game期間顯示REMAINING FREE GAMES</li>
<li>Free Game期間顯示當前倍率（×3/×7...）</li>
<li>Coin Toss時顯示「FLIP TO CONTINUE WITH INCREASED MULTIPLIER」</li>
</ul>
</section>

</div><!-- end container -->
<footer>
  Thunder Blessing Slot — GDD v1.0<br>
  生成日期：2026-03-11 | 基於實機截圖 + 影片逐幀 OCR 分析<br>
  本文件包含嵌入式圖片（Base64），可獨立開啟，無需外部圖片資源
</footer>
</body>
</html>"""

with open(OUT_PATH, 'w', encoding='utf-8') as f:
    f.write(html)

size_mb = os.path.getsize(OUT_PATH) / 1024 / 1024
print(f"\n✅ HTML 產生完成！")
print(f"   路徑：{OUT_PATH}")
print(f"   大小：{size_mb:.1f} MB")
