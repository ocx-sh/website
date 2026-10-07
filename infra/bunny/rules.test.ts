// Rule generator contract: snapshots per zone, asset-cache rules, rule order and limits, refusals, legacy diffs.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import committed from './legacy.json' with { type: 'json' };
import { matchProbe } from './match.mjs';
import { ACTION, MATCH, TRIGGER, planRules } from './rules.mjs';
import p1 from './fixtures/p1-pullzone.json' with { type: 'json' };
import p7 from './fixtures/p7-pullzone.json' with { type: 'json' };
import p8 from './fixtures/p8-pullzone.json' with { type: 'json' };
import pStatus from './fixtures/p-statuscode-pullzone.json' with { type: 'json' };
import { storageZoneName } from './zones.mjs';

type Entry = (typeof committed.entries)[number];
type Legacy = { entries: Entry[] };

const RULES = new URL('./rules.mjs', import.meta.url).pathname;
const ZONES = ['dev', 'prod', 'preview:ocx'] as const;
const PLAN_CEILING = 40;

/** Runs the CLI with no credentials in its environment, optionally against a fixture `legacy.json`. */
function cli(zone: string, legacy?: Legacy) {
  const args = [RULES, '--zone', zone];
  if (legacy) {
    const file = join(mkdtempSync(join(tmpdir(), 'ocx-rules-')), 'legacy.json');
    writeFileSync(file, JSON.stringify(legacy));
    args.push('--legacy', file);
  }
  const run = spawnSync(process.execPath, args, { encoding: 'utf8', env: { PATH: process.env.PATH ?? '' } });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

const ids = (zone: string, legacy: Legacy = committed) => planRules(zone, { legacy }).map((r) => r.Description);
const withEntries = (...edit: ((entries: Entry[]) => Entry[])[]): Legacy => ({
  entries: edit.reduce((entries, fn) => fn(entries), structuredClone(committed.entries)),
});
const patch = (id: string, change: Partial<Entry>) => (entries: Entry[]) =>
  entries.map((e) => (e.id === id ? { ...e, ...change } : e));

describe('bunny:plan output (offline, byte-stable)', () => {
  it.each(ZONES)('%s: two runs are byte-identical and match the committed snapshot', async (zone) => {
    const first = cli(zone);
    expect(first.status).toBe(0);
    expect(first.stderr).toBe('');
    expect(cli(zone).stdout).toBe(first.stdout);
    await expect(first.stdout).toMatchFileSnapshot(`./__snapshots__/plan-${zone.replace(':', '-')}.json`);
  });

  it('prints the same rules planRules returns', () => {
    const printed = JSON.parse(cli('prod').stdout) as { rules: unknown };
    expect(printed.rules).toEqual(planRules('prod'));
  });

  it('rejects an unknown zone with a usage error', () => {
    const run = cli('staging');
    expect([run.status, run.stdout]).toEqual([2, '']);
    expect(run.stderr).toMatch(/unknown zone/);
  });
});

describe('asset cache rules', () => {
  it.each(['dev', 'prod'])(
    '%s: rules 1-2 cache /_astro/ for a year at the edge and in the browser, on status 200 only',
    (zone) => {
      const [edge, browser] = planRules(zone);
      for (const [rule, id, action] of [
        [edge, 'assets-edge', 3],
        [browser, 'assets-browser', 16],
      ] as const) {
        expect(rule).toMatchObject({
          Description: `ocx:${id}`,
          ActionType: action,
          ActionParameter1: '31536000',
          TriggerMatchingType: 1,
          Enabled: true,
        });
        expect(rule?.Triggers.map((t) => [t.Type, t.PatternMatchingType, t.PatternMatches])).toEqual([
          [0, 0, ['https://*/_astro/*']],
          [8, 0, ['200']],
        ]);
      }
    },
  );

  it('the preview zone has no asset cache rule', () => {
    expect(JSON.stringify(planRules('preview:ocx'))).not.toMatch(/_astro|assets-/);
  });
});

describe('rule set and limits', () => {
  const originIds = (zone: string) => ids(zone).slice(zone === 'prod' ? 7 : 6);

  it.each([
    ['prod', ['assets-edge', 'assets-browser', 'noindex', 'hsts', 'frame', 'catalog-sandbox', 'catalog-nosniff']],
    ['dev', ['assets-edge', 'assets-browser', 'noindex', 'frame', 'catalog-sandbox', 'catalog-nosniff']],
    ['preview:ocx', ['noindex', 'frame']],
  ])('%s: header rules come first, in order', (zone, head) => {
    expect(ids(zone).slice(0, head.length)).toEqual(head.map((id) => `ocx:${id}`));
  });

  it('origin rules follow, longest claimed path first, legacy.json order breaking ties', () => {
    expect(originIds('prod')).toEqual(
      [
        'legacy-ocx-files',
        'legacy-ocx-sdk-python',
        'legacy-rules-ocx',
        'legacy-catalog',
        'legacy-index',
        'legacy-ocx-dirs',
      ].map((id) => `ocx:${id}`),
    );
    expect(originIds('dev')).toEqual(originIds('prod'));
    expect(ids('preview:ocx')).toHaveLength(2);
  });

  it('commits 13 prod and 12 dev rules, prod within the plan ceiling', () => {
    expect([planRules('prod').length, planRules('dev').length]).toEqual([13, 12]);
    expect(planRules('prod').length).toBeLessThanOrEqual(PLAN_CEILING);
  });

  it.each(ZONES)('%s: every Description is a unique ocx:<id>', (zone) => {
    const all = ids(zone);
    expect(new Set(all).size).toBe(all.length);
    for (const d of all) expect(d).toMatch(/^ocx:[a-z0-9-]+$/);
  });

  it.each(ZONES)('%s: at most 5 patterns per trigger and 5 triggers per rule', (zone) => {
    for (const rule of planRules(zone)) {
      expect(rule.Triggers.length, rule.Description).toBeLessThanOrEqual(5);
      for (const t of rule.Triggers) expect(t.PatternMatches.length, rule.Description).toBeLessThanOrEqual(5);
    }
  });

  it('chunks the 24 prod and 8 dev patterns of legacy-ocx-dirs 5 at a time', () => {
    const sizes = (zone: string) =>
      planRules(zone)
        .find((r) => r.Description === 'ocx:legacy-ocx-dirs')
        ?.Triggers.map((t) => t.PatternMatches.length);
    expect(sizes('prod')).toEqual([5, 5, 5, 5, 4]);
    expect(sizes('dev')).toEqual([5, 3]);
  });

  it.each([
    ['prod', ['ocx.sh', 'next.ocx.sh', 'sh-ocx.b-cdn.net']],
    ['dev', ['sh-ocx-dev.b-cdn.net']],
    ['preview:ocx', ['sh-ocx-preview-ocx.b-cdn.net']],
  ])('%s: every pattern outside the asset rules starts with a literal zone host', (zone, hosts) => {
    for (const rule of planRules(zone).filter((r) => !r.Description.startsWith('ocx:assets-'))) {
      for (const t of rule.Triggers)
        for (const p of t.PatternMatches)
          expect(
            hosts.some((h) => p.startsWith(`https://${h}/`)),
            p,
          ).toBe(true);
    }
  });

  it('noindex names no ocx.sh pattern; hsts names only ocx.sh and exists on prod only', () => {
    const patterns = (zone: string, id: string) =>
      planRules(zone)
        .find((r) => r.Description === `ocx:${id}`)
        ?.Triggers.flatMap((t) => t.PatternMatches);
    expect(patterns('prod', 'noindex')).toEqual(['https://next.ocx.sh/*', 'https://sh-ocx.b-cdn.net/*']);
    expect(patterns('dev', 'noindex')).toEqual(['https://sh-ocx-dev.b-cdn.net/*']);
    expect(patterns('prod', 'hsts')).toEqual(['https://ocx.sh/*', 'https://next.ocx.sh/*']);
    expect(patterns('dev', 'hsts')).toBeUndefined();
    expect(patterns('prod', 'frame')).toEqual([
      'https://ocx.sh/*',
      'https://next.ocx.sh/*',
      'https://sh-ocx.b-cdn.net/*',
    ]);
  });

  it('catalog-sandbox and catalog-nosniff cover the package pages on every prod and dev host, never previews', () => {
    const paths = ['/catalog/p/*', '/catalog/index/*/p/*'];
    const hosts = {
      prod: ['ocx.sh', 'next.ocx.sh', 'sh-ocx.b-cdn.net'],
      dev: ['sh-ocx-dev.b-cdn.net'],
    };
    for (const [zone, zoneHosts] of Object.entries(hosts)) {
      const rules = planRules(zone);
      const rule = (id: string) => rules.find((r) => r.Description === `ocx:${id}`);
      expect(rule('catalog-sandbox')).toMatchObject({
        ActionType: 5,
        ActionParameter1: 'Content-Security-Policy',
        ActionParameter2: 'sandbox',
      });
      expect(rule('catalog-nosniff')).toMatchObject({
        ActionType: 5,
        ActionParameter1: 'X-Content-Type-Options',
        ActionParameter2: 'nosniff',
      });
      expect(rule('catalog-sandbox')?.Triggers.flatMap((t) => t.PatternMatches)).toEqual(
        zoneHosts.flatMap((h) => paths.map((p) => `https://${h}${p}`)),
      );
      for (const host of zoneHosts) {
        for (const path of ['/catalog/p/jq', '/catalog/index/ocx/p/jq'])
          expect(matchProbe(rules, { host, path, status: 200 }).headers, `${host}${path}`).toEqual(
            expect.arrayContaining(['catalog-sandbox', 'catalog-nosniff']),
          );
        for (const path of ['/catalog/', '/catalog/index/ocx/', '/docs/p/x'])
          expect(matchProbe(rules, { host, path, status: 200 }).headers, `${host}${path}`).not.toContain(
            'catalog-sandbox',
          );
      }
      // Header rules precede every origin rule, so the /catalog redirect or a later origin rule never shadows them.
      const order = rules.map((r) => r.Description);
      const lastHeader = Math.max(...['catalog-sandbox', 'catalog-nosniff'].map((id) => order.indexOf(`ocx:${id}`)));
      expect(lastHeader).toBeLessThan(order.indexOf('ocx:legacy-ocx-files'));
    }
    expect(planRules('preview:ocx').map((r) => r.Description)).not.toContain('ocx:catalog-sandbox');
  });

  it('the rehearsal host next.ocx.sh gets every ocx.sh rule plus noindex; ocx.sh never gets noindex', () => {
    const rules = planRules('prod');
    const hit = (host: string, path: string) => matchProbe(rules, { host, path, status: 200 });
    for (const [path, origin] of [
      ['/docs/getting-started', 'legacy-ocx-dirs'],
      ['/apps/catalog/x', 'legacy-catalog'],
      ['/catalog', 'legacy-index'],
    ] as const) {
      expect(hit('next.ocx.sh', path).origin, path).toBe(hit('ocx.sh', path).origin);
      expect(hit('next.ocx.sh', path).origin, path).toBe(origin);
    }
    expect(hit('next.ocx.sh', '/').headers).toEqual(['noindex', 'hsts', 'frame']);
    expect(hit('ocx.sh', '/').headers).toEqual(['hsts', 'frame']);
    expect(hit('sh-ocx.b-cdn.net', '/').headers).toEqual(['noindex', 'frame']);
  });

  it('proxy entries become OriginUrl rules, redirect entries 302 rules with the %{Path.N-} tail', () => {
    const rule = (id: string) => planRules('prod').find((r) => r.Description === `ocx:${id}`);
    expect(rule('legacy-ocx-dirs')).toMatchObject({ ActionType: 2, ActionParameter1: 'https://ocx-website.pages.dev' });
    expect(rule('legacy-catalog')).toMatchObject({
      ActionType: 1,
      ActionParameter1: 'https://ocx-sh.github.io/catalog/%{Path.2-}',
      ActionParameter2: '302',
    });
    expect(rule('legacy-index')).toMatchObject({ ActionParameter1: 'https://index.ocx.sh/%{Path.1-}' });
    expect(rule('legacy-index')?.Triggers.flatMap((t) => t.PatternMatches)).toEqual([
      'https://ocx.sh/catalog',
      'https://ocx.sh/catalog/*',
      'https://ocx.sh/catalog.html',
      'https://next.ocx.sh/catalog',
      'https://next.ocx.sh/catalog/*',
      'https://next.ocx.sh/catalog.html',
      'https://sh-ocx.b-cdn.net/catalog',
      'https://sh-ocx.b-cdn.net/catalog/*',
      'https://sh-ocx.b-cdn.net/catalog.html',
    ]);
  });
});

describe('refusals (exit 1, naming the rule)', () => {
  const refuses = (zone: string, legacy: Legacy, ...named: string[]) => {
    const run = cli(zone, legacy);
    expect([run.status, run.stdout]).toEqual([1, '']);
    for (const id of named) expect(run.stderr).toContain(`ocx:${id}`);
  };

  it.each([
    ['prod', 'https://ocx.sh'],
    ['prod', 'https://sh-ocx.b-cdn.net'],
    ['prod', 'https://next.ocx.sh'],
    ['dev', 'https://sh-ocx-dev.b-cdn.net'],
  ])('%s: an OriginUrl target on a zone host loops (%s)', (zone, origin) => {
    refuses(zone, withEntries(patch('legacy-ocx-dirs', { origin })), 'legacy-ocx-dirs');
  });

  it.each([
    'https://OCX.SH',
    'https://ocx.sh:443',
    'https://ocx.sh./x',
    'https://user@ocx.sh',
    'https://Sh-OCX.b-cdn.net:443',
  ])('an OriginUrl target on a zone host loops however it is spelled (%s)', (origin) => {
    refuses('prod', withEntries(patch('legacy-ocx-dirs', { origin })), 'legacy-ocx-dirs');
  });

  it.each(['https://SH-OCX.B-CDN.NET/catalog/', 'https://sh-ocx.b-cdn.net:443/catalog/'])(
    'a prod Redirect to a b-cdn.net host is refused however it is spelled (%s)',
    (origin) => {
      refuses('prod', withEntries(patch('legacy-catalog', { origin })), 'legacy-catalog');
    },
  );

  it('a pattern with * before its path is refused', () => {
    refuses('prod', withEntries(patch('legacy-ocx-dirs', { paths: ['*/docs/'] })), 'legacy-ocx-dirs');
  });

  it('two overlapping origin rules at equal order are refused', () => {
    const dup = (entries: Entry[]) => [...entries, { ...entries[0]!, id: 'legacy-dup' }];
    refuses('prod', withEntries(dup), 'legacy-ocx-dirs', 'legacy-dup');
  });

  describe('an entry that outranks a more specific claim of another entry', () => {
    const proxy = (id: string, paths: string[]): Entry => ({
      id,
      repo: `ocx-sh/${id}`,
      mode: 'proxy',
      origin: 'https://ocx-website.pages.dev',
      paths,
    });

    it('is refused: the longest path of a multi-path entry must not decide for its shorter ones', () => {
      refuses(
        'prod',
        { entries: [proxy('wide', ['/a/', '/zzzzzzzzzzzz/']), proxy('nested', ['/a/b/c/'])] },
        'wide',
        'nested',
      );
    });

    it('is accepted when the nested claim ranks first', () => {
      expect(ids('prod', { entries: [proxy('wide', ['/a/']), proxy('nested', ['/a/b/c/'])] }).slice(-2)).toEqual([
        'ocx:nested',
        'ocx:wide',
      ]);
    });
  });

  it('a relative Redirect target is refused', () => {
    refuses('prod', withEntries(patch('legacy-catalog', { origin: '/catalog/' })), 'legacy-catalog');
  });

  it('a prod Redirect to a b-cdn.net host is refused; dev accepts it', () => {
    const legacy = withEntries(patch('legacy-catalog', { origin: 'https://sh-ocx.b-cdn.net/catalog/' }));
    refuses('prod', legacy, 'legacy-catalog');
    expect(cli('dev', legacy).status).toBe(0);
  });
});

describe('deleting a legacy entry (single legacy.json edit, then plan the diff)', () => {
  const sameRule = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

  it.each([
    ['legacy-catalog', 'catalog', 'ocx-sh/catalog'],
    ['legacy-rules-ocx', 'rules-ocx', 'ocx-sh/rules_ocx'],
    ['legacy-ocx-sdk-python', 'ocx-sdk-python', 'ocx-sh/ocx-sdk-python'],
    ['legacy-index', 'index', 'ocx-sh/index'],
  ])('removing %s removes exactly its rule and adds repo-%s', (id, name, repo) => {
    const before = planRules('prod');
    const after = planRules('prod', { legacy: withEntries((entries) => entries.filter((e) => e.id !== id)) });
    const removed = before.filter((r) => !after.some((a) => sameRule(a, r)));
    const added = after.filter((a) => !before.some((r) => sameRule(a, r)));
    expect(removed.map((r) => r.Description)).toEqual([`ocx:${id}`]);
    expect(added.map((r) => r.Description)).toEqual([`ocx:repo-${name}`]);
    expect(added[0]).toMatchObject({ ActionType: 17, ActionParameter1: '', ActionParameter2: storageZoneName(repo) });
    expect(after.length).toBe(before.length);
  });

  it('a repo with legacy entries left gets no repo rule', () => {
    const after = ids(
      'prod',
      withEntries((entries) => entries.filter((e) => e.id !== 'legacy-ocx-files')),
    );
    expect(after.filter((d) => d.startsWith('ocx:repo-'))).toEqual([]);
  });

  it('the repo rule claims its path and sorts among the origin rules', () => {
    const after = planRules('dev', {
      legacy: withEntries((entries) => entries.filter((e) => e.id !== 'legacy-rules-ocx')),
    });
    const repoRule = after.find((r) => r.Description === 'ocx:repo-rules-ocx');
    expect(repoRule?.Triggers.flatMap((t) => t.PatternMatches)).toEqual([
      'https://sh-ocx-dev.b-cdn.net/integrations/bazel',
      'https://sh-ocx-dev.b-cdn.net/integrations/bazel/*',
    ]);
    expect(after.map((r) => r.Description).indexOf('ocx:repo-rules-ocx')).toBe(
      ids('dev').indexOf('ocx:legacy-rules-ocx'),
    );
  });
});

describe('S-120: the bare directory path stays routed when a legacy entry is deleted', () => {
  it.each([
    ['legacy-ocx-sdk-python', '/integrations/python', 'repo-ocx-sdk-python'],
    ['legacy-catalog', '/apps/catalog', 'repo-catalog'],
    ['legacy-index', '/catalog', 'repo-index'],
    ['legacy-rules-ocx', '/integrations/bazel', 'repo-rules-ocx'],
  ])('removing %s: %s goes to %s on every host', (id, path, winner) => {
    const rules = planRules('prod', { legacy: withEntries((entries) => entries.filter((e) => e.id !== id)) });
    for (const host of ['ocx.sh', 'sh-ocx.b-cdn.net'])
      expect(matchProbe(rules, { host, path, status: 200 }).origin, `${host}${path}`).toBe(winner);
  });
});

describe('storageZoneName', () => {
  it.each([
    ['ocx-sh/website', 'sh-ocx-website'],
    ['ocx-sh/ocx', 'sh-ocx-ocx'],
    ['ocx-sh/rules_ocx', 'sh-ocx-rules-ocx'],
    ['ocx-sh/ocx-sdk.python', 'sh-ocx-ocx-sdk-python'],
  ])('%s is %s', (repo, zone) => {
    expect(storageZoneName(repo)).toBe(zone);
  });
});

// Recorded in M0 (2026-10-05): rules written through the API to `sh-ocx-dev` and read back.
describe('against the recorded edge rules', () => {
  // Each fixture holds the probe rules live when it was recorded: pick this probe's own.
  const probeRule = (zone: { EdgeRules: { Description: string }[] }, probe: string) =>
    zone.EdgeRules.find((r) => r.Description.startsWith(`m0 probe: ${probe}`))!;
  const storage = probeRule(p1, 'p1') as (typeof p1.EdgeRules)[number];
  const proxy = probeRule(p7, 'p7') as (typeof p7.EdgeRules)[number];
  const redirect = probeRule(p8, 'p8') as (typeof p8.EdgeRules)[number];
  const status = probeRule(pStatus, 'status') as (typeof pStatus.EdgeRules)[number];

  it('uses the recorded action, trigger and match enums', () => {
    expect(ACTION.OriginStorage).toBe(storage.ActionType);
    expect(ACTION.OriginUrl).toBe(proxy.ActionType);
    expect(ACTION.Redirect).toBe(redirect.ActionType);
    expect(ACTION.SetResponseHeader).toBe(status.ActionType);
    expect(TRIGGER.Url).toBe(storage.Triggers[0]!.Type);
    expect(TRIGGER.StatusCode).toBe(status.Triggers[1]!.Type);
    expect(MATCH.All).toBe(status.TriggerMatchingType);
  });

  it("plans an OriginStorage rule the way the recorded one reads: Id in parameter 1 is apply's, the name in parameter 2", () => {
    const after = planRules('dev', {
      legacy: { entries: committed.entries.filter((e) => e.id !== 'legacy-rules-ocx') },
    });
    const planned = after.find((r) => r.ActionType === ACTION.OriginStorage)!;
    expect(Object.keys(planned).filter((k) => !(k in storage))).toEqual([]);
    expect(planned.ActionParameter2).toBe(storageZoneName('ocx-sh/rules_ocx'));
    expect(storage.ActionParameter2).toBe('sh-ocx-m0-scratch');
    expect(storage.ActionParameter1).toMatch(/^\d+$/);
  });

  it('plans the redirect status in parameter 2, where the recorded rule keeps it', () => {
    expect(redirect.ActionParameter2).toMatch(/^30[12]$/);
    const planned = planRules('prod').find((r) => r.ActionType === ACTION.Redirect)!;
    expect(planned.ActionParameter2).toBe('302');
    expect(Object.keys(planned).filter((k) => !(k in redirect))).toEqual([]);
  });
});
