#!/usr/bin/env pwsh
# fix-build.ps1  — 每次 Cocos Build 完後執行，修正 portrait 設定然後部署
$build = ".\build\web-desktop"

# 1. settings.json → 720×1280, policy=1 (EXACT_FIT)
$settingsPath = "$build\src\settings.json"
$json = Get-Content $settingsPath -Raw | ConvertFrom-Json
$json.screen.designResolution.width  = 720
$json.screen.designResolution.height = 1280
$json.screen.designResolution.policy = 1
$json | ConvertTo-Json -Depth 20 -Compress | Set-Content $settingsPath -Encoding UTF8
Write-Host "[1/4] settings.json fixed (720x1280, EXACT_FIT)"

# 2. index.html → 移除 header/footer, 移除 inline 尺寸, canvas 720x1280
$htmlPath = "$build\index.html"
$html = Get-Content $htmlPath -Raw
$html = $html -replace '<h1[^>]*>.*?</h1>\s*', ''
$html = $html -replace '<p class="footer">[\s\S]*?</p>\s*', ''
$html = $html -replace 'style="width:\s*\d+px;\s*height:\s*\d+px;"', ''
$html = $html -replace 'width="\d+" height="\d+"', 'width="720" height="1280"'
Set-Content $htmlPath $html -Encoding UTF8
Write-Host "[2/4] index.html fixed"

# 3. style.css → portrait 自適應
$cssPath = "$build\style.css"
$css = Get-Content $cssPath -Raw
$css = $css -replace '(?s)#GameDiv\s*\{[^}]+\}', '#GameDiv {
  width:  min(100vw,  calc(100svh * 720 / 1280));
  height: min(100svh, calc(100vw  * 1280 / 720));
  margin: 0 auto;
  border: none;
  box-shadow: none;
}'
Set-Content $cssPath $css -Encoding UTF8
Write-Host "[3/4] style.css fixed"

# 4. .nojekyll
New-Item -Path "$build\.nojekyll" -ItemType File -Force | Out-Null
Write-Host "[4/4] .nojekyll ok"

# 5. Deploy
Write-Host "Deploying..."
npm run deploy
