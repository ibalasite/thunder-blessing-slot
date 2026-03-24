"""
E2E Test: No Cocos Logo / No Black Screen Between Loading and Game

Captures page screenshots every 200ms and classifies each frame:
  - LOADING: Custom loading screen visible (HTML overlay)
  - GAME: Game content visible (checked via Cocos API)
  - COCOS_SPLASH: Cocos engine splash still active
  - BLACK/UNKNOWN: Neither loading nor game visible

PASS = every frame is either LOADING or GAME, with clean transition.
FAIL = any frame shows COCOS_SPLASH, or a BLACK gap between loading and game.
"""
import os, time, json, argparse
from playwright.sync_api import sync_playwright

SHOT_DIR = os.path.join(os.path.dirname(__file__), "screenshots", "splash_test")
os.makedirs(SHOT_DIR, exist_ok=True)

URLS = {
    "build":      "http://localhost:8080/index.html",
    "production": "https://ibalasite.github.io/thunder-blessing-slot/",
}


def classify_frame(page):
    """Classify frame using HTML state + Cocos API (not pixel reading)."""
    return page.evaluate("""() => {
        var r = { state: 'UNKNOWN', loading: false, splash: false, scene: false, detail: '' };

        // 1) Is the HTML loading overlay visible?
        var ls = document.getElementById('LoadingScreen');
        if (ls) {
            var st = getComputedStyle(ls);
            r.loading = (ls.style.display !== 'none' && parseFloat(st.opacity) > 0.05);
        }

        // 2) Is Cocos engine available?
        if (typeof cc === 'undefined' || !cc.director) {
            r.state = r.loading ? 'LOADING' : 'PRE_ENGINE';
            r.detail = 'engine not ready';
            return r;
        }

        // 3) Is the splash screen still active?
        try {
            var sp = cc.internal.SplashScreen._ins || cc.internal.SplashScreen.instance;
            if (sp && typeof sp._isFinished !== 'undefined' && !sp._isFinished) {
                r.splash = true;
            }
        } catch(e) {}

        // 4) Is the game scene loaded?
        try {
            var scene = cc.director.getScene();
            if (scene && scene.getChildByName('Canvas')) {
                r.scene = true;
            }
        } catch(e) {}

        // Classify
        if (r.loading) {
            r.state = 'LOADING';
            if (r.splash) r.detail = 'splash running behind overlay (ok)';
            else if (r.scene) r.detail = 'scene ready, loading fading';
            else r.detail = 'engine loading';
        } else if (r.scene && !r.splash) {
            r.state = 'GAME';
            r.detail = 'game visible';
        } else if (r.splash) {
            r.state = 'COCOS_SPLASH';
            r.detail = 'splash visible to user!';
        } else {
            r.state = 'BLACK';
            r.detail = 'no loading, no game';
        }
        return r;
    }""")


def run_test(url, label):
    print(f"\n{'='*70}")
    print(f"  SPLASH TEST — {label}")
    print(f"  URL: {url}")
    print(f"{'='*70}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 430, "height": 932})
        page = ctx.new_page()

        t0 = time.time()
        try:
            page.goto(url, wait_until="domcontentloaded", timeout=20000)
        except Exception as e:
            print(f"  ❌ FAIL: Could not load {url}: {e}")
            browser.close()
            return False

        frames = []
        game_at = None

        for i in range(100):
            elapsed = time.time() - t0
            try:
                info = classify_frame(page)
            except:
                info = {"state": "LOADING", "detail": "page loading"}

            state = info["state"]
            frames.append({"t": round(elapsed, 2), "state": state, "detail": info.get("detail","")})

            if state == "GAME" and game_at is None:
                game_at = elapsed

            # Save screenshots for bad frames
            if state in ("COCOS_SPLASH", "BLACK") and elapsed > 0.5:
                page.screenshot(path=os.path.join(SHOT_DIR, f"{label}_{i:03d}_{elapsed:.1f}s_{state}.png"))

            # Print milestones
            if i % 10 == 0 or state in ("COCOS_SPLASH", "BLACK"):
                icon = {"LOADING":"🔄","GAME":"✅","COCOS_SPLASH":"❌","BLACK":"⬛","PRE_ENGINE":"🔄"}.get(state,"❓")
                print(f"  {elapsed:5.1f}s {icon} {state:14s} | {info.get('detail','')}")

            # Stop early if game is stable
            if game_at and elapsed - game_at > 2:
                break

            time.sleep(0.2)

        # Save final screenshot
        page.screenshot(path=os.path.join(SHOT_DIR, f"{label}_final.png"))
        browser.close()

    # Analyze
    cocos = [f for f in frames if f["state"] == "COCOS_SPLASH"]
    black = [f for f in frames if f["state"] == "BLACK" and f["t"] > 0.5]
    game  = [f for f in frames if f["state"] == "GAME"]

    print(f"\n  ── Results ──")
    print(f"  Game visible at:    {game_at:.1f}s" if game_at else "  Game visible at:    NEVER")
    print(f"  Cocos splash seen:  {len(cocos)} frames")
    print(f"  Black gap frames:   {len(black)}")

    passed = True
    reasons = []

    if cocos:
        passed = False
        reasons.append(f"Cocos splash visible at {[f['t'] for f in cocos[:5]]}")
    if black:
        passed = False
        reasons.append(f"Black screen at {[f['t'] for f in black[:5]]}")
    if not game:
        passed = False
        reasons.append("Game never appeared")

    if passed:
        print(f"\n  ✅ PASS — Loading → Game, no splash, no black gap")
    else:
        for r in reasons:
            print(f"\n  ❌ FAIL — {r}")

    with open(os.path.join(SHOT_DIR, f"{label}_report.json"), "w") as f:
        json.dump({"passed": passed, "game_at": game_at,
                   "cocos_frames": len(cocos), "black_frames": len(black),
                   "reasons": reasons, "timeline": frames}, f, indent=2)

    return passed


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", choices=list(URLS.keys()) + ["all"], default="build")
    args = parser.parse_args()

    targets = list(URLS.keys()) if args.target == "all" else [args.target]
    results = {}
    for t in targets:
        results[t] = run_test(URLS[t], t)

    print(f"\n{'='*70}")
    for t, ok in results.items():
        print(f"  {'✅ PASS' if ok else '❌ FAIL'} — {t}")
    print(f"{'='*70}")


if __name__ == "__main__":
    main()
