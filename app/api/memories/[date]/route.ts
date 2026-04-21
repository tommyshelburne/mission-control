import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const MEMORY_DIR = '/home/claw/.openclaw/workspace/memory';

export async function GET(request: Request, props: { params: Promise<{ date: string }> }) {
  const params = await props.params;
  const { date } = params;
  const filePath = path.join(MEMORY_DIR, `${date}.md`);

  try {
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'Memory not found' }, { status: 404 });
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const stat = fs.statSync(filePath);
    const words = content.split(/\s+/).filter(Boolean).length;

    return NextResponse.json({
      content,
      meta: { size: stat.size, words, date },
    });
  } catch {
    return NextResponse.json({ error: 'Memory not found' }, { status: 404 });
  }
}
