import { NextResponse } from 'next/server';

export async function GET() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ openrouter: null });
  }

  try {
    const res = await fetch('https://openrouter.ai/api/v1/auth/key', {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: 'no-store',
    });
    if (!res.ok) {
      return NextResponse.json({ openrouter: null });
    }
    const data = await res.json();
    // usage_daily is in credits; 1 credit = $0.000001
    const usageDaily: number | undefined = data?.data?.usage_daily;
    const dollars = typeof usageDaily === 'number' ? usageDaily * 0.000001 : null;
    return NextResponse.json({ openrouter: dollars });
  } catch {
    return NextResponse.json({ openrouter: null });
  }
}
