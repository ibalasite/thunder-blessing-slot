# patch_bundle.ps1  v3 — per-frame ribbon animation + Array.from Set spread fix
$bundlePath = "C:\Projects\thunder-blessing-slot\build\web-desktop\assets\main\index.js"
$c = [System.IO.File]::ReadAllText($bundlePath)

# ── Fix 1: Babel compiles [...Set] → [].concat(Set) which wraps Set as one element.
#    Must use Array.from() so spread works correctly on Set objects.
$c = $c.Replace("marks:[].concat(this._session.lightningMarks)", "marks:Array.from(this._session.lightningMarks)")
$c = $c.Replace("newMarks:[].concat(o)", "newMarks:Array.from(o)")
Write-Host "Array.from fix applied"

# Locate old spinWithScrollStrip block (everything up to ,t.spin=function())
$i1 = $c.IndexOf("t.spinWithScrollStrip=function(")
$i2 = $c.IndexOf(",t.spin=function()", $i1)
$oldBlock1 = $c.Substring($i1, $i2-$i1)

# New per-frame ribbon animation block (replaces spinWithScrollStrip + _snapReelToResult)
$newBlock1 = 't.spinWithScrollStrip=function(e,fg){var self=this;if(self.spinning)return Promise.resolve();self.spinning=!0;var STEP=C+m,SPEED=STEP/.055,EXIT_Y=self.rowToY(0,w)-STEP*.6;for(var ci=0;ci<h;ci++){var cpx=self.cells[ci][0].node.position.x;for(var cr=0;cr<w;cr++){var cc=self.cells[ci][cr];u(cc.node).stop(),cc.node.setScale(1,1,1),cc.node.active=!0,cc.node.setPosition(cpx,self.rowToY(cr,w),0),self.drawCell(cc,P.grid[ci][cr])}self._scrolling[ci]=!0}self.setCloud(S);var BASE_T=.6,stopT=Array.from({length:h},(function(_,si){return fg?BASE_T+.22*si:BASE_T+.06*si}));return new Promise((function(resolve){var ela=Array(h).fill(0),stp=Array(h).fill(!1),doneCnt=0,prevMs=-1;var fn=function(){var nowMs=Date.now();if(prevMs<0){prevMs=nowMs;return}var dt=Math.min((nowMs-prevMs)/1e3,.05);prevMs=nowMs;for(var ri=0;ri<h;ri++){if(stp[ri])continue;ela[ri]+=dt;var spd=SPEED*dt,px=self.cells[ri][0].node.position.x;for(var rr=0;rr<w;rr++){var nd=self.cells[ri][rr].node;nd.setPosition(px,nd.position.y-spd,0)}for(var rr=0;rr<w;rr++){var rc=self.cells[ri][rr];if(rc.node.position.y<EXIT_Y){var maxY=-1/0;for(var r2=0;r2<w;r2++)if(r2!==rr){var y2=self.cells[ri][r2].node.position.y;y2>maxY&&(maxY=y2)}rc.node.setPosition(px,maxY+STEP,0),self.drawCell(rc,R[Math.floor(Math.random()*R.length)])}}if(ela[ri]>=stopT[ri]){stp[ri]=!0,self._scrolling[ri]=!1;(function(ri2,px2){self._snapReelToResult(ri2,e[ri2],px2,(function(){++doneCnt===h&&(self.unschedule(fn),P.grid=e,self.spinning=!1,resolve())}))})(ri,px)}}};self.schedule(fn,0)}))},t._snapReelToResult=function(ri,result,px,cb){var self=this,reel=self.cells[ri],sorted=reel.slice().sort((function(a,b){return b.node.position.y-a.node.position.y}));for(var i=0;i<w;i++){var tr=w-1-i;u(sorted[i].node).stop(),self.drawCell(sorted[i],result[tr]),sorted[i].node.active=!0,sorted[i].node.setScale(1,1,1)}var pend=w,done=function(){--pend===0&&cb()};for(var i=0;i<w;i++){(function(idx){var cell=sorted[idx],tr=w-1-idx,ty=self.rowToY(tr,w),cy=cell.node.position.y;Math.abs(cy-ty)<2?(cell.node.setPosition(px,ty,0),done()):u(cell.node).to(.1,{position:new f(px,ty-5,0)},{easing:"cubicOut"}).to(.05,{position:new f(px,ty+2,0)}).to(.04,{position:new f(px,ty,0)}).call(done).start()})(i)}self.setCloud(S)}'

# Verify old block found exactly once
$cnt = ([regex]::Matches($c, [regex]::Escape($oldBlock1))).Count
Write-Host "Old spinWithScrollStrip block count: $cnt  (expected 1)"
Write-Host "Old block length: $($oldBlock1.Length)  New block length: $($newBlock1.Length)"

if ($cnt -eq 1) {
    $c = $c.Replace($oldBlock1, $newBlock1)
    [System.IO.File]::WriteAllText($bundlePath, $c, [System.Text.Encoding]::UTF8)
    Write-Host "Bundle patched. Size: $($c.Length)"
    # Verify
    $v = [System.IO.File]::ReadAllText($bundlePath)
    Write-Host "schedule(fn,0) present: $($v.IndexOf('self.schedule(fn,0)') -ge 0)"
    Write-Host "sort-by-Y present: $($v.IndexOf('b.node.position.y-a.node.position.y') -ge 0)"
    $oldGone = $v.IndexOf('scheduleOnce((function(){var minY=Infinity') -lt 0
    Write-Host "OLD step pattern gone: $oldGone"
} else {
    Write-Host "ERROR: Could not find the old block uniquely"
    Write-Host "i1=$i1 i2=$i2"
    $c.Substring($i1, [Math]::Min(200, $i2-$i1))
}
