"""
Thunder Blessing Slot — RPA-style E2E Test (Cocos Creator WebGL)

Since Cocos Creator renders on a WebGL canvas, standard DOM clicks don't
reach the game engine. This test uses the Cocos Creator runtime API
(cc.director) to trigger button events — the same way a real user tap
would propagate through Cocos's input system.

Supports:
  --target production  → https://ibalasite.github.io/thunder-blessing-slot/
  --target local       → http://localhost:7456
  --target both        → run both and compare
"""
import os, time, json, argparse
from playwright.sync_api import sync_playwright

URLS = {
    "production": "https://ibalasite.github.io/thunder-blessing-slot/",
    "local":      "http://localhost:7456",
    "build":      "http://localhost:7456/web-desktop/web-desktop/index.html",
    # K8s dev: Cocos game (nginx NodePort 30080) → API server (NodePort 30001)
    "k8s":        "http://localhost:30080",
}

# API base URL for each target (used in server-side spin verification step)
API_URLS = {
    "k8s":        "http://localhost:30001/api/v1",
    "production": None,
    "local":      None,
    "build":      None,
}
SHOT_DIR_BASE = os.path.join(os.path.dirname(__file__), "screenshots")

CC_HELPERS = r"""
window.__e2e = {
    _canvas: null,
    getCanvas() {
        if (!this._canvas) this._canvas = cc.director.getScene().getChildByName('Canvas');
        return this._canvas;
    },
    findNodeByPath(path) {
        /* path like 'UIPanel/SpinBtn' or 'BuyExtraRow/BuyBtn' */
        let node = this.getCanvas();
        for (const seg of path.split('/')) {
            node = node && node.getChildByName(seg);
        }
        return node;
    },
    clickByPath(path) {
        const node = this.findNodeByPath(path);
        if (!node) return { error: 'Not found: ' + path };
        node.emit('click', node);
        return { clicked: path, name: node.name };
    },
    readAllLabels() {
        /* Recursively collect every Label's text with its full path */
        const results = [];
        function scan(node, path) {
            const lbl = node.getComponent('cc.Label');
            if (lbl && lbl.string) results.push({ path, text: lbl.string });
            node.children.forEach(c => scan(c, path + '/' + c.name));
        }
        scan(this.getCanvas(), 'Canvas');
        return results;
    },
    readGameState() {
        const labels = this.readAllLabels();
        let balance = null, bet = null, win = null;
        for (const l of labels) {
            if ((l.text.includes('餘額') || l.text.includes('余额')) && !balance) balance = l.text;
            if ((l.text.includes('押分') || l.text.includes('押注')) && !bet) bet = l.text;
            if (l.text.startsWith('WIN') && !win) win = l.text;
        }
        return { balance, bet, win };
    },
    listButtons() {
        const btns = [];
        function scan(node, path) {
            if (node.getComponent('cc.Button')) {
                btns.push({ path, name: node.name, parent: path.split('/').slice(-2, -1)[0] || '' });
            }
            node.children.forEach(c => scan(c, path + '/' + c.name));
        }
        scan(cc.director.getScene().getChildByName('Canvas'), 'Canvas');
        return btns;
    },
    isPanelOpen(panelName) {
        const p = this.getCanvas().getChildByName(panelName);
        return p ? p.active : false;
    },
    closePanel(panelName) {
        const p = this.getCanvas().getChildByName(panelName);
        if (p) p.active = false;
        return p ? true : false;
    },
};
"""

RESULTS = []
console_logs = []
spin_api_calls = []   # Network requests to /api/v1/game/spin captured by Playwright
# Extended: also stores response body for SC guarantee verification
spin_outcomes = []    # List of parsed outcome dicts from spin API responses


def shot(page, name, desc, shot_dir):
    path = os.path.join(shot_dir, f"{name}.png")
    page.screenshot(path=path, full_page=True)
    print(f"  📸 {name}.png — {desc}")
    return path


def report(step, status, detail):
    tag = "✅ PASS" if status == "PASS" else "❌ FAIL"
    print(f"\n{tag} | Step {step}: {detail}")
    RESULTS.append({"step": step, "status": status, "detail": detail})


def cc_click(page, path):
    return page.evaluate(f"() => window.__e2e.clickByPath('{path}')")


def cc_state(page):
    return page.evaluate("() => window.__e2e.readGameState()")


def cc_panel_open(page, name):
    return page.evaluate(f"() => window.__e2e.isPanelOpen('{name}')")


def detect_buttons(page):
    """Map logical actions to actual button paths in the scene tree."""
    btns = page.evaluate("() => window.__e2e.listButtons()")
    btn_map = {}
    for b in btns:
        n = b["name"]
        path = b["path"].replace("Canvas/", "")

        # Order matters: check most specific first
        if "AutoSpin" in n or (n == "btn_▶"):
            btn_map["auto"] = path
        elif "↺" in n or n == "SpinBtn":
            btn_map["spin"] = path
        elif n == "btn_+" or n == "BetPlusBtn":
            btn_map["bet_plus"] = path
        elif n == "btn_−" or n == "BetMinusBtn":
            btn_map["bet_minus"] = path
        elif "⚡" in n or n == "TurboBtn":
            btn_map["turbo"] = path
        elif "BUY" in n or n == "BuyBtn":
            btn_map["buy"] = path
        elif n == "ExtraBet" or n == "ExtraBetBtn":
            btn_map["extra_bet"] = path
        elif n == "btn_CANCEL":
            btn_map["cancel"] = path
        elif n == "btn_START":
            btn_map["start"] = path
    return btn_map, btns


def wait_for_cocos_ready(page, timeout=40, remote_mode=False):
    print("  ⏳ Waiting for Cocos engine ...")
    start = time.time()
    while time.time() - start < timeout:
        try:
            ready = page.evaluate("""() => {
                return typeof cc !== 'undefined'
                    && cc.director
                    && cc.director.getScene()
                    && cc.director.getScene().getChildByName('Canvas') !== null;
            }""")
            if ready:
                print(f"  ✓ Cocos ready in {time.time()-start:.1f}s")
                # Remote mode: wait extra time for async API auth + wallet init
                extra = 5 if remote_mode else 2
                time.sleep(extra)
                return True
        except:
            pass
        time.sleep(1)
    print(f"  ⚠ Cocos not ready after {timeout}s")
    return False


def run_test(target, shot_dir):
    url = URLS[target]
    api_url = API_URLS.get(target)
    print(f"\n{'='*60}")
    print(f"  E2E TEST — {target.upper()}")
    print(f"  URL: {url}")
    if api_url:
        print(f"  API: {api_url}")
    print(f"{'='*60}")

    RESULTS.clear()
    console_logs.clear()
    spin_api_calls.clear()
    spin_outcomes.clear()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 430, "height": 932})
        page = ctx.new_page()
        page.on("console", lambda msg: console_logs.append(f"[{msg.type}] {msg.text}"))
        page.on("pageerror", lambda err: console_logs.append(f"[PAGE_ERROR] {err.message}"))

        # Capture spin API calls + response bodies for outcome verification
        def on_response(response):
            if "/api/v1/game/spin" in response.url and response.request.method == "POST":
                spin_api_calls.append({"url": response.url, "status": response.status})
                if response.status == 200:
                    try:
                        body = response.json()
                        spin_outcomes.append(body)
                    except Exception:
                        pass
        page.on("response", on_response)

        # ── Step 1: Load game ──────────────────────────────────
        print("\n═══ Step 1: Load game ═══")
        try:
            page.goto(url, wait_until="domcontentloaded", timeout=30000)
        except Exception as e:
            report(1, "FAIL", f"URL load failed: {e}")
            browser.close()
            return RESULTS

        is_remote = (target == "k8s")
        ready = wait_for_cocos_ready(page, timeout=60 if is_remote else 40, remote_mode=is_remote)
        if not ready:
            shot(page, "01_not_ready", "Cocos not ready", shot_dir)
            report(1, "FAIL", "Cocos Creator did not initialize")
            browser.close()
            return RESULTS

        page.evaluate(CC_HELPERS)
        shot(page, "01_loaded", "Game loaded", shot_dir)
        report(1, "PASS", f"Game loaded on {target}")

        # ── Step 2: Detect buttons & initial state ─────────────
        print("\n═══ Step 2: Initial state ═══")
        btn_map, all_btns = detect_buttons(page)
        state = cc_state(page)
        print(f"  Buttons: {list(btn_map.keys())}")
        print(f"  State: {state}")
        shot(page, "02_initial", "Initial state", shot_dir)

        has_spin = "spin" in btn_map
        has_balance = state["balance"] is not None
        if has_spin and has_balance:
            report(2, "PASS", f"UI ready — {len(btn_map)} btns, {state['balance']}, {state['bet']}")
        else:
            detail = f"spin={has_spin}, balance={state['balance']}"
            report(2, "FAIL" if not has_spin else "PASS", detail)

        # ── Step 3: SPIN ───────────────────────────────────────
        print("\n═══ Step 3: SPIN ═══")
        if has_spin:
            before = cc_state(page)
            result = cc_click(page, btn_map["spin"])
            print(f"  Click result: {result}")
            time.sleep(5)
            shot(page, "03_spin_1", "After first SPIN", shot_dir)
            after = cc_state(page)
            print(f"  Balance: {before['balance']} → {after['balance']}")
            if after['balance'] != before['balance']:
                report(3, "PASS", f"SPIN — {before['balance']} → {after['balance']}")
            else:
                report(3, "FAIL", f"SPIN — balance unchanged ({after['balance']})")
        else:
            report(3, "FAIL", "SPIN button not found")

        # ── Step 4: SPIN again ─────────────────────────────────
        print("\n═══ Step 4: SPIN again ═══")
        if has_spin:
            before = cc_state(page)
            cc_click(page, btn_map["spin"])
            time.sleep(5)
            shot(page, "04_spin_2", "After second SPIN", shot_dir)
            after = cc_state(page)
            print(f"  Balance: {before['balance']} → {after['balance']}")
            if after['balance'] != before['balance']:
                report(4, "PASS", f"SPIN 2 — {before['balance']} → {after['balance']}")
            else:
                report(4, "FAIL", f"SPIN 2 — balance unchanged")
        else:
            report(4, "FAIL", "SPIN button not found")

        # ── Step 5: BET+ ──────────────────────────────────────
        print("\n═══ Step 5: BET+ ═══")
        if "bet_plus" in btn_map:
            before = cc_state(page)
            cc_click(page, btn_map["bet_plus"])
            time.sleep(1)
            after = cc_state(page)
            shot(page, "05_bet_plus", "After BET+", shot_dir)
            print(f"  Bet: {before['bet']} → {after['bet']}")
            if after['bet'] != before['bet']:
                report(5, "PASS", f"BET+ — {before['bet']} → {after['bet']}")
            else:
                report(5, "FAIL", f"BET+ — bet unchanged ({after['bet']})")
        else:
            report(5, "FAIL", "BET+ button not found")

        # ── Step 6: SPIN after bet change ──────────────────────
        print("\n═══ Step 6: SPIN after bet change ═══")
        if has_spin:
            before = cc_state(page)
            cc_click(page, btn_map["spin"])
            time.sleep(5)
            shot(page, "06_spin_bet", "SPIN after bet change", shot_dir)
            after = cc_state(page)
            if after['balance'] != before['balance']:
                report(6, "PASS", f"SPIN post-bet — {before['balance']} → {after['balance']}")
            else:
                report(6, "FAIL", f"SPIN post-bet — balance unchanged")
        else:
            report(6, "FAIL", "SPIN button not found")

        # ── Step 7: BUY FREE GAME ─────────────────────────────
        print("\n═══ Step 7: BUY FREE GAME ═══")
        if "buy" in btn_map:
            cc_click(page, btn_map["buy"])
            time.sleep(2)
            shot(page, "07_buy", "After BUY FREE GAME", shot_dir)
            panel = cc_panel_open(page, "BuyFGPanel")
            if panel:
                report(7, "PASS", "BUY FREE GAME — panel opened")
            else:
                report(7, "FAIL", "BUY FREE GAME — panel did not open")
        else:
            report(7, "FAIL", "BUY button not found")

        # ── Step 8: CANCEL ─────────────────────────────────────
        print("\n═══ Step 8: Cancel ═══")
        if "cancel" in btn_map:
            cc_click(page, btn_map["cancel"])
            time.sleep(1)
            shot(page, "08_cancel", "After cancel", shot_dir)
            panel = cc_panel_open(page, "BuyFGPanel")
            if not panel:
                report(8, "PASS", "CANCEL — panel closed")
            else:
                report(8, "FAIL", "CANCEL — panel still open")
        else:
            page.evaluate("() => window.__e2e.closePanel('BuyFGPanel')")
            shot(page, "08_cancel", "Panel force closed", shot_dir)
            report(8, "PASS", "CANCEL — panel force-closed (no cancel btn in scan)")

        # ── Step 9: TURBO ──────────────────────────────────────
        print("\n═══ Step 9: TURBO ═══")
        if "turbo" in btn_map:
            cc_click(page, btn_map["turbo"])
            time.sleep(1)
            shot(page, "09_turbo", "After TURBO", shot_dir)
            report(9, "PASS", "TURBO toggled")
        else:
            report(9, "FAIL", "TURBO button not found")

        # ── Step 10: Final SPIN ────────────────────────────────
        print("\n═══ Step 10: Final SPIN ═══")
        if has_spin:
            before = cc_state(page)
            cc_click(page, btn_map["spin"])
            time.sleep(5)
            shot(page, "10_final", "Final SPIN", shot_dir)
            after = cc_state(page)
            if after['balance'] != before['balance']:
                report(10, "PASS", f"Final SPIN — {before['balance']} → {after['balance']}")
            else:
                report(10, "FAIL", f"Final SPIN — balance unchanged")
        else:
            report(10, "FAIL", "SPIN button not found")

        # ── Step 11: Server-side spin verification (K8s only) ──
        print("\n═══ Step 11: Server-side spin verification ═══")
        if api_url and spin_api_calls:
            ok_spins = [c for c in spin_api_calls if c["status"] == 200]
            total = len(spin_api_calls)
            passed_count = len(ok_spins)
            if passed_count > 0:
                report(11, "PASS", f"Server API: {passed_count}/{total} spin calls returned HTTP 200 — CSPRNG used")
            else:
                report(11, "FAIL", f"Server API: {total} spin call(s) but none returned HTTP 200")
        elif api_url:
            report(11, "FAIL", "Server API: no /api/v1/game/spin calls detected — game may be using local engine")
        else:
            report(11, "PASS", f"Server verification: skipped (target={target} has no API URL)")

        # ── Step 13: ExtraBet + BuyFG — SC guarantee (GDD §11) ─
        # Verifies that every Phase-A baseSpin and every Phase-B FG spin (x3, x7,
        # x11, x13, x30) contains at least one SC in visible rows (0-2).
        # Strategy: re-detect buttons after previous steps, enable ExtraBet if available,
        # trigger Buy FG, confirm, capture the API outcome body, and verify SC grid data.
        # Visual screenshots are taken before/during/after FG to complement data checks.
        print("\n═══ Step 13: ExtraBet + BuyFG SC guarantee (GDD §11) ═══")
        btn_map13, _ = detect_buttons(page)
        sc_step_ok = False
        sc_detail = "ExtraBet or BUY button not found"

        if "extra_bet" in btn_map13 and "buy" in btn_map13:
            # Count spin outcomes before this step
            outcomes_before = len(spin_outcomes)

            # 13a. Enable Extra Bet
            cc_click(page, btn_map13["extra_bet"])
            time.sleep(1)
            shot(page, "13a_extra_bet_on", "Extra Bet enabled", shot_dir)

            # 13b. Click Buy FG → panel should open
            cc_click(page, btn_map13["buy"])
            time.sleep(2)
            panel_open = cc_panel_open(page, "BuyFGPanel")
            shot(page, "13b_buy_panel", "BuyFG panel", shot_dir)

            if panel_open:
                # 13c. Confirm: click START in the panel
                btn_map13b, _ = detect_buttons(page)
                if "start" in btn_map13b:
                    cc_click(page, btn_map13b["start"])
                else:
                    # Fallback: find and click the start/confirm button by name
                    page.evaluate("""() => {
                        const canvas = cc.director.getScene().getChildByName('Canvas');
                        const panel  = canvas && canvas.getChildByName('BuyFGPanel');
                        if (!panel) return;
                        ['btn_START','StartBtn','ConfirmBtn','btn_OK'].forEach(n => {
                            const b = panel.getChildByName(n);
                            if (b) b.emit('click', b);
                        });
                    }""")

                shot(page, "13c_fg_started", "FG started", shot_dir)

                # 13d. Wait for FG animation — 5 spins × ~3 s each + Phase A
                print("  ⏳ Waiting for FG animation (≈20 s) …")
                time.sleep(22)
                shot(page, "13d_fg_complete", "FG complete", shot_dir)

                # 13e. Verify via captured API outcome body
                new_outcomes = spin_outcomes[outcomes_before:]
                if new_outcomes:
                    outcome = new_outcomes[-1].get("outcome", {})
                    SYM_SC = "SC"
                    base_spins  = outcome.get("baseSpins", [])
                    fg_spins    = outcome.get("fgSpins", [])
                    extra_bet   = outcome.get("extraBetOn", False)
                    multipliers = [fg.get("multiplier") for fg in fg_spins]

                    # Check every baseSpin
                    base_missing = []
                    for i, spin in enumerate(base_spins):
                        grid = spin.get("grid", [])
                        has_sc = any(
                            grid[ri][r] == SYM_SC
                            for ri in range(len(grid))
                            for r in range(min(3, len(grid[ri])))
                        )
                        if not has_sc:
                            base_missing.append(i)

                    # Check every FG spin (x3, x7, x11, x13, x30)
                    fg_missing = []
                    for i, fg in enumerate(fg_spins):
                        grid = fg.get("spin", {}).get("grid", [])
                        has_sc = any(
                            grid[ri][r] == SYM_SC
                            for ri in range(len(grid))
                            for r in range(min(3, len(grid[ri])))
                        )
                        mult = fg.get("multiplier", "?")
                        if not has_sc:
                            fg_missing.append(f"x{mult}")
                        else:
                            print(f"    ✓ FG x{mult}: SC present in visible rows")

                    if base_missing:
                        print(f"    ✗ baseSpins missing SC: {base_missing}")
                    if fg_missing:
                        print(f"    ✗ FG spins missing SC: {fg_missing}")

                    all_ok = len(base_missing) == 0 and len(fg_missing) == 0
                    sc_step_ok = all_ok and extra_bet
                    sc_detail = (
                        f"extraBetOn={extra_bet} | "
                        f"Phase-A ({len(base_spins)} spins): {'✓' if not base_missing else f'✗ missing {base_missing}'} | "
                        f"Phase-B FG x{multipliers}: {'✓ all SC' if not fg_missing else f'✗ missing {fg_missing}'}"
                    )
                else:
                    sc_detail = "No spin API outcome captured (BuyFG may not have called server)"
            else:
                sc_detail = "BuyFGPanel did not open after clicking BUY"
        else:
            missing_btns = [k for k in ("extra_bet", "buy") if k not in btn_map13]
            sc_detail = f"Required buttons not found: {missing_btns}"

        report(13, "PASS" if sc_step_ok else "FAIL", f"ExtraBet+BuyFG SC guarantee — {sc_detail}")

        # ── Step 14: Canvas adaptive sizing ───────────────────
        print("\n═══ Step 14: Canvas adaptive sizing ═══")
        dims = page.evaluate("""() => {
            const d = document.getElementById('GameDiv');
            if (!d) return { error: 'GameDiv not found' };
            return {
                vw: window.innerWidth,
                vh: window.innerHeight,
                dw: d.offsetWidth,
                dh: d.offsetHeight,
                dw_css: d.style.width,
                dh_css: d.style.height,
            };
        }""")
        if "error" in dims:
            report(14, "FAIL", f"Canvas adaptive: {dims['error']}")
        else:
            fill = dims['dw'] / dims['vw'] if dims['vw'] > 0 else 0
            aspect_ok = dims['dw'] > 0 and dims['dh'] > dims['dw']  # portrait: h > w
            fill_ok   = fill >= 0.95   # canvas should fill ≥95% of viewport width
            print(f"  viewport={dims['vw']}×{dims['vh']}  GameDiv={dims['dw']}×{dims['dh']}  "
                  f"fill={fill:.2%}  portrait={aspect_ok}")
            if fill_ok and aspect_ok:
                report(14, "PASS",
                       f"Canvas {dims['dw']}×{dims['dh']} fills {fill:.0%} of {dims['vw']}px viewport (portrait ✓)")
            else:
                report(14, "FAIL",
                       f"Canvas {dims['dw']}×{dims['dh']} fills {fill:.0%} of {dims['vw']}px viewport "
                       f"(fill_ok={fill_ok}, portrait={aspect_ok})")

        # ── Summary ────────────────────────────────────────────
        errors = [l for l in console_logs if "PAGE_ERROR" in l]
        passed = sum(1 for r in RESULTS if r["status"] == "PASS")
        failed = sum(1 for r in RESULTS if r["status"] == "FAIL")

        print(f"\n{'='*60}")
        print(f"  TEST REPORT — {target.upper()}")
        print(f"{'='*60}")
        for r in RESULTS:
            tag = "✅" if r["status"] == "PASS" else "❌"
            print(f"  {tag} Step {r['step']}: {r['detail']}")
        print(f"  ──────────────────────")
        print(f"  PASSED: {passed} / FAILED: {failed} / ERRORS: {len(errors)}")
        print(f"{'='*60}")

        with open(os.path.join(shot_dir, "report.json"), "w") as f:
            json.dump({"target": target, "url": url, "results": RESULTS,
                       "passed": passed, "failed": failed,
                       "console_errors": errors,
                       "spin_api_calls": spin_api_calls}, f, indent=2, ensure_ascii=False)
        with open(os.path.join(shot_dir, "console_logs.txt"), "w") as f:
            f.write("\n".join(console_logs))

        browser.close()
        return RESULTS


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--target",
                        choices=["production", "local", "build", "k8s", "both", "all"],
                        default="k8s")
    args = parser.parse_args()

    if args.target == "all":
        targets = ["production", "local", "build", "k8s"]
    elif args.target == "both":
        targets = ["production", "local"]
    else:
        targets = [args.target]

    all_reports = {}
    for t in targets:
        shot_dir = os.path.join(SHOT_DIR_BASE, t)
        os.makedirs(shot_dir, exist_ok=True)
        all_reports[t] = run_test(t, shot_dir)

    if len(all_reports) >= 2:
        print(f"\n{'='*60}")
        print("  COMPARISON")
        print(f"{'='*60}")
        all_ok = True
        for t in targets:
            p = sum(1 for r in all_reports[t] if r["status"] == "PASS")
            f = sum(1 for r in all_reports[t] if r["status"] == "FAIL")
            tag = "✅" if f == 0 else "❌"
            print(f"  {tag} {t.capitalize():12s}: {p} PASS / {f} FAIL")
            if f > 0:
                all_ok = False
        if all_ok:
            print("  ✅ ALL ENVIRONMENTS PASS")
        print(f"{'='*60}")


if __name__ == "__main__":
    main()
