import { test, expect, Page } from '@playwright/test';

const PAGES = ['/', '/tasks', '/projects', '/pipeline', '/digest', '/docs', '/team', '/jobs', '/memories'] as const;

test.describe('page smoke', () => {
  for (const path of PAGES) {
    test(`${path} renders`, async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });
      page.on('pageerror', (err) => {
        consoleErrors.push(err.message);
      });

      const res = await page.goto(path);
      expect(res?.status(), `HTTP status for ${path}`).toBe(200);

      // Sidebar present and styled (catches CSS-bundle 500s like the Tailwind 4 attempt)
      const sidebar = page.locator('aside').first();
      await expect(sidebar).toBeVisible();
      const sidebarBg = await sidebar.evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(sidebarBg, 'sidebar background-color should not be transparent').not.toBe('rgba(0, 0, 0, 0)');
      expect(sidebarBg, 'sidebar background-color should not be transparent').not.toBe('transparent');

      // Lucide icons load (the Tailwind 4 break also broke icon rendering)
      const iconCount = await page.locator('svg.lucide').count();
      expect(iconCount, 'page should render at least one lucide icon').toBeGreaterThan(0);

      // No console errors
      expect(consoleErrors, `console errors on ${path}: ${consoleErrors.join(' | ')}`).toEqual([]);
    });
  }
});

test.describe('layout invariants', () => {
  test('main pages have a scrollable content container', async ({ page }) => {
    // Regression test for the Agents page scroll bug: every routed page should
    // have a flex-1 overflow-y-auto wrapper inside <main> so content can scroll.
    for (const path of ['/tasks', '/projects', '/pipeline', '/digest', '/team']) {
      await page.goto(path);
      const scrollable = await page.locator('main *').evaluateAll((els) =>
        els.some((el) => {
          const cs = getComputedStyle(el);
          return ['auto', 'scroll'].includes(cs.overflowY) && el.clientHeight > 0;
        })
      );
      expect(scrollable, `${path} should have a scrollable content area inside <main>`).toBe(true);
    }
  });
});

test.describe('agents page', () => {
  test('renders all 11 agent cards plus Tommy', async ({ page }: { page: Page }) => {
    await page.goto('/team');
    // Wait for the agents query to resolve and cards to render.
    await page.waitForSelector('text=Mission Control', { state: 'visible' });
    // 11 agents seeded + 1 Tommy synthesized card = 12 cards
    const cardCount = await page.locator('main >> div.grid > div').count();
    expect(cardCount).toBeGreaterThanOrEqual(12);
  });
});
