// bunny:zone:apply against the fake API: create, reconcile, read-back refusals (an ignored, a missing and a
// mismatched field), Force SSL, and the key refusals.
import { afterEach, describe, expect, it } from 'vitest';
import { fakeApi, type FakeApi, type PullZone, type Recorded } from './fake-api.ts';
import recorded from './fixtures/p1-pullzone.json' with { type: 'json' };
import { main, zoneSettings } from './zone.mjs';

const KEY = 'fake-key-0123456789';
const ENV = { BUNNY_API_KEY: KEY };
const STORAGE = { Id: 7, Name: 'sh-ocx-website', Password: 'storage-password-xyz' };

// A hand-built zone; `recorded` below pins that every field it sets exists on a real one (the secret-named fields stand in).
/** A pull zone that already holds everything `zone:apply` asks for. */
const zoneOf = (name: string, zone: string, extra: Partial<PullZone> = {}): PullZone => ({
  Id: 1,
  Name: name,
  OriginType: 2,
  StorageZoneId: STORAGE.Id,
  ...zoneSettings(zone),
  ZoneSecurityKey: 'zone-secret-abc',
  Hostnames: [{ Id: 1, Value: `${name}.b-cdn.net`, ForceSSL: true, HasCertificate: true }],
  EdgeRules: [],
  ...extra,
});

let api: FakeApi | undefined;
afterEach(async () => {
  await api?.close();
  api = undefined;
});

interface Setup {
  zone?: string;
  pullZones?: PullZone[];
  storageZones?: (typeof STORAGE)[];
  env?: Record<string, string>;
  argv?: string[];
  afterRequest?: (state: FakeApi['state'], req: Recorded) => void;
}

async function run(setup: Setup = {}) {
  const fake = await fakeApi({
    key: KEY,
    pullZones: setup.pullZones ?? [],
    storageZones: setup.storageZones ?? [{ ...STORAGE }],
    ...(setup.afterRequest ? { afterRequest: setup.afterRequest } : {}),
  });
  api = fake;
  const out: string[] = [];
  const err: string[] = [];
  const code = await main({
    argv: setup.argv ?? ['--zone', setup.zone ?? 'dev'],
    env: setup.env ?? ENV,
    out: (t) => out.push(t),
    err: (t) => err.push(t),
    baseUrl: fake.url,
  });
  return { code, fake, out: out.join(''), err: err.join('') };
}

const writes = (fake: FakeApi) => fake.requests.filter((r) => r.method !== 'GET');
const live = (fake: FakeApi) => fake.state.pullZones[0]!;
/** A fake that accepts the write and then ignores one field, as the real API does. */
const ignoring = (field: string, to: unknown) => (state: FakeApi['state'], req: Recorded) => {
  if (req.method === 'POST' && /^\/pullzone\/\d+$/.test(req.path)) state.pullZones[0]![field] = to;
};

describe('zoneSettings', () => {
  it('pins the settings that must not drift', () => {
    expect(zoneSettings('dev')).toMatchObject({
      AddHostHeader: false,
      EnableRequestCoalescing: false,
      CacheControlMaxAgeOverride: 60,
      EnableOriginShield: true,
      UseStaleWhileUpdating: true,
      UseStaleWhileOffline: true,
      OriginRetries: 2,
    });
  });

  it('sets no per-IP rate limit on prod only', () => {
    expect(zoneSettings('prod')).toMatchObject({ RequestLimit: 0 });
    expect(zoneSettings('dev')).not.toHaveProperty('RequestLimit');
    expect(zoneSettings('preview:ocx')).not.toHaveProperty('RequestLimit');
  });

  it('sets no bandwidth cap', () => {
    expect(Object.keys(zoneSettings('prod')).filter((k) => /bandwidth/i.test(k))).toEqual([]);
  });
});

describe('create', () => {
  it('creates an absent zone over its storage zone with every setting, and turns Force SSL on', async () => {
    const { code, fake } = await run();
    expect(code).toBe(0);
    expect(live(fake)).toMatchObject({ Name: 'sh-ocx-dev', OriginType: 2, StorageZoneId: 7, ...zoneSettings('dev') });
    expect(live(fake).Hostnames.map((h) => [h.Value, h.ForceSSL])).toEqual([['sh-ocx-dev.b-cdn.net', true]]);
  });

  it('is idempotent: a second run sends no write', async () => {
    const { fake } = await run();
    const before = writes(fake).length;
    const out: string[] = [];
    const again = await main({
      argv: ['--zone', 'dev'],
      env: ENV,
      out: (t) => out.push(t),
      err: () => {},
      baseUrl: fake.url,
    });
    expect(again).toBe(0);
    expect(writes(fake)).toHaveLength(before);
  });

  it('creates a preview zone over the preview storage zone', async () => {
    const { code, fake } = await run({
      zone: 'preview:ocx',
      storageZones: [{ Id: 9, Name: 'sh-ocx-preview-ocx', Password: 'p' }],
    });
    expect(code).toBe(0);
    expect(live(fake)).toMatchObject({ Name: 'sh-ocx-preview-ocx', StorageZoneId: 9 });
  });

  it('refuses without the storage zone, naming onboard, and writes nothing', async () => {
    const { code, fake, err } = await run({ storageZones: [] });
    expect(code).toBe(1);
    expect(err).toMatch(/sh-ocx-website.*onboard/);
    expect(writes(fake)).toEqual([]);
  });
});

describe('reconcile an existing zone', () => {
  it('posts only the differing fields and reads back equal', async () => {
    const drifted = zoneOf('sh-ocx-dev', 'dev', {
      EnableRequestCoalescing: true,
      AddHostHeader: true,
      CacheControlMaxAgeOverride: 300,
    });
    const { code, fake } = await run({ pullZones: [drifted] });
    expect(code).toBe(0);
    expect(writes(fake).map((r) => [r.method, r.path, r.body])).toEqual([
      ['POST', '/pullzone/1', { CacheControlMaxAgeOverride: 60, EnableRequestCoalescing: false, AddHostHeader: false }],
    ]);
    expect(live(fake)).toMatchObject(zoneSettings('dev'));
  });

  it('sends no write for a zone that already matches', async () => {
    const { code, fake } = await run({ pullZones: [zoneOf('sh-ocx-dev', 'dev')] });
    expect(code).toBe(0);
    expect(writes(fake)).toEqual([]);
  });

  it('adds no hostname', async () => {
    const { fake } = await run({ zone: 'prod', pullZones: [zoneOf('sh-ocx', 'prod')] });
    expect(fake.requests.some((r) => r.path.includes('addHostname'))).toBe(false);
  });
});

describe('read-back refuses, loudly', () => {
  it('a field the API accepted and ignored: exit 1 naming the field', async () => {
    const { code, err } = await run({
      pullZones: [zoneOf('sh-ocx-dev', 'dev', { OriginRetryDelay: 5 })],
      afterRequest: ignoring('OriginRetryDelay', 5),
    });
    expect(code).toBe(1);
    expect(err).toContain('OriginRetryDelay: is 5, wanted 1');
  });

  it.each(['AddHostHeader', 'EnableRequestCoalescing'])(
    'a planted %s mismatch: exit 1 naming the field',
    async (field) => {
      const wrong = !zoneSettings('dev')[field];
      const { code, err, fake } = await run({
        pullZones: [zoneOf('sh-ocx-dev', 'dev', { [field]: wrong })],
        afterRequest: ignoring(field, wrong),
      });
      expect(code).toBe(1);
      expect(err).toContain(`${field}: is ${String(wrong)}, wanted ${String(!wrong)}`);
      expect(writes(fake)).toHaveLength(1);
    },
  );

  it('a requested field the GET does not carry: exit 1 before any write', async () => {
    const zone = zoneOf('sh-ocx-dev', 'dev');
    delete zone.EnableSafeHop;
    const { code, err, fake } = await run({ pullZones: [zone] });
    expect(code).toBe(1);
    expect(err).toContain('no such field(s): EnableSafeHop');
    expect(writes(fake)).toEqual([]);
  });

  it('a field that vanishes after the write: exit 1 naming it', async () => {
    const { code, err } = await run({
      pullZones: [zoneOf('sh-ocx-dev', 'dev', { OriginRetries: 0 })],
      afterRequest: (state, req) => {
        if (req.method === 'POST') delete state.pullZones[0]!.OriginRetries;
      },
    });
    expect(code).toBe(1);
    expect(err).toContain('OriginRetries: missing from the pull zone response');
  });
});

describe('hostnames', () => {
  const prod = (hosts: Record<string, unknown>[]) =>
    zoneOf('sh-ocx', 'prod', { Hostnames: hosts as PullZone['Hostnames'] });
  const sys = { Id: 1, Value: 'sh-ocx.b-cdn.net', ForceSSL: true, HasCertificate: true };

  it('turns Force SSL on for a hostname that has a certificate', async () => {
    const { code, fake } = await run({
      zone: 'prod',
      pullZones: [prod([sys, { Id: 2, Value: 'ocx.sh', ForceSSL: false, HasCertificate: true }])],
    });
    expect(code).toBe(0);
    expect(writes(fake).map((r) => [r.path, r.body])).toEqual([
      ['/pullzone/1/setForceSSL', { Hostname: 'ocx.sh', ForceSSL: true }],
    ]);
    expect(live(fake).Hostnames.every((h) => h.ForceSSL === true)).toBe(true);
  });

  it('refuses a hostname without a certificate and does not try to force SSL on it', async () => {
    const { code, err, fake } = await run({
      zone: 'prod',
      pullZones: [prod([sys, { Id: 2, Value: 'ocx.sh', ForceSSL: false, HasCertificate: false }])],
    });
    expect(code).toBe(1);
    expect(err).toContain('ocx.sh: has no certificate');
    expect(writes(fake)).toEqual([]);
  });

  it('notes a spec host the owner has not added yet, without failing', async () => {
    const { code, out } = await run({ zone: 'prod', pullZones: [prod([sys])] });
    expect(code).toBe(0);
    expect(out).toContain('ocx.sh: not on the zone yet');
    expect(out).toContain('next.ocx.sh: not on the zone yet');
  });

  it('prints PENDING for a prod zone without ocx.sh, exit 0; a zone that has it prints none; dev never does', async () => {
    const pending = 'PENDING: ocx.sh hostname not on the zone (OG-P)\n';
    const without = await run({ zone: 'prod', pullZones: [prod([sys])] });
    expect([without.code, without.out.split('\n').filter(Boolean).at(-2)]).toEqual([0, pending.trim()]);
    const withIt = await run({
      zone: 'prod',
      pullZones: [prod([sys, { Id: 2, Value: 'ocx.sh', ForceSSL: true, HasCertificate: true }])],
    });
    expect(withIt.out).not.toContain('PENDING');
    expect((await run()).out).not.toContain('PENDING');
  });
});

describe('arguments and key refusals', () => {
  it.each([[['--zone', 'staging']], [[]], [['--zone', 'dev', '--bogus']]])(
    'exits 2 on %j with zero requests',
    async (argv) => {
      const { code, fake } = await run({ argv });
      expect(code).toBe(2);
      expect(fake.requests).toEqual([]);
    },
  );

  it.each([
    ['CI set', { BUNNY_API_KEY: KEY, CI: '1' }],
    ['empty key', { BUNNY_API_KEY: '' }],
    ['no key', {}],
  ])('refuses with %s: exit 1, zero requests', async (_, env) => {
    const { code, fake, err } = await run({ env });
    expect(code).toBe(1);
    expect(err).toMatch(/refusing/);
    expect(fake.requests).toEqual([]);
  });

  it('never prints the account key, a zone secret or a storage password', async () => {
    const wrongKey = await run({ env: { BUNNY_API_KEY: 'wrong-key-9876543210' } });
    expect(wrongKey.code).toBe(1);
    expect(wrongKey.err).not.toContain('wrong-key-9876543210');
    await api?.close();
    const ok = await run({
      pullZones: [zoneOf('sh-ocx-dev', 'dev', { OriginRetryDelay: 5 })],
      afterRequest: ignoring('OriginRetryDelay', 5),
    });
    for (const text of [ok.out, ok.err])
      for (const secret of [KEY, 'zone-secret-abc', STORAGE.Password]) expect(text).not.toContain(secret);
  });
});

describe('against the recorded pull zone (M0, sh-ocx-dev)', () => {
  it('carries every field zone:apply writes, and the storage origin it reads back', () => {
    for (const zone of ['dev', 'prod', 'preview:ocx'])
      expect(Object.keys(recorded)).toEqual(expect.arrayContaining(Object.keys(zoneSettings(zone))));
    expect(recorded).toMatchObject({
      OriginType: 2,
      AddHostHeader: false,
      StorageZoneId: expect.any(Number) as number,
    });
  });
});
