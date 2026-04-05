import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const ALLOWED_DIRS = [
  '/home/claw/.openclaw/workspace/projects',
  '/home/claw/.openclaw/workspace/memory',
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
    const contentType = format === 'txt' ? 'text/plain' : 'text/markdown';

    return new NextResponse(content, {
      headers: {
        'Content-Type': `${contentType}; charset=utf-8`,
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }
}
