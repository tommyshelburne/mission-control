// Interaction-level e2e against the real Next runtime — exercises routing,
// API endpoints, and a few client-side flows that vitest mocks don't see.
//
// Strictly read-only: these tests run against the user's real DB via the
// running server, so they must not create, update, or delete any rows.

import { test, expect } from '@playwright/test';

test.describe('navigation', () => {
  test('clicking each sidebar item navigates to its route', async ({ page }) => {
    await page.goto('/');
    const targets = [
      { label: 'Tasks', path: '/tasks' },
      { label: 'Pipeline', path: '/pipeline' },
      { label: 'Projects', path: '/projects' },
      { label: 'Agents', path: '/team' },
      { label: 'Digest', path: '/digest' },
    ];
    for (const { label, path } of targets) {
      await page.getByRole('link', { name: label, exact: true }).click();
      await page.waitForURL(`**${path}`);
      expect(new URL(page.url()).pathname).toBe(path);
      // Active sidebar item should be marked aria-current
      const active = page.getByRole('link', { name: label, exact: true });
      await expect(active).toHaveAttribute('aria-current', 'page');
    }
  });

  test('sidebar logo link returns to /', async ({ page }) => {
    await page.goto('/tasks');
    await page.getByRole('link', { name: 'Mission Control home' }).click();
    await page.waitForURL('**/');
    expect(new URL(page.url()).pathname).toBe('/');
  });
});

test.describe('api endpoints', () => {
  test('GET /api/health is healthy and v4', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.version).toBe('v4');
    expect(body.counts).toEqual(
      expect.objectContaining({
        tasks: expect.any(Number),
        projects: expect.any(Number),
        opportunities: expect.any(Number),
        docs: expect.any(Number),
        agents: expect.any(Number),
      }),
    );
    expect(Array.isArray(body.migrations)).toBe(true);
    expect(body.migrations).toEqual(
      expect.arrayContaining(['001_v4_schema.sql', '003_opportunities.sql', '004_fts5.sql']),
    );
  });

  test('GET /api/tasks returns a tasks array', async ({ request }) => {
    const res = await request.get('/api/tasks');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.tasks)).toBe(true);
  });

  test('GET /api/projects returns a projects array with task counts', async ({ request }) => {
    const res = await request.get('/api/projects');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.projects)).toBe(true);
    if (body.projects.length > 0) {
      expect(body.projects[0]).toEqual(
        expect.objectContaining({
          name: expect.any(String),
          task_count: expect.any(Number),
          tasks_open: expect.any(Number),
          tasks_done: expect.any(Number),
        }),
      );
    }
  });

  test('GET /api/opportunities returns rows + stage_counts', async ({ request }) => {
    const res = await request.get('/api/opportunities');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.opportunities)).toBe(true);
    expect(typeof body.stage_counts).toBe('object');
  });

  test('GET /api/search with empty q returns empty results', async ({ request }) => {
    const res = await request.get('/api/search');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ results: [], total: 0, q: '' });
  });

  test('GET /api/search with a query returns the documented result shape', async ({ request }) => {
    const res = await request.get('/api/search?q=test');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.q).toBe('test');
    expect(Array.isArray(body.results)).toBe(true);
    if (body.results.length > 0) {
      expect(body.results[0]).toEqual(
        expect.objectContaining({
          entity_type: expect.stringMatching(/^(task|project|doc|opportunity)$/),
          entity_id: expect.any(Number),
          title: expect.any(String),
          href: expect.any(String),
        }),
      );
    }
  });

  test('POST /api/tasks rejects an empty title', async ({ request }) => {
    const res = await request.post('/api/tasks', { data: { title: '' } });
    expect(res.status()).toBe(400);
  });

  test('POST /api/notifications rejects an unknown type', async ({ request }) => {
    const res = await request.post('/api/notifications', {
      data: { title: 'x', type: 'critical' },
    });
    expect(res.status()).toBe(400);
  });

  test('GET /api/agents returns the documented shape', async ({ request }) => {
    const res = await request.get('/api/agents');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.agents)).toBe(true);
    expect(body.stale_threshold_seconds).toBe(300);
  });
});

test.describe('layout invariants beyond first paint', () => {
  test('all primary pages render the sidebar with expected nav items', async ({ page }) => {
    const items = ['Activity', 'Digest', 'Tasks', 'Pipeline', 'Projects', 'Memories', 'Agents'];
    for (const path of ['/', '/tasks', '/projects']) {
      await page.goto(path);
      for (const label of items) {
        await expect(
          page.getByRole('link', { name: label, exact: true }),
        ).toBeVisible();
      }
    }
  });

  test('unknown routes return a usable response', async ({ page }) => {
    const res = await page.goto('/this-route-does-not-exist');
    // Next will render a 404 page — status must NOT be 500.
    expect(res?.status()).not.toBe(500);
  });
});
