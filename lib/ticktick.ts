import fs from 'node:fs';
import { TICKTICK_TOKEN as TOKEN_PATH } from './paths';
const TICKTICK_API = 'https://api.ticktick.com/open/v1';
const TICKTICK_TOKEN_URL = 'https://ticktick.com/oauth/token';
const JOB_PROJECT_NAME_MATCH = "Recherche d'emploi";

// Mirrors scripts/ticktick_lead_writer.py — Scout pushes Tommy's job leads
// into this specific TickTick project so the Pipeline ↔ TickTick bridge keys
// off a stable target instead of name-matching every promotion.
const LEAD_PROJECT_ID = '6980d9a65280912b15dad774';

export const TICKTICK_COLUMNS = ['Applying', 'Applied', 'Interview', 'Offer', 'Archived'] as const;
export type TickTickColumn = (typeof TICKTICK_COLUMNS)[number];

export interface TickTickTask {
  id: string;
  title: string;
  content?: string;
  desc?: string;
  priority: number;
  status: number;
  dueDate?: string;
  tags?: string[];
  sortOrder?: number;
  columnId?: string;
  section?: string;
}

interface TickTickSection {
  id: string;
  name: string;
}

interface TickTickProjectData {
  tasks: TickTickTask[];
  sections?: TickTickSection[];
  columns?: TickTickSection[];
}

export interface TickTickJob {
  id: string;
  company: string;
  role: string;
  title: string;
  tags: string[];
  dueDate: string;
  priority: number;
  status: TickTickColumn;
  url: string;
  sortOrder: number;
}

export interface FetchJobsResult {
  jobs: TickTickJob[];
  lastUpdated: string;
  error?: string;
}

export function parseTitle(title: string): { company: string; role: string } {
  // "Role @ Company" — the convention Tommy uses in TickTick (reversed order)
  const atIdx = title.indexOf(' @ ');
  if (atIdx !== -1) {
    return {
      role: title.substring(0, atIdx).trim(),
      company: title.substring(atIdx + 3).trim(),
    };
  }
  // "Company <sep> Role" — common LinkedIn / recruiter outreach format
  const separators = [' - ', ' – ', ' | '];
  for (const sep of separators) {
    const idx = title.indexOf(sep);
    if (idx !== -1) {
      return {
        company: title.substring(0, idx).trim(),
        role: title.substring(idx + sep.length).trim(),
      };
    }
  }
  return { company: title, role: '' };
}

export function mapColumn(
  task: TickTickTask,
  sectionMap: Record<string, string>,
): TickTickColumn {
  if (task.status === 2) return 'Archived';

  const sectionId = task.columnId || task.section;
  if (sectionId && sectionMap[sectionId]) {
    const name = sectionMap[sectionId].toLowerCase();
    if (name.includes('applying') || name.includes('to apply')) return 'Applying';
    if (name.includes('applied')) return 'Applied';
    if (name.includes('interview')) return 'Interview';
    if (name.includes('offer')) return 'Offer';
    if (name.includes('archiv') || name.includes('reject') || name.includes('closed')) return 'Archived';
  }

  if (task.tags && task.tags.length > 0) {
    const tagStr = task.tags.join(' ').toLowerCase();
    if (tagStr.includes('interview')) return 'Interview';
    if (tagStr.includes('applied')) return 'Applied';
    if (tagStr.includes('offer')) return 'Offer';
    if (tagStr.includes('archived') || tagStr.includes('rejected')) return 'Archived';
  }

  return 'Applying';
}

export interface CreateLeadTaskInput {
  company: string;
  title: string;
  url?: string;
  notes?: string;
  location?: string;
  requiresLogin?: boolean;
}

interface TokenData {
  access_token: string;
  refresh_token?: string;
  client_id?: string;
  client_secret?: string;
  [key: string]: unknown;
}

function readTokenData(): TokenData {
  if (!fs.existsSync(TOKEN_PATH)) {
    throw new Error('TickTick token file not found');
  }
  const data = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8')) as TokenData;
  if (!data.access_token) throw new Error('Invalid TickTick token file: missing access_token');
  return data;
}

async function refreshAccessToken(): Promise<string> {
  const data = readTokenData();
  if (!data.refresh_token) throw new Error('No refresh_token in token file — manual re-auth required');

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: data.refresh_token,
  }).toString();

  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (data.client_id && data.client_secret) {
    const creds = Buffer.from(`${data.client_id}:${data.client_secret}`).toString('base64');
    headers.Authorization = `Basic ${creds}`;
  }

  const res = await fetch(TICKTICK_TOKEN_URL, { method: 'POST', headers, body });
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status} ${res.statusText}`);
  const fresh = await res.json() as Partial<TokenData>;
  if (!fresh.access_token) throw new Error('Token refresh returned no access_token');

  const merged = { ...data, ...fresh };
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(merged, null, 2));
  return fresh.access_token;
}

function buildLeadContent(input: CreateLeadTaskInput): string {
  const lines: string[] = [];
  if (input.location) lines.push(`📍 ${input.location}`);
  if (input.url) lines.push(`🔗 ${input.url}`);
  if (input.notes && input.notes.trim()) {
    if (lines.length) lines.push('');
    lines.push(input.notes.trim());
  }
  return lines.join('\n');
}

async function postLeadTask(token: string, title: string, content: string): Promise<{ id: string }> {
  const res = await fetch(`${TICKTICK_API}/task`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title,
      projectId: LEAD_PROJECT_ID,
      priority: 3,
      content,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`TickTick task POST failed: ${res.status} ${res.statusText} ${body.slice(0, 200)}`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  const json = await res.json() as { id?: string };
  if (!json.id) throw new Error('TickTick task POST returned no id');
  return { id: json.id };
}

/**
 * Create a TickTick task in the leads project. Used by /promote when an
 * Inbox row is promoted to Applied. Retries once with a refreshed token on
 * 401, matching scripts/ticktick_lead_writer.py.
 */
export async function createLeadTask(input: CreateLeadTaskInput): Promise<{ id: string }> {
  const base = `Apply — ${input.title} @ ${input.company}`;
  const title = input.requiresLogin ? `[UNVERIFIED] ${base}` : base;
  const content = buildLeadContent(input);

  const data = readTokenData();
  try {
    return await postLeadTask(data.access_token, title, content);
  } catch (err) {
    const status = (err as Error & { status?: number }).status;
    if (status === 401) {
      const fresh = await refreshAccessToken();
      return await postLeadTask(fresh, title, content);
    }
    throw err;
  }
}

export async function fetchTickTickJobs(): Promise<FetchJobsResult> {
  const empty = { jobs: [], lastUpdated: new Date().toISOString() };

  try {
    if (!fs.existsSync(TOKEN_PATH)) {
      return { ...empty, error: 'TickTick token file not found' };
    }

    const tokenData = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
    const accessToken = tokenData.access_token;
    if (!accessToken) {
      return { ...empty, error: 'Invalid token file: missing access_token' };
    }

    const headers = { Authorization: `Bearer ${accessToken}` };

    const projectsRes = await fetch(`${TICKTICK_API}/project`, { headers });
    if (!projectsRes.ok) {
      return { ...empty, error: `TickTick API error (projects): ${projectsRes.status} ${projectsRes.statusText}` };
    }

    const projects = await projectsRes.json();
    const jobProject = projects.find(
      (p: { name: string }) => p.name.includes(JOB_PROJECT_NAME_MATCH),
    );
    if (!jobProject) {
      return { ...empty, error: `Project "${JOB_PROJECT_NAME_MATCH}" not found in TickTick` };
    }

    const dataRes = await fetch(
      `${TICKTICK_API}/project/${jobProject.id}/data`,
      { headers },
    );
    if (!dataRes.ok) {
      return { ...empty, error: `TickTick API error (project data): ${dataRes.status} ${dataRes.statusText}` };
    }

    const data: TickTickProjectData = await dataRes.json();
    const tasks = data.tasks || [];

    const sectionMap: Record<string, string> = {};
    const sections = data.sections || data.columns || [];
    for (const s of sections) {
      sectionMap[s.id] = s.name;
    }

    const jobs: TickTickJob[] = tasks.map((task) => {
      const { company, role } = parseTitle(task.title);
      return {
        id: task.id,
        company,
        role,
        title: task.title,
        tags: task.tags || [],
        dueDate: task.dueDate || '',
        priority: task.priority,
        status: mapColumn(task, sectionMap),
        url: '',
        sortOrder: task.sortOrder ?? 0,
      };
    });

    return { jobs, lastUpdated: new Date().toISOString() };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { ...empty, error: `Failed to fetch jobs: ${message}` };
  }
}
