import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { PROJECTS_DIR, SCOUT_RESEARCH_DIR } from '@/lib/paths';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Listing only walks projects. Memories have their own page (/memories) — including
// them here was making the docs sidebar redundant with that view.
const ALLOWED_DIRS = [PROJECTS_DIR, SCOUT_RESEARCH_DIR];

const SKIP_DIRS = new Set(['node_modules', '.git', 'archive', '.archive']);

// Categories surfaced under a collapsed "Archived" section in the UI.
// Non-destructive — files stay on disk; this is purely presentation.
const ARCHIVED_CATEGORIES = new Set(['ai-utah-100', 'herald', 'warden', 'mission-control']);

interface DocEntry {
  path: string;
  title: string;
  category: string;
  size: number;
  words: number;
  modified: number;
  archived: boolean;
}

function extractTitle(filePath: string, content: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  if (match) return match[1].trim();
  return path.basename(filePath, '.md');
}

function walkDir(dir: string, recursive: boolean): string[] {
  const results: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && recursive) {
      results.push(...walkDir(full, true));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(full);
    }
  }
  return results;
}

export async function GET() {
  const docs: DocEntry[] = [];

  for (const dir of ALLOWED_DIRS) {
    const recursive = dir === PROJECTS_DIR;
    const files = walkDir(dir, recursive);

    for (const filePath of files) {
      try {
        const stat = fs.statSync(filePath);
        const head = Buffer.alloc(500);
        const fd = fs.openSync(filePath, 'r');
        const bytesRead = fs.readSync(fd, head, 0, 500, 0);
        fs.closeSync(fd);
        const headStr = head.slice(0, bytesRead).toString('utf-8');

        const fullContent = fs.readFileSync(filePath, 'utf-8');
        const words = fullContent.split(/\s+/).filter(Boolean).length;

        const parentDir = path.basename(path.dirname(filePath));

        docs.push({
          path: filePath,
          title: extractTitle(filePath, headStr),
          category: parentDir,
          size: stat.size,
          words,
          modified: stat.mtimeMs,
          archived: ARCHIVED_CATEGORIES.has(parentDir),
        });
      } catch {
        // skip unreadable files
      }
    }
  }

  docs.sort((a, b) => b.modified - a.modified);

  return NextResponse.json({ docs });
}
