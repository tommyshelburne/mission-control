// ticktick.ts has two pure helpers (parseTitle, mapColumn) and one network
// function (fetchTickTickJobs). The pure helpers carry the bulk of the
// real-world parsing rules — that's where coverage matters most.
//
// fetchTickTickJobs is exercised through the no-token path and a fully-mocked
// fetch happy path, since the token & API are external.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { parseTitle, mapColumn, fetchTickTickJobs, TICKTICK_COLUMNS } from '@/lib/ticktick';
import { TICKTICK_TOKEN } from '@/lib/paths';

describe('parseTitle', () => {
  it('parses "Role @ Company" form', () => {
    expect(parseTitle('Senior Frontend Engineer @ Acme Corp')).toEqual({
      role: 'Senior Frontend Engineer',
      company: 'Acme Corp',
    });
  });

  it('parses "Company - Role" form', () => {
    expect(parseTitle('Acme - Engineer')).toEqual({ company: 'Acme', role: 'Engineer' });
  });

  it('parses "Company – Role" with en-dash', () => {
    expect(parseTitle('Acme – Engineer')).toEqual({ company: 'Acme', role: 'Engineer' });
  });

  it('parses "Company | Role" form', () => {
    expect(parseTitle('Acme | Engineer')).toEqual({ company: 'Acme', role: 'Engineer' });
  });

  it('falls back to whole title as company when no separator', () => {
    expect(parseTitle('Just a title')).toEqual({ company: 'Just a title', role: '' });
  });

  it('prefers @ over - when both are present', () => {
    expect(parseTitle('Role - x @ Company')).toEqual({ role: 'Role - x', company: 'Company' });
  });

  it('trims surrounding whitespace', () => {
    expect(parseTitle('  Role  @  Company  ')).toEqual({ role: 'Role', company: 'Company' });
  });
});

describe('mapColumn', () => {
  const sectionMap = {
    s1: 'Applying',
    s2: 'Applied',
    s3: 'Interview',
    s4: 'Offer',
    s5: 'Archive',
    s6: 'To apply',
  };

  it('returns Archived for completed (status=2)', () => {
    expect(mapColumn({ id: '1', title: 't', priority: 0, status: 2 }, sectionMap)).toBe('Archived');
  });

  it.each([
    ['s1', 'Applying'],
    ['s2', 'Applied'],
    ['s3', 'Interview'],
    ['s4', 'Offer'],
    ['s5', 'Archived'],
    ['s6', 'Applying'],
  ] as const)('maps section %s -> %s', (sectionId, expected) => {
    expect(
      mapColumn({ id: '1', title: 't', priority: 0, status: 0, columnId: sectionId }, sectionMap),
    ).toBe(expected);
  });

  it('falls through to tags when section is unknown', () => {
    expect(
      mapColumn(
        { id: '1', title: 't', priority: 0, status: 0, tags: ['phone-interview'] },
        {},
      ),
    ).toBe('Interview');
  });

  it('defaults to Applying when nothing matches', () => {
    expect(mapColumn({ id: '1', title: 't', priority: 0, status: 0 }, {})).toBe('Applying');
  });

  it('TICKTICK_COLUMNS is an immutable constant of expected stages', () => {
    expect(TICKTICK_COLUMNS).toEqual(['Applying', 'Applied', 'Interview', 'Offer', 'Archived']);
  });
});

describe('fetchTickTickJobs', () => {
  beforeEach(() => {
    // Make sure stale token files from earlier tests don't leak.
    if (fs.existsSync(TICKTICK_TOKEN)) fs.unlinkSync(TICKTICK_TOKEN);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    if (fs.existsSync(TICKTICK_TOKEN)) fs.unlinkSync(TICKTICK_TOKEN);
  });

  it('returns empty + error when token file is missing', async () => {
    const result = await fetchTickTickJobs();
    expect(result.jobs).toEqual([]);
    expect(result.error).toMatch(/token file not found/i);
  });

  it('returns empty + error when token file lacks access_token', async () => {
    fs.mkdirSync(path.dirname(TICKTICK_TOKEN), { recursive: true });
    fs.writeFileSync(TICKTICK_TOKEN, JSON.stringify({}));
    const result = await fetchTickTickJobs();
    expect(result.jobs).toEqual([]);
    expect(result.error).toMatch(/missing access_token/i);
  });

  it('maps tasks into jobs on a happy path', async () => {
    fs.mkdirSync(path.dirname(TICKTICK_TOKEN), { recursive: true });
    fs.writeFileSync(TICKTICK_TOKEN, JSON.stringify({ access_token: 'abc' }));

    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/project')) {
        return new Response(JSON.stringify([{ id: 'p1', name: "Recherche d'emploi" }]), { status: 200 });
      }
      if (url.includes('/project/p1/data')) {
        return new Response(
          JSON.stringify({
            tasks: [
              { id: 't1', title: 'Engineer @ Acme', priority: 1, status: 0, tags: [], columnId: 's-applied' },
              { id: 't2', title: 'PM @ Beta', priority: 0, status: 2, tags: [] },
            ],
            sections: [{ id: 's-applied', name: 'Applied' }],
          }),
          { status: 200 },
        );
      }
      return new Response('not found', { status: 404 });
    });

    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchTickTickJobs();
    expect(result.error).toBeUndefined();
    expect(result.jobs).toHaveLength(2);
    expect(result.jobs[0]).toMatchObject({ id: 't1', company: 'Acme', role: 'Engineer', status: 'Applied' });
    expect(result.jobs[1]).toMatchObject({ id: 't2', company: 'Beta', role: 'PM', status: 'Archived' });
  });

  it('surfaces non-OK projects API responses as a friendly error', async () => {
    fs.mkdirSync(path.dirname(TICKTICK_TOKEN), { recursive: true });
    fs.writeFileSync(TICKTICK_TOKEN, JSON.stringify({ access_token: 'abc' }));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 401, statusText: 'Unauthorized' })),
    );

    const result = await fetchTickTickJobs();
    expect(result.jobs).toEqual([]);
    expect(result.error).toMatch(/401/);
  });

  it('errors when the matching project is missing', async () => {
    fs.mkdirSync(path.dirname(TICKTICK_TOKEN), { recursive: true });
    fs.writeFileSync(TICKTICK_TOKEN, JSON.stringify({ access_token: 'abc' }));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify([{ id: 'x', name: 'Other' }]), { status: 200 })),
    );

    const result = await fetchTickTickJobs();
    expect(result.error).toMatch(/not found/i);
  });
});
