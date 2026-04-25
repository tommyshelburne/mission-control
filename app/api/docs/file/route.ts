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
  if (!filePath || !isAllowed(filePath)) {
    return NextResponse.json({ error: 'Invalid or disallowed path' }, { status: 400 });
  }

  try {
    const resolved = path.resolve(filePath);
    const stat = fs.statSync(resolved);
    const content = fs.readFileSync(resolved, 'utf-8');
    const words = content.split(/\s+/).filter(Boolean).length;

    return NextResponse.json({
      content,
      meta: {
        path: resolved,
        size: stat.size,
        words,
        modified: stat.mtimeMs,
      },
    });
  } catch {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }
}

export async function PUT(request: NextRequest) {
  const filePath = request.nextUrl.searchParams.get('path');
  if (!filePath || !isAllowed(filePath)) {
    return NextResponse.json({ error: 'Invalid or disallowed path' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const resolved = path.resolve(filePath);
    fs.writeFileSync(resolved, body.content, 'utf-8');
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to write file' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const filePath = body.path;
    if (!filePath || !isAllowed(filePath)) {
      return NextResponse.json({ error: 'Invalid or disallowed path' }, { status: 400 });
    }

    const resolved = path.resolve(filePath);
    const dir = path.dirname(resolved);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(resolved, body.content || '', 'utf-8');

    return NextResponse.json({ success: true, path: resolved });
  } catch {
    return NextResponse.json({ error: 'Failed to create file' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const filePath = request.nextUrl.searchParams.get('path');
  if (!filePath || !isAllowed(filePath)) {
    return NextResponse.json({ error: 'Invalid or disallowed path' }, { status: 400 });
  }

  try {
    const resolved = path.resolve(filePath);
    fs.renameSync(resolved, resolved + '.deleted');
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete file' }, { status: 500 });
  }
}
