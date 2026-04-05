import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    version: 'v3',
    time: new Date().toISOString(),
  });
}
