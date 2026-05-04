// Vitest global setup — runs once before any test file is loaded.
//
// Each test that needs a DB calls `makeTestDb()` from ./test-db.ts to get an
// isolated in-memory instance, so we don't touch the canonical mc.db on disk.
// Setting OPENCLAW_HOME / OPENCLAW_ROOT to /tmp ensures any path-derived
// constant in lib/paths.ts can't accidentally resolve to the real workspace.

import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-test-'));
process.env.OPENCLAW_HOME = tmpRoot;
process.env.OPENCLAW_ROOT = path.join(tmpRoot, 'workspace');
fs.mkdirSync(process.env.OPENCLAW_ROOT, { recursive: true });
