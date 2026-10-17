// scripts/lighthouse.mjs: the cache key covers a page's HTML and every local file it pulls in
// (and nothing else); the lane pool and the memory clamp; best-of-3 judging and the summary report.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  bestRun,
  DEFAULT_LANES,
  HEADROOM_BYTES,
  LANE_BYTES,
  laneCount,
  MARKER,
  pageKey,
  pool,
  runMetrics,
  SUMMARY_LIMIT,
  summaryMarkdown,
} from './lighthouse.mjs';

const root = mkdtempSync(join(tmpdir(), 'lh-key-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const put = (path: string, body: string) => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), body);
};

put(
  'docs/p/index.html',
  '<link rel="stylesheet" href="/docs/_astro/a.css"><script type="module" src="/docs/_astro/m.js"></script>' +
    '<img src="../img.png" width="1" height="1"><a href="/docs/404.html">404</a><a href="/docs/q/">q</a>',
);
put('docs/_astro/a.css', '@font-face{src:url(./f.woff2)}');
put('docs/_astro/f.woff2', 'font');
put('docs/_astro/m.js', 'import"./c.js";const u=`/docs/_astro/lazy.js`;');
put('docs/_astro/c.js', 'chunk');
put('docs/_astro/lazy.js', 'lazy');
put('docs/img.png', 'png');
put('docs/404.html', 'other page');
put('docs/q/index.html', 'other page');
put('docs/_astro/unrelated.css', 'x{}');

const key = () => pageKey(root, '/docs/p/', 'salt');

describe('pageKey', () => {
  it.each(['docs/_astro/f.woff2', 'docs/_astro/c.js', 'docs/_astro/lazy.js', 'docs/img.png', 'docs/_astro/a.css'])(
    'changes when %s changes',
    (path) => {
      const was = key();
      put(path, `changed ${path} @font-face{src:url(./f.woff2)}`);
      expect(key()).not.toBe(was);
    },
  );

  it('ignores files the page does not reference, other pages included', () => {
    const was = key();
    for (const path of ['docs/_astro/unrelated.css', 'docs/404.html', 'docs/q/index.html']) put(path, 'changed');
    expect(key()).toBe(was);
  });

  it('changes with the salt and with the page itself', () => {
    const was = key();
    expect(pageKey(root, '/docs/p/', 'other')).not.toBe(was);
    put('docs/p/index.html', 'changed');
    expect(key()).not.toBe(was);
  });
});

describe('pool', () => {
  it('runs every item once on at most n lanes, results in item order', async () => {
    let running = 0;
    let peak = 0;
    const lanes = new Set<number>();
    const items = Array.from({ length: 10 }, (_, i) => i);
    const out = await pool(items, 3, async (item, lane) => {
      lanes.add(lane);
      peak = Math.max(peak, ++running);
      await new Promise((r) => setTimeout(r, (item % 3) * 5));
      running--;
      return item * 2;
    });
    expect(out).toEqual(items.map((i) => i * 2));
    expect(peak).toBe(3);
    expect([...lanes].sort((a, b) => a - b)).toEqual([0, 1, 2]);
  });

  it('starts no more lanes than items', async () => {
    const lanes = new Set<number>();
    await pool(['a'], 4, (_, lane) => Promise.resolve(lanes.add(lane)));
    expect([...lanes]).toEqual([0]);
  });
});

describe('laneCount', () => {
  const room = (lanes: number) => HEADROOM_BYTES + lanes * LANE_BYTES;
  it('takes the request when memory allows', () => expect(laneCount(5, room(8))).toBe(5));
  it('falls back to the default for a missing request', () => expect(laneCount(NaN, room(8))).toBe(DEFAULT_LANES));
  it('clamps to the lanes that fit above the headroom', () => expect(laneCount(5, room(2) + 1)).toBe(2));
  it('keeps one lane on a starved host', () => expect(laneCount(5, 0)).toBe(1));
});

const metrics = (score: number, lcp = 1000) => ({ score, fcp: 800, lcp, tbt: 50, cls: 0.01, si: 900 });
const pass = (score = 1) => ({ failures: [], metrics: metrics(score) });
const fail = (...failures: string[]) => ({ failures, metrics: metrics(0.99) });

describe('runMetrics', () => {
  it('reads the score and the five audits, rounded', () => {
    const num = (numericValue: number) => ({ numericValue });
    expect(
      runMetrics({
        categories: { performance: { score: 0.994 } },
        audits: {
          'first-contentful-paint': num(812.4),
          'largest-contentful-paint': num(1500.6),
          'total-blocking-time': num(0),
          'cumulative-layout-shift': num(0.01234),
          'speed-index': num(900),
        },
      }),
    ).toEqual({ score: 0.99, fcp: 812, lcp: 1501, tbt: 0, cls: 0.012, si: 900 });
  });
  it('leaves absent audits out', () => expect(runMetrics({}).lcp).toBeUndefined());
});

describe('bestRun', () => {
  it('is the passing run, even after failures', () => {
    const ok = pass();
    expect(bestRun([fail('a', 'b'), ok, fail('a')])).toBe(ok);
  });
  it('is the run with the fewest failed assertions when none passes, the first on a tie', () => {
    const [a, b, c] = [fail('x', 'y'), fail('x'), fail('z')];
    expect(bestRun([a, b, c])).toBe(b);
  });
  it('ranks a crashed run (no metrics) behind any measured one', () => {
    const measured = fail('x', 'y', 'z');
    expect(bestRun([{ failures: ['lighthouse error: boom'] }, measured])).toBe(measured);
  });
});

describe('summaryMarkdown', () => {
  const lines = (md: string) => md.split('\n');

  it('starts with the marker and states the verdict', () => {
    const md = summaryMarkdown(
      [
        { path: '/', ms: 1, runs: [pass()] },
        { path: '/apps/', ms: 1, runs: [fail('categories:performance 0.99'), pass()] },
        { path: '/bad/', ms: 1, runs: [fail('a'), fail('a'), fail('a')] },
      ],
      { cached: 4 },
    );
    expect(lines(md)[0]).toBe(MARKER);
    expect(md).toContain('**7 URLs, 2 retried, 1 failed** (4 cached green, not audited)');
  });

  it('lists every run of retried and failed URLs, none of the clean ones, and escapes pipes', () => {
    const md = summaryMarkdown([
      { path: '/clean/', ms: 1, runs: [pass()] },
      { path: '/apps/', ms: 1, runs: [fail('a | b'), pass()] },
    ]);
    const table = md.slice(md.indexOf('### Retried'), md.indexOf('<details>'));
    expect(table).toContain('`/apps/`');
    expect(table).not.toContain('/clean/');
    expect(table).toContain('fail `a \\| b`');
    expect(table.match(/\| (?:1|2) \|/g)).toHaveLength(2);
    expect(table).toContain('| pass |');
  });

  it('marks the reported run of a URL that never passed', () => {
    const md = summaryMarkdown([{ path: '/bad/', ms: 1, runs: [fail('a', 'b'), fail('a'), fail('a', 'b')] }]);
    expect(md.match(/\(reported\)/g)).toHaveLength(1);
  });

  it('shows no retry table when nothing retried, and the 10 tightest pages by score', () => {
    const results = Array.from({ length: 12 }, (_, i) => ({
      path: `/p${i}/`,
      ms: 1,
      runs: [pass(i < 3 ? 0.97 + i / 100 : 1)],
    }));
    const md = summaryMarkdown(results);
    expect(md).not.toContain('### Retried');
    const tight = md.slice(md.indexOf('<details>'));
    expect(tight.match(/`\/p\d+\/`/g)).toHaveLength(10);
    expect(tight.indexOf('/p0/')).toBeLessThan(tight.indexOf('/p1/'));
  });

  it('stays under the limit in UTF-8 bytes: drops the tightest table first, then trailing run rows', () => {
    const results = Array.from({ length: 300 }, (_, i) => ({
      path: `/page-${i}/`,
      ms: 1,
      runs: [fail('größe 日本語 … 0.99'), pass()],
    }));
    const bytes = (s: string) => Buffer.byteLength(s);
    const full = summaryMarkdown(results, { limit: 1e9 });
    expect(bytes(full)).toBeGreaterThan(full.length);
    const cap = Math.floor(bytes(full) / 2);
    const md = summaryMarkdown(results, { limit: cap });
    expect(bytes(md)).toBeLessThanOrEqual(cap);
    expect(md.length).toBeLessThan(bytes(md));
    expect(lines(md)[0]).toBe(MARKER);
    expect(md).not.toContain('<details>');
    expect(md).toMatch(/\d+ more run rows omitted/);
    expect(bytes(summaryMarkdown(results))).toBeLessThanOrEqual(SUMMARY_LIMIT);
    expect(SUMMARY_LIMIT).toBeLessThan(60_000);
  });

  it('turns every free-text value into a code span: no backtick, backslash or control character gets out', () => {
    const md = summaryMarkdown([{ path: '/p`x/', ms: 1, runs: [fail('[a](https://x) `b` \\ @c\n#1'), pass()] }]);
    expect(md).toContain('| `/p x/` | 1 |');
    expect(md).toContain('fail `[a](https://x) b @c #1`');
  });

  it('keeps <details> closed when the table fits', () => {
    const md = summaryMarkdown([{ path: '/p/', ms: 1, runs: [pass()] }]);
    expect(md.match(/<details>/g)).toHaveLength(1);
    expect(md.match(/<\/details>/g)).toHaveLength(1);
  });

  it('lists a URL that failed without a retry (a lane crash) with its path and error', () => {
    const md = summaryMarkdown([
      { path: '/ok/', ms: 1, runs: [pass()] },
      { path: '/crash/', ms: 0, runs: [{ failures: ['lane exited (1) mid-audit'] }] },
    ]);
    expect(md).toContain('**2 URLs, 0 retried, 1 failed**');
    const table = md.slice(md.indexOf('### Retried'), md.indexOf('<details>'));
    expect(table).toContain('`/crash/`');
    expect(table).toContain('fail `lane exited (1) mid-audit` (reported)');
    expect(table).not.toContain('/ok/');
  });

  it('says "1 URL" for one URL', () => {
    expect(summaryMarkdown([{ path: '/', ms: 1, runs: [pass()] }])).toContain('**1 URL, 0 retried, 0 failed**');
  });

  it('is only the verdict when everything was cached', () => {
    expect(summaryMarkdown([], { cached: 5 })).toContain('**5 URLs, 0 retried, 0 failed**');
  });
});
