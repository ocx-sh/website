// C-058 / S-001: the visual loop turns every pair into a report row; a missing mock or an unreachable site
// is a row, never a crash. `--watch` (main's file watcher) has no unit seam; covered manually via `task visual`.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { PAIRS, type MockRef, type Pair } from '../../tests/visual/pairs.ts';
import { parseArgs, renderReport, run, siteBroken, VARIANTS } from './visual.mjs';

const template = readFileSync(new URL('report.html.tmpl', import.meta.url), 'utf8');
const designDir = new URL('../../.tmp/design/', import.meta.url);
const SITE = 'http://localhost:9999';
const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

const PNG = Buffer.from('89504e470d0a1a0a', 'hex');

/** Fake shooter: mock id 'absent' is missing, 'throws' rejects, site path '/down/' is unreachable; every shot writes a file. */
function fakeShooter() {
  const calls = {
    mock: [] as MockRef[],
    site: [] as { url: string; variant: string; opts?: { selector?: string; open?: unknown } }[],
    closed: 0,
  };
  return {
    calls,
    shoot: {
      mock(ref: MockRef, out: string) {
        calls.mock.push(ref);
        if (ref.id === 'absent') return Promise.resolve(false);
        if (ref.id === 'throws') return Promise.reject(new Error('page.goto: Timeout 30000ms exceeded'));
        writeFileSync(out, PNG);
        return Promise.resolve(true);
      },
      site(url: string, variant: (typeof VARIANTS)[number], out: string, opts?: { selector?: string; open?: unknown }) {
        calls.site.push({ url, variant, ...(opts !== undefined && { opts }) });
        if (url.includes('/down/')) return Promise.reject(new Error('net::ERR_CONNECTION_REFUSED'));
        writeFileSync(out, PNG);
        return Promise.resolve();
      },
      close() {
        calls.closed++;
        return Promise.resolve();
      },
    },
  };
}

const diff = (_a: string, _b: string, out: string) => {
  writeFileSync(out, PNG);
  return Promise.resolve(0.25);
};

async function runWith(pairs: readonly Pair[]) {
  const outDir = mkdtempSync(join(tmpdir(), 'visual-'));
  dirs.push(outDir);
  const fake = fakeShooter();
  const results = await run({ pairs, shoot: fake.shoot, diff, outDir, template, site: SITE });
  return { outDir, results, calls: fake.calls };
}

const mixed: Pair[] = [
  { name: 'good', mock: { file: 'a.dc.html', id: 'x' }, path: '/docs/good/' },
  { name: 'no mock', mock: { file: 'a.dc.html', id: 'absent' }, path: '/docs/nomock/' },
  { name: 'site down', mock: { file: 'a.dc.html', id: 'y' }, path: '/docs/down/' },
  { name: 'also good', mock: { file: 'b.dc.html', id: 'z' }, path: '/docs/also/' },
];

describe('parseArgs', () => {
  it('C-058: defaults to one run against http://localhost:4321', () => {
    expect(parseArgs([])).toEqual({ watch: false, site: 'http://localhost:4321' });
  });

  it('C-058: --watch and --site <url>', () => {
    expect(parseArgs(['--watch', '--site', 'http://127.0.0.1:5000'])).toEqual({
      watch: true,
      site: 'http://127.0.0.1:5000',
    });
    expect(parseArgs(['--site', 'http://x:1'])).toEqual({ watch: false, site: 'http://x:1' });
  });
});

describe('run', () => {
  it('C-058: one row per row of tests/visual/pairs.ts, in order', async () => {
    const { results } = await runWith(PAIRS);
    expect(results.map((r) => r.name)).toEqual(PAIRS.map((p) => p.name));
    expect(results.map((r) => r.path)).toEqual(PAIRS.map((p) => p.path));
  });

  it('C-058 / S-001: every ok row has the mock, a diff and light/dark × desktop/mobile site shots', async () => {
    const { outDir, results, calls } = await runWith(PAIRS);
    for (const [i, r] of results.entries()) {
      const hasMock = PAIRS[i]!.mock !== undefined;
      expect(r.kind).toBe(hasMock ? 'ok' : 'no tile');
      const wantImages = hasMock ? ['diff', 'mock', ...VARIANTS] : [...VARIANTS];
      expect(Object.keys(r.images).sort()).toEqual(wantImages.sort());
      for (const rel of Object.values(r.images)) expect(existsSync(join(outDir, rel))).toBe(true);
      expect(r.mismatch).toBe(hasMock ? 0.25 : undefined);
    }
    for (const p of PAIRS) {
      const shots = calls.site.filter((c) => c.url.startsWith(SITE) && c.url.endsWith(p.path));
      expect(new Set(shots.map((c) => c.variant))).toEqual(new Set(VARIANTS));
    }
  });

  it('S-001: a missing mock id becomes a "mock missing" row; other rows unaffected', async () => {
    const { results } = await runWith(mixed);
    expect(results).toHaveLength(mixed.length);
    expect(results.find((r) => r.name === 'no mock')?.kind).toBe('mock missing');
    expect(results.find((r) => r.name === 'good')?.kind).toBe('ok');
    expect(results.find((r) => r.name === 'also good')?.kind).toBe('ok');
  });

  it('S-001: an unreachable site page becomes a "site unavailable" row with an error', async () => {
    const { results } = await runWith(mixed);
    const down = results.find((r) => r.name === 'site down');
    expect(down?.kind).toBe('site unavailable');
    expect(down?.error).toBeTruthy();
    expect(down?.mismatch).toBeUndefined();
  });

  it('S-001: any "site unavailable" row makes the run fail; mock/tile gaps alone do not', async () => {
    const { results } = await runWith(mixed);
    expect(siteBroken(results)).toBe(true);
    expect(siteBroken(results.filter((r) => r.kind !== 'site unavailable'))).toBe(false);
  });

  it('S-001: a mock load that throws becomes a "mock missing" row with the error, not a rejection', async () => {
    const { results } = await runWith([
      ...mixed,
      { name: 'mock throws', mock: { file: 'c.dc.html', id: 'throws' }, path: '/docs/t/' },
    ]);
    const t = results.find((r) => r.name === 'mock throws');
    expect(t?.kind).toBe('mock missing');
    expect(t?.error).toContain('Timeout');
    expect(results.find((r) => r.name === 'good')?.kind).toBe('ok');
  });

  it('P-7: a pair with no mock becomes a "no tile" row, and selector/open reach the shooter', async () => {
    const { results, calls } = await runWith([
      {
        name: 'listbox open',
        path: '/docs/components/select/',
        selector: '#select-demo .ocx-ui-select__list',
        open: { click: '#select-demo .ocx-ui-select__control' },
      },
    ]);
    const r = results[0]!;
    expect(r.kind).toBe('no tile');
    expect(r.images.mock).toBeUndefined();
    expect(r.mismatch).toBeUndefined();
    expect(calls.mock).toHaveLength(0);
    for (const call of calls.site) {
      expect(call.opts?.selector).toBe('#select-demo .ocx-ui-select__list');
      expect(call.opts?.open).toEqual({ click: '#select-demo .ocx-ui-select__control' });
    }
  });

  it('C-058: never rejects for per-pair failures and writes report.html with every row', async () => {
    const { outDir } = await runWith(mixed);
    const html = readFileSync(join(outDir, 'report.html'), 'utf8');
    expect(html).not.toContain('<!--ROWS-->');
    expect(html).toContain('mock missing');
    expect(html).toContain('site unavailable');
    for (const p of mixed) expect(html).toContain(p.name);
  });
});

describe('renderReport', () => {
  const results = [
    {
      name: 'docs article',
      path: '/docs/a/',
      kind: 'ok' as const,
      images: Object.fromEntries(['mock', 'diff', ...VARIANTS].map((k) => [k, `docs-article/${k}.png`])),
      mismatch: 0.1,
    },
    { name: 'callout', path: '/docs/c/', kind: 'mock missing' as const, images: {}, error: 'no [id="c"]' },
  ];

  it('C-058: fills <!--ROWS--> with one row per result, linking every image', () => {
    const html = renderReport(template, results);
    expect(html).not.toContain('<!--ROWS-->');
    expect(html.startsWith(template.slice(0, template.indexOf('<!--ROWS-->')))).toBe(true);
    for (const r of results) expect(html).toContain(r.name);
    for (const src of Object.values(results[0]!.images)) expect(html).toContain(`src="${src}"`);
    expect(html).toContain('mock missing');
  });

  it('C-058: is pure (same input, same output; template untouched)', () => {
    const before = template;
    expect(renderReport(template, results)).toBe(renderReport(template, results));
    expect(template).toBe(before);
  });
});

describe('tests/visual/pairs.ts', () => {
  it.skipIf(!existsSync(designDir))('C-058: every mock id exists in its .tmp/design export', () => {
    const missing = PAIRS.filter((p) => {
      if (!p.mock) return false; // no tile yet: intentional, not a missing one (retro P-7)
      const file = new URL(p.mock.file, designDir);
      return !existsSync(file) || !readFileSync(file, 'utf8').includes(`id="${p.mock.id}"`);
    }).map((p) => `${p.mock!.file}#${p.mock!.id}`);
    expect(missing).toEqual([]);
  });
});
