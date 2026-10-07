// C-111: `.lighthouserc.cjs` audits every committed example page (minus
// samples/**) plus 404.html and every story page (C-125), derived from the source tree (no build needed),
// with one budget assertion block per page class, plus one per page with its own preJsGz cap. It
// also lists every HTML page of the built root site (C-309), so it reads `site/dist`, which the vitest globalSetup builds.
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  budgetOf,
  CLASS_PATTERNS,
  classOf,
  examplePages,
  PRE_JS_VISIBLE,
  routeOf,
  SHELL_PAGES,
  sitePages,
} from '../tests/budgets.mjs';
import { RETRY_RUNS } from './lighthouse.mjs';
import { serveStage, STAGE_ROOT, stageExample } from './lhci-stage.mjs';

interface Assertion {
  matchingUrlPattern: string;
  assertions: Record<string, [string, Record<string, number>]>;
}
interface Rc {
  ci: { collect: { url: string[]; numberOfRuns: number }; assert: { assertMatrix?: Assertion[] } };
}

const root = fileURLToPath(new URL('..', import.meta.url));
let rc: Rc;
let urls: string[];
beforeAll(() => {
  rc = createRequire(import.meta.url)('../.lighthouserc.cjs') as Rc;
  urls = rc.ci.collect.url;
});

const tmp = mkdtempSync(join(tmpdir(), 'lhci-urls-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe('C-111 Lighthouse URL list', () => {
  it('lists every committed example page and 404.html', () => {
    const committed = execFileSync('git', ['ls-files', 'examples/starlight/src/content/docs'], {
      cwd: root,
      encoding: 'utf8',
    })
      .split('\n')
      .map((f) => f.replace('examples/starlight/src/content/docs/', ''))
      .filter((f) => /\.mdx?$/.test(f) && !f.startsWith('samples/'));
    expect(committed.length).toBeGreaterThan(0);
    for (const f of committed) expect(urls, f).toContain(routeOf(f));
    expect(urls).toContain('/docs/404.html');
    expect(urls.some((u) => u.includes('/samples/'))).toBe(false);
  });

  it('derives the list from the tree: a planted page and story appear, samples do not', () => {
    const docs = join(tmp, 'docs');
    const stories = join(tmp, 'stories');
    for (const f of ['index.mdx', '404.md', 'components/index.mdx', 'components/planted.md', 'samples/ocx/x.md']) {
      mkdirSync(dirname(join(docs, f)), { recursive: true });
      writeFileSync(join(docs, f), '---\ntitle: t\n---\n');
    }
    for (const f of ['planted/default.mdx', 'iconography/icon/default.mdx']) {
      mkdirSync(dirname(join(stories, f)), { recursive: true });
      writeFileSync(join(stories, f), '---\ntitle: t\nheight: 1\n---\n');
    }
    expect(examplePages(docs, stories)).toEqual(
      [
        '/docs/',
        '/docs/404.html',
        '/docs/components/',
        '/docs/components/planted/',
        '/docs/stories/iconography/icon/default/',
        '/docs/stories/planted/default/',
        ...SHELL_PAGES,
      ].sort(),
    );
    expect([...examplePages(), ...sitePages()]).toEqual(urls);
  });

  it('lists every committed story page (C-125)', () => {
    const committed = execFileSync('git', ['ls-files', 'examples/starlight/src/stories'], {
      cwd: root,
      encoding: 'utf8',
    })
      .split('\n')
      .filter((f) => f.endsWith('.mdx'))
      .map((f) => `/docs/stories/${f.replace('examples/starlight/src/stories/', '').replace(/\.mdx$/, '')}/`);
    for (const u of committed) expect(urls, u).toContain(u);
  });

  it('lists every HTML page of site/dist, each in exactly one budget class (C-309)', () => {
    const pages = sitePages();
    expect(pages).toEqual(expect.arrayContaining(['/', '/404.html', '/apps/', '/install/', '/integrations/']));
    for (const p of pages) {
      expect(urls, p).toContain(p);
      expect(classOf(p), p).toBe('content');
    }
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('runs once per URL, three times (median judged) when the first run fails', () => {
    expect(rc.ci.collect.numberOfRuns).toBe(1);
    expect(RETRY_RUNS).toBe(3);
  });

  it('asserts categories and budgets once per page class and per PRE_JS_VISIBLE page', () => {
    const matrix = rc.ci.assert.assertMatrix ?? [];
    expect(matrix).toHaveLength(Object.keys(CLASS_PATTERNS).length + Object.keys(PRE_JS_VISIBLE).length);
    for (const url of urls) {
      const full = `http://localhost:9876${url}`;
      const hits = matrix.filter((m) => new RegExp(m.matchingUrlPattern).test(full));
      expect(hits, url).toHaveLength(1);
      const b = budgetOf(url);
      const a = hits[0]?.assertions ?? {};
      for (const cat of ['performance', 'accessibility', 'best-practices', 'seo']) {
        expect(a[`categories:${cat}`], `${url} ${cat}`).toEqual(['error', { minScore: 1 }]);
      }
      expect(a['resource-summary:script:size']).toEqual(['error', { maxNumericValue: b.preJsGz }]);
      expect(a['total-byte-weight']).toEqual(['error', { maxNumericValue: b.totalBytes }]);
      expect(a['dom-size']).toEqual(['error', { maxNumericValue: b.domElements }]);
    }
  });
});

describe('C-309 combined stage', () => {
  it('keys the stage by repo path, so parallel worktrees never wipe each other', () => {
    expect(STAGE_ROOT).toMatch(/ocx-website-lhci-[0-9a-f]{12}$/);
  });

  it('stages the site at the root beside docs/, and serves both like the CDN', async () => {
    const mk = (path: string, body: string) => {
      mkdirSync(dirname(join(tmp, path)), { recursive: true });
      writeFileSync(join(tmp, path), body);
    };
    mk('site/index.html', 'root');
    mk('site/apps/index.html', 'apps');
    mk('example/index.html', 'docs');
    const root = await stageExample({
      root: join(tmp, 'stage'),
      site: join(tmp, 'site'),
      example: join(tmp, 'example'),
    });
    expect(readFileSync(join(root, 'index.html'), 'utf8')).toBe('root');
    expect(readFileSync(join(root, 'docs/index.html'), 'utf8')).toBe('docs');
    const server = await serveStage(root, 0);
    try {
      const base = `http://localhost:${(server.address() as AddressInfo).port}`;
      const get = (path: string) => fetch(base + path, { redirect: 'manual' });
      expect(await (await get('/')).text()).toBe('root');
      expect(await (await get('/apps/')).text()).toBe('apps');
      expect(await (await get('/docs/')).text()).toBe('docs');
      expect((await get('/apps')).status).toBe(301);
      expect((await get('/nope/')).status).toBe(404);
      expect((await get('/%E0%A4%A')).status).toBe(400); // malformed escape: an answer, not a crashed handler
      expect((await get('/apps/')).status).toBe(200);
    } finally {
      server.close();
    }
  });
});

// C-071: with site/dist absent both gates stop on `missing dist: site/dist`, before any build or
// browser starts. Runs in a scratch repo (the real site/dist is shared with parallel test files);
// the `pnpm` shim answers the `install` dependency, which `task` runs before the gate's own steps.
describe('C-071 missing site dist', () => {
  const hasTask = !spawnSync('task', ['--version']).error;
  it.skipIf(!hasTask).each(['e2e', 'lighthouse'])('`task %s` fails with `missing dist: site/dist`', (name) => {
    const repo = mkdtempSync(join(tmp, 'repo-'));
    const bin = join(repo, 'bin');
    for (const d of ['scripts', 'examples/starlight/dist', 'site', 'bin'])
      mkdirSync(join(repo, d), { recursive: true });
    cpSync(join(root, 'Taskfile.yml'), join(repo, 'Taskfile.yml'));
    cpSync(join(root, 'scripts/require-dist.mjs'), join(repo, 'scripts/require-dist.mjs'));
    for (const f of ['examples/starlight/package.json', 'site/package.json', 'examples/starlight/dist/index.html'])
      writeFileSync(join(repo, f), '');
    writeFileSync(join(bin, 'pnpm'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    const env = { ...process.env, NO_COLOR: '1', PATH: `${bin}:${process.env.PATH}` };
    const r = spawnSync('task', [name], { cwd: repo, encoding: 'utf8', env });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('missing dist: site/dist');
    expect(r.stderr).not.toContain('missing dist: examples/starlight/dist');
  });
});
