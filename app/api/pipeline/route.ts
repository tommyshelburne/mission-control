import { NextResponse } from 'next/server';

const PD_TOKEN = '776929cdb373e84c8b5a88c289f7634ca324d08e';
const PIPELINE_ID = 3;
const PD_BASE = 'https://api.pipedrive.com/v1';

const STAGE_MAP: Record<number, string> = {
  21: 'Qualified',
  22: 'Analyzing',
  23: 'Pursuing',
  24: 'Submitted',
  25: 'Under Review',
  26: 'Awarded',
};

interface PipedriveDeal {
  id: number;
  title: string;
  org_name: string | null;
  stage_id: number;
  status: string;
  value: number;
  add_time: string;
  update_time: string;
  next_activity_date: string | null;
  notes_count: number;
  origin_id: string | null;
  [key: string]: unknown;
}

interface Deal {
  id: number;
  title: string;
  agency: string;
  stage_id: number;
  stage_name: string;
  status: string;
  value: number;
  add_time: string;
  update_time: string;
  next_activity_date: string | null;
  notes_count: number;
  isBidMatch: boolean;
  recommendation: string | null;
  score: number | null;
  naics: string;
  deadline: string;
  rationale: string;
  pipedrive_url: string;
}

function parseDeal(raw: PipedriveDeal): Deal {
  let title = raw.title || '';
  let score: number | null = null;
  let recommendation: string | null = null;
  let rationale = '';
  let naics = '';
  let deadline = '';

  // Extract score from "[85] Title" pattern
  const scoreMatch = title.match(/^\[(\d+)\]\s*/);
  if (scoreMatch) {
    score = parseInt(scoreMatch[1], 10);
    title = title.slice(scoreMatch[0].length);
  }

  // Extract recommendation from "PURSUE: Title" pattern
  const recMatch = title.match(/^(PURSUE|PARTNER|PASS|MONITOR)[:\s]+/i);
  if (recMatch) {
    recommendation = recMatch[1].toUpperCase();
    title = title.slice(recMatch[0].length);
  }

  // BidMatch detection
  const isBidMatch = Boolean(
    raw.origin_id ||
    raw.title?.includes('BM:') ||
    raw.title?.includes('BidMatch') ||
    scoreMatch
  );

  // Extract agency from org_name or title
  const agency = raw.org_name || '';

  // Try to extract NAICS, deadline, rationale from custom fields or title
  // Pipedrive custom fields vary; we pull what we can
  for (const [key, val] of Object.entries(raw)) {
    if (typeof val !== 'string') continue;
    if (/naics/i.test(key)) naics = val;
    if (/deadline/i.test(key) || /due_date/i.test(key)) deadline = val;
    if (/rationale/i.test(key) || /reason/i.test(key)) rationale = val;
  }

  return {
    id: raw.id,
    title,
    agency,
    stage_id: raw.stage_id,
    stage_name: STAGE_MAP[raw.stage_id] || `Stage ${raw.stage_id}`,
    status: raw.status,
    value: raw.value || 0,
    add_time: raw.add_time,
    update_time: raw.update_time,
    next_activity_date: raw.next_activity_date || null,
    notes_count: raw.notes_count || 0,
    isBidMatch,
    recommendation,
    score,
    naics,
    deadline,
    rationale,
    pipedrive_url: `https://openclaw.pipedrive.com/deal/${raw.id}`,
  };
}

export async function GET() {
  try {
    const dealsUrl = `${PD_BASE}/pipelines/${PIPELINE_ID}/deals?api_token=${PD_TOKEN}&status=all_not_deleted&limit=100`;
    const res = await fetch(dealsUrl, { next: { revalidate: 120 } });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { deals: [], error: `Pipedrive API error: ${res.status} ${text}` },
        { status: 502 }
      );
    }

    const json = await res.json();
    const rawDeals: PipedriveDeal[] = json.data || [];
    const deals: Deal[] = rawDeals.map(parseDeal);

    return NextResponse.json({ deals });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { deals: [], error: `Failed to fetch pipeline: ${message}` },
      { status: 500 }
    );
  }
}
