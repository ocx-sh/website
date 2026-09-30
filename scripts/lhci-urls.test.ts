// C-111: `.lighthouserc.cjs` audits every committed example page (minus
// samples/**) plus 404.html and every story page (C-125), derived from the source tree (no build needed),
// with one budget assertion block per page class, plus one per page with its own preJsGz cap.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { budgetOf, CLASS_PATTERNS, examplePages, PRE_JS_VISIBLE, routeOf } from '../tests/budgets.mjs';
import { RETRY_RUNS } from './lighthouse.mjs';

interface Assertion {
  matchingUrlPattern: string;
  assertions: Record<string, [string, Record<string, number>]>;
}
interface Rc {
  ci: { collect: { url: string[]; numberOfRuns: number }; assert: { assertMatrix?: Assertion[] } };
}

const root = fileURLToPath(new URL('..', import.meta.url));
const rc = createRequire(import.meta.url)('../.lighthouserc.cjs') as Rc;
const urls = rc.ci.collect.url;

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
    expect(examplePages(docs, stories)).toEqual([
      '/docs/',
      '/docs/404.html',
      '/docs/components/',
      '/docs/components/planted/',
      '/docs/stories/iconography/icon/default/',
      '/docs/stories/planted/default/',
    ]);
    expect(examplePages()).toEqual(urls);
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
