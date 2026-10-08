// bunny:apply against the fake API: upsert before delete, no unrouted moment, `ocx:*` only, rule limit,
// dry-run, read-back, and the key refusals.
import { afterEach, describe, expect, it } from 'vitest';
import { RULE_LIMIT, main } from './apply.mjs';
import { evaluationOrder, fakeApi, type EdgeRule, type FakeApi, type Recorded } from './fake-api.ts';
import committed from './legacy.json' with { type: 'json' };
import { matchProbe, type Probe } from './match.mjs';
import { planRules, type BunnyRule } from './rules.mjs';

const KEY = 'fake-key-0123456789';
const ENV = { BUNNY_API_KEY: KEY };
type Legacy = { entries: (typeof committed.entries)[number][] };
type Live = BunnyRule & { Guid: string; OrderIndex: number };

/** A zone's planned rules as a previous apply left them. */
const planned = (zone: string, legacy: Legacy = committed): Live[] =>
  planRules(zone, { legacy }).map((r, i) => ({
    ...r,
    ActionParameter1: r.ActionType === 17 ? String(storageId(r.ActionParameter2)) : r.ActionParameter1,
    OrderIndex: i,
    Guid: `g-${i}`,
  }));
const storageId = (name: string) => STORAGE_ZONES.find((z) => z.Name === name)!.Id;

/** A rule made by hand in the dashboard: no `ocx:` prefix. */
const hand = (i: number): Live => ({
  ...planRules('dev')[0]!,
  Description: `hand-${i}`,
  OrderIndex: 100 + i,
  Guid: `h-${i}`,
});

const without = (id: string): Legacy => ({ entries: committed.entries.filter((e) => e.id !== id) });
/** The edge's view of a zone's live rules: enabled ones, by OrderIndex. */
const edgeRules = (rules: EdgeRule[]) => evaluationOrder(rules) as unknown as BunnyRule[];

/**
 * The fake's `afterRequest`: after EVERY answered request each `stay` probe still routes. `stay` is written out
 * by the test (the paths of removed and narrowed entries), so a path the final plan itself stopped routing cannot
 * hide a gap. A probe that does not route before or after the whole apply is a broken test, not an apply order.
 */
function neverUnrouted(initial: BunnyRule[], final: BunnyRule[], stay: Probe[], violations: string[]) {
  for (const p of stay)
    for (const [label, rules] of [
      ['initial', initial],
      ['final', final],
    ] as const)
      if (matchProbe(rules, p).origin === null)
        throw new Error(`${p.host}${p.path} is not routed in the ${label} plan`);
  return (state: FakeApi['state'], req: Recorded) => {
    const rules = edgeRules(state.pullZones.flatMap((z) => z.EdgeRules));
    for (const p of stay)
      if (matchProbe(rules, p).origin === null)
        violations.push(`${req.method} ${req.path}: ${p.host}${p.path} unrouted`);
  };
}

const DEV = 'sh-ocx-dev.b-cdn.net';
const probe = (path: string): Probe => ({ host: DEV, path, status: 200 });

let api: FakeApi | undefined;
afterEach(async () => {
  await api?.close();
  api = undefined;
});

interface Setup {
  rules?: EdgeRule[];
  zone?: string;
  name?: string;
  legacy?: Legacy;
  env?: Record<string, string>;
  afterRequest?: (state: FakeApi['state'], req: Recorded) => void;
  argv?: string[];
}

/** Every storage zone a plan can name, as Bunny holds them: the Id `apply` writes into the rule. */
const STORAGE_ZONES = planRules('prod', { legacy: { entries: [] } })
  .filter((r) => r.ActionType === 17)
  .map((r, i) => ({ Id: 5000 + i, Name: r.ActionParameter2, Password: '' }));

async function run(setup: Setup = {}) {
  const name = setup.name ?? 'sh-ocx-dev';
  const rules = setup.rules ?? [];
  api = await fakeApi({
    key: KEY,
    pullZones: [{ Id: 1, Name: name, Hostnames: [], EdgeRules: rules }],
    storageZones: STORAGE_ZONES,
    ...(setup.afterRequest ? { afterRequest: setup.afterRequest } : {}),
  });
  return { ...(await go(api, setup)), api };
}

async function go(fake: FakeApi, setup: Setup) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await main({
    argv: setup.argv ?? ['--zone', setup.zone ?? 'dev'],
    env: setup.env ?? ENV,
    out: (t) => out.push(t),
    err: (t) => err.push(t),
    baseUrl: fake.url,
    ...(setup.legacy ? { legacy: setup.legacy } : {}),
  });
  return { code, out: out.join(''), err: err.join('') };
}

const writes = (fake: FakeApi) => fake.requests.filter((r) => r.method !== 'GET');
const live = (fake: FakeApi) => fake.state.pullZones[0]!.EdgeRules;
const names = (rules: EdgeRule[]) => rules.map((r) => r.Description);
const upserted = (fake: FakeApi) =>
  writes(fake)
    .filter((r) => r.path.endsWith('/addOrUpdate'))
    .map((r) => (r.body as { Description: string }).Description);

describe('apply to an empty zone', () => {
  it('creates every planned rule with an explicit OrderIndex and reads back equal', async () => {
    const { code, api } = await run();
    expect(code).toBe(0);
    const plan = planRules('dev');
    expect(names(live(api))).toEqual(plan.map((r) => r.Description));
    expect(live(api).map((r) => r.OrderIndex)).toEqual(plan.map((_, i) => i));
  });

  it('is idempotent: a second run sends no write', async () => {
    const { api } = await run();
    const before = writes(api).length;
    expect((await go(api, {})).code).toBe(0);
    expect(writes(api)).toHaveLength(before);
  });

  it('finds a preview zone by its own name', async () => {
    const { code, api } = await run({ zone: 'preview:ocx', name: 'sh-ocx-preview-ocx' });
    expect(code).toBe(0);
    expect(names(live(api))).toEqual(['ocx:noindex', 'ocx:frame']);
  });
});

describe('OrderIndex stays unique on every write (Bunny rejects a duplicate)', () => {
  const redirect = (id: string, repo: string, name: string, path: string): Legacy['entries'][number] => ({
    id,
    repo,
    mode: 'redirect',
    origin: `https://ocx-sh.github.io/${name}/`,
    paths: [path],
  });
  const FLIPPED = ['legacy-rules-ocx', 'legacy-find-ocx', 'legacy-ocx-sdk-python'];
  /** The zone before the consumers flipped: the three redirect entries sit between `legacy-catalog` and `legacy-index`. */
  const before: Legacy = {
    entries: committed.entries
      .filter((e) => !FLIPPED.includes(e.id))
      .flatMap((e) =>
        e.id === 'legacy-index'
          ? [
              redirect('legacy-rules-ocx', 'ocx-sh/rules_ocx', 'rules_ocx', '/integrations/bazel/'),
              redirect('legacy-find-ocx', 'ocx-sh/find_ocx', 'find_ocx', '/integrations/cmake/'),
              redirect('legacy-ocx-sdk-python', 'ocx-sh/ocx-sdk-python', 'ocx-sdk-python', '/integrations/python/'),
              e,
            ]
          : [e],
      ),
  };
  const after: Legacy = { entries: committed.entries.filter((e) => !FLIPPED.includes(e.id)) };
  /** The live dev zone at the flip: the pre-flip plan minus the two catalog sandbox rules it never received. */
  const seed = () =>
    planned('dev', before)
      .filter((r) => !String(r.Description).startsWith('ocx:catalog-'))
      .map((r, i) => ({ ...r, OrderIndex: i }));

  it('the flip diff (deletes, reorders and creates together) applies without a duplicate index', async () => {
    const { code, err, api } = await run({ rules: seed(), legacy: after });
    expect(err).toBe('');
    expect(code).toBe(0);
    const indexes = live(api).map((r) => r.OrderIndex);
    expect(new Set(indexes).size).toBe(indexes.length);
    const byIndex = [...live(api)].sort((a, b) => Number(a.OrderIndex) - Number(b.OrderIndex));
    expect(names(byIndex)).toEqual(planRules('dev', { legacy: after }).map((r) => r.Description));
  });

  it('--dry-run prints the parks first, in the order the writes run', async () => {
    const { out } = await run({ rules: seed(), legacy: after, argv: ['--zone', 'dev', '--dry-run'] });
    const kinds = out
      .split('\n')
      .filter((l) => /^(park|create|update|delete) /.test(l))
      .map((l) => l.split(' ')[0]);
    expect(kinds[0]).toBe('park');
    expect(kinds.lastIndexOf('park')).toBeLessThan(kinds.indexOf('create'));
    expect(kinds.lastIndexOf('create')).toBeLessThan(kinds.indexOf('update'));
    expect(kinds.lastIndexOf('update')).toBeLessThan(kinds.indexOf('delete'));
  });
});

describe('upsert before delete, never unrouted', () => {
  const CATALOG = [probe('/apps/catalog/x'), probe('/apps/catalog')];

  it('S-120: deleting a legacy entry swaps redirect for repo-catalog with no unrouted moment', async () => {
    const violations: string[] = [];
    const before = planned('dev');
    const next = without('legacy-catalog');
    const { code, api } = await run({
      rules: before,
      legacy: next,
      afterRequest: neverUnrouted(before, planRules('dev', { legacy: next }), CATALOG, violations),
    });
    expect(code).toBe(0);
    expect(violations).toEqual([]);
    expect(names(live(api))).toContain('ocx:repo-catalog');
    expect(names(live(api))).not.toContain('ocx:legacy-catalog');
    expect(live(api).find((r) => r.Description === 'ocx:repo-catalog')).toMatchObject({
      ActionParameter1: String(storageId('sh-ocx-catalog')),
      ActionParameter2: 'sh-ocx-catalog',
    });
    const kinds = writes(api).map((r) => r.method);
    expect(kinds.lastIndexOf('POST')).toBeLessThan(kinds.indexOf('DELETE'));
  });

  /** `/team/` proxied by `legacy-ocx-files` (ranks first) before, by `legacy-ocx-dirs` after: both rules exist. */
  const teamMoves = () => {
    const withTeam = (to: 'legacy-ocx-files' | 'legacy-ocx-dirs'): Legacy => ({
      entries: committed.entries.map((e) => {
        if (e.id === 'legacy-ocx-files' || e.id === 'legacy-ocx-dirs') {
          const rest = e.paths.filter((p) => p !== '/team/');
          return { ...e, paths: e.id === to ? [...rest, '/team/'] : rest };
        }
        return e;
      }),
    });
    return { from: withTeam('legacy-ocx-files'), to: withTeam('legacy-ocx-dirs') };
  };
  const TEAM = [probe('/team/x'), probe('/team')];

  it('a path moving from existing rule X to existing rule Y: Y widens before X narrows', async () => {
    const { from, to } = teamMoves();
    const violations: string[] = [];
    const before = planned('dev', from);
    const { code, api } = await run({
      rules: before,
      legacy: to,
      afterRequest: neverUnrouted(before, planRules('dev', { legacy: to }), TEAM, violations),
    });
    expect(code).toBe(0);
    expect(violations).toEqual([]);
    const order = upserted(api);
    expect(order.indexOf('ocx:legacy-ocx-dirs')).toBeLessThan(order.indexOf('ocx:legacy-ocx-files'));
  });

  it('a path moving from one rule to a new one: the new rule is created before the old one narrows', async () => {
    const team = {
      id: 'legacy-team',
      repo: 'ocx-sh/ocx',
      mode: 'proxy',
      origin: 'https://ocx-website.pages.dev',
      paths: ['/team/'],
    };
    const next: Legacy = {
      entries: [
        ...committed.entries.map((e) =>
          e.id === 'legacy-ocx-dirs' ? { ...e, paths: e.paths.filter((p) => p !== '/team/') } : e,
        ),
        team,
      ],
    };
    const violations: string[] = [];
    const before = planned('dev');
    const { code, api } = await run({
      rules: before,
      legacy: next,
      afterRequest: neverUnrouted(before, planRules('dev', { legacy: next }), TEAM, violations),
    });
    expect(code).toBe(0);
    expect(violations).toEqual([]);
    const order = upserted(api);
    expect(order.indexOf('ocx:legacy-team')).toBeLessThan(order.indexOf('ocx:legacy-ocx-dirs'));
  });

  it('the invariant goes red on a delete-first sequence (the detector can fail)', async () => {
    const violations: string[] = [];
    const before = planned('dev');
    const fake = await fakeApi({
      key: KEY,
      pullZones: [{ Id: 1, Name: 'sh-ocx-dev', Hostnames: [], EdgeRules: before }],
      afterRequest: neverUnrouted(before, planRules('dev', { legacy: without('legacy-catalog') }), CATALOG, violations),
    });
    api = fake;
    const gone = before.find((r) => r.Description === 'ocx:legacy-catalog')!;
    await fetch(`${fake.url}/pullzone/1/edgerules/${gone.Guid}`, { method: 'DELETE', headers: { AccessKey: KEY } });
    expect(violations.some((v) => v.includes('/apps/catalog/x'))).toBe(true);
  });

  it('the invariant reads rules by OrderIndex, not array position, and ignores a disabled rule', () => {
    const [a, b] = planRules('dev').slice(0, 2) as [BunnyRule, BunnyRule];
    const shuffled: EdgeRule[] = [
      { ...b, Guid: 'b', OrderIndex: 1 },
      { ...a, Guid: 'a', OrderIndex: 0 },
      { ...a, Guid: 'z' },
    ];
    expect(evaluationOrder(shuffled).map((r) => r.Guid)).toEqual(['a', 'b', 'z']);
    const hit = (rules: EdgeRule[]) => matchProbe(edgeRules(rules), probe('/team/x')).origin;
    const [dirs] = planned('dev').filter((r) => r.Description === 'ocx:legacy-ocx-dirs');
    const files = planned('dev').find((r) => r.Description === 'ocx:legacy-ocx-files')!;
    const claimsTeam = { ...files, Triggers: dirs!.Triggers, Description: 'ocx:legacy-ocx-files' };
    expect(
      hit([
        { ...dirs!, OrderIndex: 5 },
        { ...claimsTeam, OrderIndex: 2 },
      ]),
    ).toBe('legacy-ocx-files');
    expect(
      hit([
        { ...dirs!, OrderIndex: 5 },
        { ...claimsTeam, OrderIndex: 2, Enabled: false },
      ]),
    ).toBe('legacy-ocx-dirs');
  });

  it('deletes a stale ocx:* rule the plan no longer names', async () => {
    const { code, api } = await run({
      rules: [...planned('dev'), { ...hand(0), Description: 'ocx:old', Guid: 'old-1' }],
    });
    expect(code).toBe(0);
    expect(names(live(api))).not.toContain('ocx:old');
    expect(writes(api).map((r) => r.method)).toEqual(['DELETE']);
  });
});

describe('only ocx:* rules are ever deleted', () => {
  it('leaves rules without the prefix, and rules without a Description, untouched', async () => {
    const mine = [hand(0), hand(1), { ...hand(2), Description: undefined }];
    const stale = { ...hand(3), Description: 'ocx:old', Guid: 'old-1' };
    const { code, api } = await run({ rules: [...planned('dev'), ...mine, stale] });
    expect(code).toBe(0);
    for (const r of mine) expect(live(api)).toContainEqual(r);
    const deleted = writes(api)
      .filter((r) => r.method === 'DELETE')
      .map((r) => r.path);
    expect(deleted).toEqual(['/pullzone/1/edgerules/old-1']);
  });
});

describe('an OriginStorage rule names a storage zone that exists', () => {
  it('refuses with no write when the zone is missing', async () => {
    api = await fakeApi({
      key: KEY,
      pullZones: [{ Id: 1, Name: 'sh-ocx-dev', Hostnames: [], EdgeRules: [] }],
      storageZones: [],
    });
    const { code, err } = await go(api, { legacy: without('legacy-catalog') });
    expect(code).toBe(1);
    expect(err).toContain('ocx:repo-ocx-sdk-python: no storage zone named sh-ocx-ocx-sdk-python');
    expect(writes(api)).toEqual([]);
  });
});

describe('RULE_LIMIT', () => {
  it('refuses with zero writes when live plus new planned rules exceed the limit, naming both counts', async () => {
    const { code, err, api } = await run({ rules: Array.from({ length: 45 }, (_, i) => hand(i)) });
    const fresh = planRules('dev').length;
    expect(code).toBe(1);
    expect(err).toContain('45 live rules');
    expect(err).toContain(`${fresh} new planned rules`);
    expect(err).toContain(`${45 + fresh}`);
    expect(writes(api)).toEqual([]);
    expect(live(api)).toHaveLength(45);
  });

  it('applies when the union is exactly the limit', async () => {
    const fresh = planRules('dev').length;
    const { code, api } = await run({ rules: Array.from({ length: RULE_LIMIT - fresh }, (_, i) => hand(i)) });
    expect(code).toBe(0);
    expect(live(api)).toHaveLength(RULE_LIMIT);
  });
});

describe('--dry-run', () => {
  it('sends GET requests only, prints the diff and leaves the zone as it was', async () => {
    const stale = { ...hand(0), Description: 'ocx:old', Guid: 'old-1' };
    const seed = [...planned('dev').slice(2), stale, hand(1)];
    const snapshot = structuredClone(seed);
    const { code, out, api } = await run({ rules: seed, argv: ['--zone', 'dev', '--dry-run'] });
    expect(code).toBe(0);
    expect(api.requests.map((r) => r.method)).toEqual(['GET', 'GET', 'GET']);
    expect(out).toContain('create ocx:assets-edge');
    expect(out).toContain('delete ocx:old');
    expect(out).not.toContain('hand-1');
    expect(live(api)).toEqual(snapshot);
  });

  it("reads a real-looking zone as equal: a null ActionParameter2 is '' and an absent OrderIndex is the position", async () => {
    const seed = planned('dev').map(({ OrderIndex: _, ...r }) => ({
      ...r,
      ActionParameter2: r.ActionParameter2 === '' ? null : r.ActionParameter2,
    }));
    expect(seed.some((r) => r.ActionParameter2 === null)).toBe(true);
    const { out, api } = await run({ rules: seed as unknown as EdgeRule[], argv: ['--zone', 'dev', '--dry-run'] });
    expect(out).toContain('no changes');
    expect(api.requests.map((r) => r.method)).toEqual(['GET', 'GET', 'GET']);
  });

  it('says so when there is nothing to change', async () => {
    const { out } = await run({ rules: planned('dev'), argv: ['--zone', 'dev', '--dry-run'] });
    expect(out).toContain('no changes');
  });
});

describe('read-back', () => {
  const tamper = (field: string, value: unknown) => (state: FakeApi['state'], req: Recorded) => {
    if (!req.path.endsWith('/addOrUpdate') || (req.body as { Description?: string }).Description !== 'ocx:noindex')
      return;
    state.pullZones[0]!.EdgeRules.find((r) => r.Description === 'ocx:noindex')![field] = value;
  };

  it('exits 1 naming the first differing field', async () => {
    const { code, err } = await run({ afterRequest: tamper('ActionParameter2', 'tampered') });
    expect(code).toBe(1);
    expect(err).toContain('read-back differs');
    expect(err).toContain('ocx:noindex');
    expect(err).toContain('ActionParameter2');
  });

  it('exits 1 naming an order difference', async () => {
    const { code, err } = await run({ afterRequest: tamper('OrderIndex', 99) });
    expect(code).toBe(1);
    expect(err).toMatch(/ocx:noindex: order is 99, planned \d+/);
  });

  it('exits 1 on a trigger pattern that the zone stored differently', async () => {
    const { code, err } = await run({
      afterRequest: tamper('Triggers', [
        { Type: 0, PatternMatchingType: 0, Parameter1: '', PatternMatches: ['https://x/*'] },
      ]),
    });
    expect(code).toBe(1);
    expect(err).toContain('field Triggers');
  });
});

describe('refusals and failures', () => {
  it.each([
    ['CI set', { CI: '1', BUNNY_API_KEY: KEY }],
    ['an empty key', { BUNNY_API_KEY: '' }],
    ['no key', {}],
  ])('%s: exit 1 before any request', async (_, env) => {
    const { code, err, api } = await run({ env });
    expect(code).toBe(1);
    expect(err).toMatch(/CI|BUNNY_API_KEY/);
    expect(api.requests).toEqual([]);
  });

  it('exit 1 when no pull zone has the name, after GETs only', async () => {
    const { code, err, api } = await run({ name: 'other' });
    expect(code).toBe(1);
    expect(err).toContain('sh-ocx-dev');
    expect(writes(api)).toEqual([]);
  });

  it.each([[[]], [['--zone', 'nope']], [['--bogus']]])('bad arguments %j exit 2 with no request', async (argv) => {
    const { code, api } = await run({ argv });
    expect(code).toBe(2);
    expect(api.requests).toEqual([]);
  });

  it('a failed write exits 1 without the key, without a retry and without a delete', async () => {
    api = await fakeApi({
      key: KEY,
      pullZones: [
        { Id: 1, Name: 'sh-ocx-dev', Hostnames: [], EdgeRules: [{ ...hand(0), Description: 'ocx:old', Guid: 'o' }] },
      ],
      storageZones: STORAGE_ZONES,
    });
    api.fail('POST', '/pullzone/1/edgerules', { status: 500, body: `boom ${KEY}` });
    const { code, err } = await go(api, {});
    expect(code).toBe(1);
    expect(err).toContain('500');
    expect(err).not.toContain(KEY);
    expect(writes(api).map((r) => r.method)).toEqual(['POST']);
  });
});
