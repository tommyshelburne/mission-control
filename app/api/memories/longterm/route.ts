import { NextResponse } from 'next/server';
import fs from 'fs';
import { MEMORY_MD } from '@/lib/paths';

export async function GET() {
  try {
    const content = fs.readFileSync(MEMORY_MD, 'utf-8');
    const stat = fs.statSync(MEMORY_MD);
    const words = content.split(/\s+/).filter(Boolean).length;

    return NextResponse.json({
      content,
      meta: { size: stat.size, words },
    });
  } catch {
    return NextResponse.json({ error: 'Long-term memory not found' }, { status: 404 });
  }
}
