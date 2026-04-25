import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const ALLOWED_DIRS = [
  '/home/claw/.openclaw/workspace/projects',
  '/home/claw/.openclaw/workspace/memory',
  '/home/claw/.openclaw/workspace/agents/scout/research',
];

function isAllowed(filePath: string): boolean {
  if (filePath.includes('..')) return false;
  const resolved = path.resolve(filePath);
  return ALLOWED_DIRS.some((dir) => resolved.startsWith(dir + '/') || resolved === dir);
}

export async function GET(request: NextRequest) {
  const filePath = request.nextUrl.searchParams.get('path');
  const format = request.nextUrl.searchParams.get('format') || 'md';

  if (!filePath || !isAllowed(filePath)) {
    return NextResponse.json({ error: 'Invalid or disallowed path' }, { status: 400 });
  }

  try {
    const resolved = path.resolve(filePath);
    const content = fs.readFileSync(resolved, 'utf-8');
    const filename = path.basename(resolved, '.md') + (format === 'txt' ? '.txt' : '.md');
    // Markdown is plain text — using text/markdown over plain HTTP triggers
    // Chrome's safe-browsing "dangerous file" warning. text/plain serves the
    // same content without the scare modal.
    const safeFilename = filename.replace(/"/g, '');

    return new NextResponse(content, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${safeFilename}"`,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }
}
