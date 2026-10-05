// Offline old-URL coverage: every URL the live ocx.sh served before cutover is either built into
// `site/dist` or won by a legacy rule of the prod plan, so none 404s after the DNS flip.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import legacy from '../../infra/bunny/legacy.json' with { type: 'json' };
import { matchProbe } from '../../infra/bunny/match.mjs';
import { ACTION, planRules } from '../../infra/bunny/rules.mjs';
import { dist, root } from '../../site/src/build-site.ts';

/** Every nginx request carries host `ocx.sh`, so the prod plan is probed with it. */
const HOST = 'ocx.sh';
/** Paths nginx on hetzner1 keeps; they are never seeded to Bunny, so no rule or page may cover them. */
const NGINX_ONLY = ['/v2/', '/artifactory/'];

const plan = planRules('prod');
const urls = readFileSync(`${root}infra/old-urls.txt`, 'utf8')
  .split('\n')
  .filter((l) => l !== '' && !l.startsWith('#'));

const inDist = (path: string): boolean => {
  const file = path.replace(/^\//, '');
  const candidates = path.endsWith('/') ? [`${file}index.html`] : [file, `${file}.html`, `${file}/index.html`];
  return (
    candidates.some((c) => c !== '' && existsSync(`${dist}${c}`)) || (path === '/' && existsSync(`${dist}index.html`))
  );
};

/** The legacy rule id that wins `path`, or null when the default origin (the built site) serves it. */
const legacyWinner = (path: string, status = 200): string | null => {
  const { origin } = matchProbe(plan, { host: HOST, path, status });
  return origin !== null && legacy.entries.some((e) => e.id === origin) ? origin : null;
};

/** The paths of `paths` that neither a legacy rule nor `site/dist` serves, plus any nginx-only path. */
const uncovered = (paths: readonly string[]): string[] =>
  paths.filter((p) => NGINX_ONLY.some((n) => p.startsWith(n)) || !(legacyWinner(p) !== null || inDist(p)));

describe('old-URL coverage', () => {
  it('reads the live-crawled list', () => {
    expect(urls.length).toBeGreaterThan(100);
    expect(urls.every((u) => u.startsWith('/'))).toBe(true);
  });

  it('every old URL is built or won by a legacy rule', () => {
    expect(uncovered(urls)).toEqual([]);
  });

  it('a planted uncovered path goes red', () => {
    expect(uncovered([...urls, '/planted-uncovered/page'])).toEqual(['/planted-uncovered/page']);
  });

  it('a /v2/ or /artifactory/ path routes to no Bunny origin and fails coverage', () => {
    for (const path of ['/v2/', '/v2/ocx/manifests/latest', '/artifactory/api/x']) {
      expect(matchProbe(plan, { host: HOST, path, status: 200 }).origin, path).toBeNull();
      expect(uncovered([path]), path).toEqual([path]);
    }
  });
});

describe('legacy winners keep the contract', () => {
  const won = urls.flatMap((path) => {
    const id = legacyWinner(path);
    return id === null ? [] : [{ path, id }];
  });
  const ruleOf = (id: string) => plan.find((r) => r.Description === `ocx:${id}`);

  it('wins at least one legacy path', () => {
    expect(won.length).toBeGreaterThan(0);
  });

  it('a proxy entry is an OriginUrl to its origin, whatever the status (the old site answers its own 404)', () => {
    for (const { path, id } of won) {
      const entry = legacy.entries.find((e) => e.id === id);
      if (entry?.mode !== 'proxy') continue;
      const r = ruleOf(id);
      expect(r?.ActionType, path).toBe(ACTION.OriginUrl);
      expect(r?.ActionParameter1, path).toBe(entry.origin);
      expect(legacyWinner(path, 404), path).toBe(id);
    }
  });

  it('a redirect entry is a 302 to its origin, never a proxy', () => {
    for (const entry of legacy.entries.filter((e) => e.mode === 'redirect')) {
      const r = ruleOf(entry.id);
      expect(r?.ActionType, entry.id).toBe(ACTION.Redirect);
      expect(r?.ActionParameter1, entry.id).toMatch(new RegExp(`^${entry.origin.replace(/[.]/g, '\\.')}`));
      expect(r?.ActionParameter2, entry.id).toBe('302');
    }
  });
});
