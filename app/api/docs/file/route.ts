import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { PROJECTS_DIR, MEMORY_DIR, SCOUT_RESEARCH_DIR, NOTES_DIR } from '@/lib/paths';

const ALLOWED_DIRS = [PROJECTS_DIR, MEMORY_DIR, SCOUT_RESEARCH_DIR];

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

// Accepts either:
//   {name: "foo", category?: "notes"}  — server constructs path under PROJECTS_DIR/<category>
//   {path: "/abs/path/foo.md"}         — caller supplies an absolute path (must pass isAllowed)
// The name/category form is preferred so clients don't carry workspace absolute paths.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    let resolved: string;
    if (typeof body.name === 'string' && body.name.trim()) {
      const raw = body.name.trim();
      if (raw.includes('/') || raw.includes('\\') || raw.includes('..')) {
        return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
      }
      const safeName = raw.endsWith('.md') ? raw : raw + '.md';
      const category = typeof body.category === 'string' && body.category.trim() ? body.category.trim() : 'notes';
      if (category.includes('/') || category.includes('\\') || category.includes('..')) {
        return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
      }
      const targetDir = category === 'notes' ? NOTES_DIR : path.join(PROJECTS_DIR, category);
      resolved = path.resolve(targetDir, safeName);
      if (!isAllowed(resolved)) {
        return NextResponse.json({ error: 'Resolved path is outside allowed roots' }, { status: 400 });
      }
    } else if (typeof body.path === 'string') {
      if (!isAllowed(body.path)) {
        return NextResponse.json({ error: 'Invalid or disallowed path' }, { status: 400 });
      }
      resolved = path.resolve(body.path);
    } else {
      return NextResponse.json({ error: 'Provide either name or path' }, { status: 400 });
    }

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
