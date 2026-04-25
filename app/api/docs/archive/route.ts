import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const ALLOWED_DIRS = [
  '/home/claw/.openclaw/workspace/projects',
  '/home/claw/.openclaw/workspace/agents/scout/research',
];

function isAllowed(filePath: string): boolean {
  if (filePath.includes('..')) return false;
  const resolved = path.resolve(filePath);
  return ALLOWED_DIRS.some((dir) => resolved.startsWith(dir + '/'));
}

interface Failure {
  path: string;
  error: string;
}

export async function POST(request: NextRequest) {
  let body: { paths?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!Array.isArray(body.paths) || body.paths.length === 0) {
    return NextResponse.json({ error: 'Body must include a non-empty paths[] array' }, { status: 400 });
  }

  const archived: string[] = [];
  const failed: Failure[] = [];

  for (const raw of body.paths) {
    if (typeof raw !== 'string' || !isAllowed(raw)) {
      failed.push({ path: String(raw), error: 'Invalid or disallowed path' });
      continue;
    }
    const src = path.resolve(raw);
    const dir = path.dirname(src);
    const base = path.basename(src);
    const archiveDir = path.join(dir, '.archive');
    const dest = path.join(archiveDir, base);

    try {
      fs.mkdirSync(archiveDir, { recursive: true });
      // Avoid overwriting existing archived file with same name.
      let finalDest = dest;
      if (fs.existsSync(finalDest)) {
        const ext = path.extname(base);
        const stem = path.basename(base, ext);
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        finalDest = path.join(archiveDir, `${stem}.${ts}${ext}`);
      }
      fs.renameSync(src, finalDest);
      archived.push(src);
    } catch (e) {
      failed.push({ path: src, error: e instanceof Error ? e.message : 'Unknown error' });
    }
  }

  return NextResponse.json({ archived, failed });
}
