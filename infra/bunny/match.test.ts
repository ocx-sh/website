// First-match golden: the winning origin rule and the stacked header rules of every probe, over the real plans.
import nav from '@ocx-sh/theme/nav.json' with { type: 'json' };
import { describe, expect, it } from 'vitest';
import legacy from './legacy.json' with { type: 'json' };
import { matchProbe } from './match.mjs';
import { planRules } from './rules.mjs';

type Probe = { zone: 'dev' | 'prod'; host: string; path: string; status: number };

const PROD_HOST = 'ocx.sh';
const claims = (nav.claims as { path: string }[]).map((c) => c.path);
const legacyPaths = legacy.entries.flatMap((e) => e.paths);
const paths = [
  ...claims,
  ...claims.map((c) => `${c}x/`),
  ...legacyPaths,
  '/apps/catalog/x/',
  '/catalog/x/',
  '/docs/v2/',
  '/v2/',
  '/unknown/',
  '/docs/getting-started',
  '/assets/x.js',
  '/logo.svg',
  '/integrations/bazel/a/',
  '/_astro/x.js',
];
const hostProbes = ['/', '/docs/getting-started'];

const probes: Probe[] = [
  ...paths.map((path) => ({ zone: 'prod' as const, host: PROD_HOST, path, status: 200 })),
  { zone: 'prod', host: PROD_HOST, path: '/_astro/x.js', status: 404 },
  ...hostProbes.flatMap((path) => [
    { zone: 'prod' as const, host: 'sh-ocx.b-cdn.net', path, status: 200 },
    { zone: 'dev' as const, host: 'sh-ocx-dev.b-cdn.net', path, status: 200 },
  ]),
  { zone: 'dev', host: 'sh-ocx-dev.b-cdn.net', path: '/_astro/x.js', status: 200 },
].filter((p, i, all) => all.findIndex((q) => JSON.stringify(q) === JSON.stringify(p)) === i) as Probe[];

const plans = { dev: planRules('dev'), prod: planRules('prod') };
const run = (p: Probe) => matchProbe(plans[p.zone], p);
const at = (path: string, status = 200, zone: Probe['zone'] = 'prod', host = PROD_HOST) =>
  run({ zone, host, path, status });

describe('first-match golden (prod and dev plans)', () => {
  it('matches the committed table', async () => {
    const rows = probes.map((p) => {
      const m = run(p);
      return [
        p.zone,
        p.host,
        String(p.status),
        p.path,
        '->',
        m.origin ?? '(default origin)',
        '|',
        m.headers.join(' ') || '-',
      ];
    });
    const width = rows[0]?.map((_, c) => Math.max(...rows.map((r) => (r[c] ?? '').length))) ?? [];
    const table = rows.map((r) =>
      r
        .map((cell, c) => cell.padEnd(width[c] ?? 0))
        .join(' ')
        .trimEnd(),
    );
    await expect(`${table.join('\n')}\n`).toMatchFileSnapshot('./__snapshots__/match-golden.txt');
  });

  it('probes every claim root, claim child, legacy path and spec case', () => {
    for (const path of [...claims, ...legacyPaths, '/docs/v2/', '/v2/', '/unknown/', '/integrations/bazel/a/'])
      expect(
        probes.some((p) => p.path === path),
        path,
      ).toBe(true);
  });
});

describe('first-match outcomes the table must keep', () => {
  it('the longer claim wins: /apps/catalog/x/ is legacy-catalog, /catalog/x/ legacy-index', () => {
    expect(at('/apps/catalog/x/').origin).toBe('legacy-catalog');
    expect(at('/catalog/x/').origin).toBe('legacy-index');
  });

  it('legacy directories and files proxy to the old site', () => {
    expect(at('/docs/v2/').origin).toBe('legacy-ocx-dirs');
    for (const path of ['/docs/getting-started', '/assets/x.js']) expect(at(path).origin, path).toBe('legacy-ocx-dirs');
    expect(at('/logo.svg').origin).toBe('legacy-ocx-files');
  });

  it('a deep link under a redirect claim wins that redirect', () => {
    expect(at('/integrations/bazel/a/').origin).toBe('legacy-rules-ocx');
  });

  it('paths with no origin rule fall to the default origin', () => {
    for (const path of ['/v2/', '/unknown/', '/', '/install/']) expect(at(path).origin, path).toBeNull();
  });

  it('noindex follows the host: absent on ocx.sh, present on both b-cdn.net hosts', () => {
    for (const path of hostProbes) {
      expect(at(path).headers, path).not.toContain('noindex');
      expect(at(path, 200, 'prod', 'sh-ocx.b-cdn.net').headers, path).toContain('noindex');
      expect(at(path, 200, 'dev', 'sh-ocx-dev.b-cdn.net').headers, path).toContain('noindex');
    }
  });

  it('the _astro cache rules need a 200', () => {
    expect(at('/_astro/x.js', 200).headers).toEqual(expect.arrayContaining(['assets-edge', 'assets-browser']));
    const missing = at('/_astro/x.js', 404).headers;
    expect(missing).not.toContain('assets-edge');
    expect(missing).not.toContain('assets-browser');
  });
});
