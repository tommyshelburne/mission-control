import { NextResponse } from 'next/server';
import fs from 'fs';

const TOKEN_PATH = '/home/claw/.openclaw/workspace/.ticktick-token.json';
const TICKTICK_API = 'https://api.ticktick.com/open/v1';
const DEFAULT_COLUMNS = ['Applying', 'Applied', 'Interview', 'Offer', 'Archived'];

interface TickTickTask {
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

interface JobCard {
  id: string;
  company: string;
  role: string;
  title: string;
  tags: string[];
  dueDate: string;
  priority: number;
  status: string;
  url: string;
}

function parseTitle(title: string): { company: string; role: string } {
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

function mapColumn(
  task: TickTickTask,
  sectionMap: Record<string, string>,
): string {
  if (task.status === 2) return 'Archived';

  // Check section/column mapping
  const sectionId = task.columnId || task.section;
  if (sectionId && sectionMap[sectionId]) {
    const name = sectionMap[sectionId].toLowerCase();
    if (name.includes('applying') || name.includes('to apply')) return 'Applying';
    if (name.includes('applied')) return 'Applied';
    if (name.includes('interview')) return 'Interview';
    if (name.includes('offer')) return 'Offer';
    if (name.includes('archiv') || name.includes('reject') || name.includes('closed')) return 'Archived';
  }

  // Check tags
  if (task.tags && task.tags.length > 0) {
    const tagStr = task.tags.join(' ').toLowerCase();
    if (tagStr.includes('interview')) return 'Interview';
    if (tagStr.includes('applied')) return 'Applied';
    if (tagStr.includes('offer')) return 'Offer';
    if (tagStr.includes('archived') || tagStr.includes('rejected')) return 'Archived';
  }

  return 'Applying';
}

export async function GET() {
  try {
    // Read token
    if (!fs.existsSync(TOKEN_PATH)) {
      return NextResponse.json({
        error: 'TickTick token file not found',
        jobs: [],
        columns: DEFAULT_COLUMNS,
      });
    }

    const tokenData = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
    const accessToken = tokenData.access_token;
    if (!accessToken) {
      return NextResponse.json({
        error: 'Invalid token file: missing access_token',
        jobs: [],
        columns: DEFAULT_COLUMNS,
      });
    }

    const headers = { Authorization: `Bearer ${accessToken}` };

    // Step 1: Find "Recherche d'emploi" project
    const projectsRes = await fetch(`${TICKTICK_API}/project`, { headers });
    if (!projectsRes.ok) {
      return NextResponse.json({
        error: `TickTick API error (projects): ${projectsRes.status} ${projectsRes.statusText}`,
        jobs: [],
        columns: DEFAULT_COLUMNS,
      });
    }

    const projects = await projectsRes.json();
    const jobProject = projects.find(
      (p: { name: string }) => p.name.includes("Recherche d'emploi"),
    );
    if (!jobProject) {
      return NextResponse.json({
        error: "Project \"Recherche d'emploi\" not found in TickTick",
        jobs: [],
        columns: DEFAULT_COLUMNS,
      });
    }

    // Step 2: Get project data (tasks + sections)
    const dataRes = await fetch(
      `${TICKTICK_API}/project/${jobProject.id}/data`,
      { headers },
    );
    if (!dataRes.ok) {
      return NextResponse.json({
        error: `TickTick API error (project data): ${dataRes.status} ${dataRes.statusText}`,
        jobs: [],
        columns: DEFAULT_COLUMNS,
      });
    }

    const data: TickTickProjectData = await dataRes.json();
    const tasks = data.tasks || [];

    // Build section ID -> name map
    const sectionMap: Record<string, string> = {};
    const sections = data.sections || data.columns || [];
    for (const s of sections) {
      sectionMap[s.id] = s.name;
    }

    // Map tasks to job cards
    const jobs: JobCard[] = tasks.map((task) => {
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
        url: '', // TickTick open API doesn't expose task URLs
      };
    });

    return NextResponse.json({
      jobs,
      columns: DEFAULT_COLUMNS,
      lastUpdated: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({
      error: `Failed to fetch jobs: ${message}`,
      jobs: [],
      columns: DEFAULT_COLUMNS,
    });
  }
}
