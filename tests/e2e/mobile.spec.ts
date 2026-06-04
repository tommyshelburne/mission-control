// Responsive invariant guard (triage Phase 2 / F5-F6-F18). Runs under the
// 'mobile' Playwright project (Pixel 5, 393px). Before the responsive app shell, the
// fixed 208px sidebar + fixed-width kanban/panels pushed content off the right
// edge on a phone; this asserts no page horizontally overflows its viewport.
import { test, expect } from '@playwright/test';

const ROUTES = [
  '/', '/digest', '/tasks', '/pipeline', '/projects',
  '/memories', '/team', '/costs', '/anticipation', '/docs',
];

for (const path of ROUTES) {
  test(`no horizontal overflow at mobile width: ${path}`, async ({ page }) => {
    // The SSE stream holds a connection open, so 'networkidle' never settles.
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });
}
