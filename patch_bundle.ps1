$bundlePath = "C:\Projects\thunder-blessing-slot\build\web-desktop\assets\main\index.js"
$c = [System.IO.File]::ReadAllText($bundlePath)

# Get exact old blocks
$i1 = $c.IndexOf("t.spin=function()")
$i2 = $c.IndexOf(",t.cascade=function(")
$oldBlock1 = $c.Substring($i1, $i2-$i1)

$i3 = $c.IndexOf(",t.spinWithGrid=function(e)")
$i4 = $c.IndexOf(",t.reset=function()")
$oldBlock2 = $c.Substring($i3, $i4-$i3)

$oldFGCall = "this.reelMgr.spinWithGrid(e);case 8:return"

# New blocks
$newBlock1 = 't.spinWithScrollStrip=function(e,o){var t=this;if(this.spinning)return Promise.resolve();this.spinning=!0;var n=.09,r=C+m,l=Array.from({length:h},(function(_,i){return t.cells[i][0].node.position.x}));for(var i=0;i<h;i++){for(var s=0;s<w;s++){var a=t.cells[i][s];u(a.node).stop(),a.node.setPosition(l[i],t.rowToY(s,w),0),a.node.setScale(1,1,1),a.node.active=!0,t.drawCell(a,P.grid[i][s])}t._scrolling[i]=!0}var d=.54,p=Array.from({length:h},(function(_,i){return o?d+.22*i:d+.06*i})),v=Array(h).fill(0),x=Array(h).fill(!1);return new Promise((function(gi){var sc=0,doStep=function(ri){if(!t._scrolling[ri])return;var reel=t.cells[ri],px=l[ri];for(var row=0;row<w;row++){var nd=reel[row].node,cy=nd.position.y;u(nd).stop(),u(nd).to(n,{position:new f(px,cy-r,0)}).start()}t.scheduleOnce((function(){var minY=Infinity,minR=-1;for(var k=0;k<w;k++){var y=reel[k].node.position.y;y<minY&&(minY=y,minR=k)}var thresh=t.rowToY(0,w)-(C+m)*.5;if(minY<=thresh){var maxY=-Infinity;for(var k=0;k<w;k++)k!==minR&&(maxY=Math.max(maxY,reel[k].node.position.y));u(reel[minR].node).stop(),reel[minR].node.setPosition(px,maxY+(C+m),0),t.drawCell(reel[minR],R[Math.floor(Math.random()*R.length)])}v[ri]++;var elapsed=v[ri]*n;if(!x[ri]&&elapsed>=p[ri]){x[ri]=!0;t.scheduleOnce((function(){t._scrolling[ri]=!1;t._snapReelToResult(ri,e[ri],px,(function(){++sc===h&&(P.grid=e,t.spinning=!1,gi())}))}),n*(w+1))}else x[ri]||doStep(ri)}),n)};for(var ri=0;ri<h;ri++)doStep(ri)}))},t._snapReelToResult=function(ri,result,px,cb){var t=this,reel=this.cells[ri];for(var row=0;row<w;row++){u(reel[row].node).stop(),t.drawCell(reel[row],result[row]),reel[row].node.active=!0,reel[row].node.setScale(1,1,1)}var pending=w,done=function(){--pending===0&&cb()};for(var row=0;row<w;row++){(function(r){var cell=reel[r],targetY=t.rowToY(r,w),curY=cell.node.position.y;Math.abs(curY-targetY)<2?(cell.node.setPosition(px,targetY,0),done()):(u(cell.node).to(.14,{position:new f(px,targetY-8,0)},{easing:"cubicOut"}).to(.07,{position:new f(px,targetY+4,0)}).to(.05,{position:new f(px,targetY,0)}).call(done).start())})(row)}t.setCloud(S)},t.spin=function(){if(this.spinning)return Promise.resolve();for(var o=[],n=0;n<h;n++){o[n]=[];for(var r=0;r<w;r++)P.extraBetOn&&2===n&&0===r?o[n][r]=g.SCATTER:o[n][r]=R[Math.floor(Math.random()*R.length)]}return this.spinWithScrollStrip(o,!1)}'

$newBlock2 = ',t.spinWithGrid=function(e,o){return this.spinWithScrollStrip(e,!!o)}'

$newFGCall = "this.reelMgr.spinWithGrid(e,!0);case 8:return"

# Verify each old string appears exactly once
$c1 = ([regex]::Matches($c, [regex]::Escape($oldBlock1))).Count
$c2 = ([regex]::Matches($c, [regex]::Escape($oldBlock2))).Count
$c3 = ([regex]::Matches($c, [regex]::Escape($oldFGCall))).Count
Write-Host "Match counts: block1=$c1 block2=$c2 fgcall=$c3"

if ($c1 -eq 1 -and $c2 -eq 1 -and $c3 -eq 1) {
    $c = $c.Replace($oldBlock1, $newBlock1)
    $c = $c.Replace($oldBlock2, $newBlock2)
    $c = $c.Replace($oldFGCall, $newFGCall)
    # Also add _scrolling init in the class constructor area (property declaration)
    # Actually _scrolling is already initialized via Array(h).fill(!1) inside spinWithScrollStrip
    # But TypeScript source has it as class property; in bundle it will be set dynamically
    [System.IO.File]::WriteAllText($bundlePath, $c)
    Write-Host "Bundle patched successfully"
    Write-Host "New bundle size: $($c.Length)"
} else {
    Write-Host "ERROR: Not all replacements found exactly once"
}
