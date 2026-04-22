export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const MEMORY_DIR = '/home/claw/.openclaw/workspace/memory';

export async function GET() {
  try {
    const files = fs.readdirSync(MEMORY_DIR);
    const datePattern = /^\d{4}-\d{2}-\d{2}\.md$/;

    const memories = files
      .filter((f) => datePattern.test(f))
      .map((f) => {
        const filePath = path.join(MEMORY_DIR, f);
        const content = fs.readFileSync(filePath, 'utf-8');
        const stat = fs.statSync(filePath);
        const words = content.split(/\s+/).filter(Boolean).length;
        // Preview: strip markdown leading chars (#, -, *, >, whitespace) and clip
        const preview = content
          .replace(/^[\s#*\->]+/gm, '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 120);
        return {
          date: f.replace('.md', ''),
          size: stat.size,
          words,
          preview,
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date));

    return NextResponse.json({ memories });
  } catch {
    return NextResponse.json({ memories: [] });
  }
}
