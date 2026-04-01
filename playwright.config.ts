import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config — RPA browser tests for Thunder Blessing Slot.
 *
 * Targets the K8s-deployed Cocos game at http://localhost:30080.
 * API backend at http://localhost:30001.
 *
 * Run: npx playwright test
 * Run with UI: npx playwright test --ui
 * Run specific: npx playwright test tests/rpa/Deposit.rpa.spec.ts
 */
export default defineConfig({
    testDir:  './tests/rpa',
    timeout:  60_000,
    expect:   { timeout: 15_000 },
    fullyParallel: false,   // slot game tests depend on shared K8s DB state
    retries:  1,
    reporter: [['html', { outputFolder: '.playwright-report', open: 'never' }]],
    outputDir: '.playwright-output',

    use: {
        // Portrait viewport matches Cocos canvas 720×1280 exactly — 1:1 coordinate mapping
        viewport: { width: 720, height: 1280 },
        headless: false,
        screenshot: 'only-on-failure',
        video:      'retain-on-failure',
        // K8s Cocos game URL
        baseURL: 'http://localhost:30080',
    },

    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'], viewport: { width: 720, height: 1280 } },
        },
    ],
});
