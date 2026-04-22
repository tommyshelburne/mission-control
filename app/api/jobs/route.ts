import { NextResponse } from 'next/server';
import { fetchTickTickJobs, TICKTICK_COLUMNS } from '@/lib/ticktick';

const DEFAULT_COLUMNS = [...TICKTICK_COLUMNS];

export async function GET() {
  const result = await fetchTickTickJobs();
  return NextResponse.json({
    jobs: result.jobs,
    columns: DEFAULT_COLUMNS,
    lastUpdated: result.lastUpdated,
    ...(result.error ? { error: result.error } : {}),
  });
}
