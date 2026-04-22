import { test, expect } from '@playwright/test';

/**
 * Visual regression baselines. Run once on a known-good state to capture
 * screenshots, then any UI change that diffs by more than maxDiffPixelRatio
 * fails the suite.
 *
 * Update baselines: npx playwright test visual.spec --update-snapshots
 */

const PAGES = [
  '/',
  '/digest',
  '/tasks',
  '/pipeline',
  '/projects',
  '/memories',
  '/team',
  '/jobs',
  '/docs',
] as const;

test.describe('visual baselines', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test.beforeEach(async ({ page }) => {
    // Disable animations so screenshots are stable
    await page.addInitScript(() => {
      const style = document.createElement('style');
      style.textContent = `
        *, *::before, *::after {
          animation-duration: 0s !important;
          animation-delay: 0s !important;
          transition-duration: 0s !important;
          transition-delay: 0s !important;
        }
      `;
      document.documentElement.appendChild(style);
    });
  });

  for (const path of PAGES) {
    test(`${path} matches baseline`, async ({ page }) => {
      await page.goto(path);
      // Wait for any client-side data fetches to settle
      await page.waitForLoadState('networkidle');
      // Settle a beat for React state updates to flush
      await page.waitForTimeout(300);

      await expect(page).toHaveScreenshot(`${path === '/' ? 'home' : path.slice(1).replace(/\//g, '-')}.png`, {
        fullPage: true,
        // Mask the clock + any other live-updating relative times so they
        // don't cause spurious diffs.
        mask: [
          page.locator('[aria-label="Clock"]'),
          page.locator('time'),
        ],
        // Allow a tiny pixel-level tolerance for sub-pixel font rendering.
        maxDiffPixelRatio: 0.005,
      });
    });
  }
});
