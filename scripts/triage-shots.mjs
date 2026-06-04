// One-off triage screenshot harness — captures every route at desktop + mobile
// against the live app on :3000, plus a couple of interaction states.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.MC_URL || 'http://localhost:3000';
const OUT = '/tmp/mc-triage-shots';
mkdirSync(OUT, { recursive: true });

const routes = [
  ['home', '/'],
  ['digest', '/digest'],
  ['tasks', '/tasks'],
  ['pipeline', '/pipeline'],
  ['projects', '/projects'],
  ['memories', '/memories'],
  ['team', '/team'],
  ['costs', '/costs'],
  ['anticipation', '/anticipation'],
  ['docs', '/docs'],
];

const consoleErrors = {};

async function shoot(page, name, file) {
  const errs = [];
  const onErr = (msg) => { if (msg.type() === 'error') errs.push(msg.text()); };
  page.on('console', onErr);
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
  try {
    await page.goto(BASE + (routes.find(r => r[0] === name)?.[1] ?? '/'), { waitUntil: 'networkidle', timeout: 30000 });
  } catch {
    await page.goto(BASE + (routes.find(r => r[0] === name)?.[1] ?? '/'), { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  }
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/${file}.png`, fullPage: true });
  page.off('console', onErr);
  consoleErrors[file] = errs;
}

const browser = await chromium.launch();

// Desktop
const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const dpage = await desktop.newPage();
for (const [name] of routes) {
  await shoot(dpage, name, `desktop-${name}`);
  console.log('shot desktop', name);
}
// Command palette state
try {
  await dpage.goto(BASE + '/', { waitUntil: 'networkidle' });
  await dpage.keyboard.press('Meta+k');
  await dpage.waitForTimeout(600);
  await dpage.screenshot({ path: `${OUT}/desktop-cmdk.png` });
  console.log('shot desktop cmdk');
} catch (e) { console.log('cmdk failed', e.message); }

await desktop.close();

// Mobile (iPhone 14-ish)
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const mpage = await mobile.newPage();
for (const [name] of [['home'], ['tasks'], ['pipeline'], ['team'], ['docs']]) {
  await shoot(mpage, name, `mobile-${name}`);
  console.log('shot mobile', name);
}
await mobile.close();

await browser.close();

console.log('\n=== CONSOLE ERRORS ===');
console.log(JSON.stringify(consoleErrors, null, 2));
console.log('\nDONE ->', OUT);
