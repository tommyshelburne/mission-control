import fs from 'node:fs';
import { TICKTICK_TOKEN as TOKEN_PATH } from './paths';
const TICKTICK_API = 'https://api.ticktick.com/open/v1';
const JOB_PROJECT_NAME_MATCH = "Recherche d'emploi";

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
