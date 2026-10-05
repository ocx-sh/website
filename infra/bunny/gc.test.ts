// bunny:gc against the fake API and an in-memory storage zone: the age conditions, a young or missing index skips
// its claim, HTML and error pages and other claims' files are never deleted, `--dry-run` reads only, and the
// account key and zone password never reach the output.
import { afterEach, describe, expect, it } from 'vitest';
import { fakeApi, type FakeApi } from './fake-api.ts';
import { main } from './gc.mjs';

const KEY = 'fake-account-key-0123456789';
const PASSWORD = 'storage-password-xyz';
const ZONE = 'sh-ocx-website';
const NOW = Date.parse('2026-10-04T12:00:00Z');
const DAY = 86_400_000;
const HOUR = 3_600_000;

const iso = (ms: number) => new Date(ms).toISOString().replace('Z', '');
/** A `LastChanged` that is `age` milliseconds before NOW. */
const ago = (age: number) => iso(NOW - age);

/**
 * An in-memory storage zone speaking the list and DELETE calls of storage.mjs.
 * ponytail: hand-written to the documented list shape (`Path`, `ObjectName`, `IsDirectory`, `LastChanged` as UTC
 * without a zone suffix), not a recorded listing; re-check against the owner's recorded responses (infra/bunny/README.md, "Record a response").
 */
function storage(files: Record<string, string>, opts: { failDelete?: boolean; zone?: string } = {}) {
  const zone = opts.zone ?? ZONE;
  const live = new Map(Object.entries(files));
  const calls: { method: string; url: string; accessKey: string }[] = [];
  const fetch = (url: string, init: RequestInit = {}): Promise<Response> => {
    const method = init.method ?? 'GET';
    calls.push({ method, url, accessKey: String((init.headers as Record<string, string>).AccessKey) });
    const rel = decodeURIComponent(new URL(url).pathname.slice(`/${zone}/`.length));
    if (method === 'DELETE') {
      if (opts.failDelete) return Promise.resolve(new Response(`denied for ${PASSWORD}`, { status: 500 }));
      return Promise.resolve(new Response('', { status: live.delete(rel) ? 200 : 404 }));
    }
    // a directory listing: the files and subdirectories directly under `rel`
    const entries = new Map<string, unknown>();
    for (const [path, LastChanged] of live) {
      if (!path.startsWith(rel)) continue;
      const [name = '', ...rest] = path.slice(rel.length).split('/');
      entries.set(name, { Path: `/${zone}/${rel}`, ObjectName: name, IsDirectory: rest.length > 0, LastChanged });
    }
    return Promise.resolve(new Response(JSON.stringify([...entries.values()]), { status: 200 }));
  };
  return { fetch, calls, live };
}

let api: FakeApi | undefined;
afterEach(async () => {
  await api?.close();
  api = undefined;
});

async function run(
  files: Record<string, string>,
  argv: string[],
  opts: { env?: Record<string, string>; failDelete?: boolean } = {},
) {
  api = await fakeApi({ key: KEY, storageZones: [{ Id: 7, Name: ZONE, Password: PASSWORD }] });
  const store = storage(files, opts);
  const out: string[] = [];
  const err: string[] = [];
  const code = await main({
    argv,
    env: opts.env ?? { BUNNY_API_KEY: KEY },
    out: (t) => out.push(t),
    err: (t) => err.push(t),
    baseUrl: api.url,
    storageFetch: store.fetch,
    now: NOW,
  });
  return { code, out: out.join(''), err: err.join(''), api: api.requests, store };
}

/** The root site as a deploy at NOW - 2 d left it, plus the files the cases below vary. */
const DEPLOYED = ago(2 * DAY);
const site = (extra: Record<string, string> = {}) => ({
  'index.html': DEPLOYED,
  '_astro/new.abc.js': DEPLOYED,
  ...extra,
});
const ARGV = ['--zone', 'dev', '--older-than', '30d'];

describe('bunny:gc conditions', () => {
  it('deletes a non-HTML file older than --older-than and more than 1 h older than the live index.html', async () => {
    const r = await run(
      site({ '_astro/old.abc.js': ago(40 * DAY), 'pagefind/fragment/x.pf_fragment': ago(31 * DAY) }),
      ARGV,
    );
    expect(r.code).toBe(0);
    expect([...r.store.live.keys()].sort()).toEqual(['_astro/new.abc.js', 'index.html']);
    expect(r.out).toContain('delete _astro/old.abc.js');
  });

  it('keeps a file younger than --older-than (condition a)', async () => {
    const r = await run(site({ '_astro/recent.js': ago(10 * DAY) }), ARGV);
    expect(r.store.live.has('_astro/recent.js')).toBe(true);
  });

  it('keeps a file within 1 h of the live index.html even when it is old enough (condition b)', async () => {
    // the index was deployed 40 d ago, so the file is older than --older-than but only 30 min older than the index
    const r = await run(
      {
        'index.html': ago(40 * DAY),
        '_astro/same.js': ago(40 * DAY + HOUR / 2),
        '_astro/gone.js': ago(40 * DAY + 2 * HOUR),
      },
      ARGV,
    );
    expect([...r.store.live.keys()].sort()).toEqual(['_astro/same.js', 'index.html']);
  });

  it('skips the whole claim when its index.html is younger than 1 h', async () => {
    const r = await run({ 'index.html': ago(HOUR / 2), '_astro/old.js': ago(90 * DAY) }, ARGV);
    expect(r.code).toBe(0);
    expect(r.store.live.has('_astro/old.js')).toBe(true);
    expect(r.out).toContain('skip /: index.html is younger than 1 h');
  });

  it('skips a claim without an index.html', async () => {
    const r = await run({ '_astro/old.js': ago(90 * DAY) }, ARGV);
    expect(r.store.live.has('_astro/old.js')).toBe(true);
    expect(r.out).toContain('skip /: no live index.html');
  });

  it('never deletes HTML, the error page directory, or a file under no claim of this zone', async () => {
    const r = await run(
      site({
        'old/page.html': ago(90 * DAY),
        'OLD.HTML': ago(90 * DAY),
        'bunnycdn_errors/404.html': ago(90 * DAY),
        'bunnycdn_errors/asset.png': ago(90 * DAY),
        // /docs/ is the ocx repo's claim, not this zone's
        'docs/_astro/theirs.js': ago(90 * DAY),
      }),
      ARGV,
    );
    expect(r.code).toBe(0);
    expect([...r.store.live.keys()].sort()).toEqual(
      [
        'OLD.HTML',
        '_astro/new.abc.js',
        'bunnycdn_errors/404.html',
        'bunnycdn_errors/asset.png',
        'docs/_astro/theirs.js',
        'index.html',
        'old/page.html',
      ].sort(),
    );
  });

  it('judges a hub claim against its own index.html, not the root one', async () => {
    const r = await run(
      site({
        'integrations/index.html': ago(HOUR / 2),
        'integrations/old.js': ago(90 * DAY),
        'apps/index.html': DEPLOYED,
        'apps/old.js': ago(90 * DAY),
        '_astro/old.js': ago(90 * DAY),
      }),
      ARGV,
    );
    expect(r.code).toBe(0);
    expect(r.store.live.has('integrations/old.js')).toBe(true);
    expect(r.store.live.has('apps/old.js')).toBe(false);
    expect(r.store.live.has('_astro/old.js')).toBe(false);
  });

  it('a preview zone is one claim at /', async () => {
    api = await fakeApi({ key: KEY, storageZones: [{ Id: 8, Name: 'sh-ocx-preview-ocx', Password: PASSWORD }] });
    const store = storage(site({ 'x.js': ago(90 * DAY) }), { zone: 'sh-ocx-preview-ocx' });
    const code = await main({
      argv: ['--zone', 'preview:ocx', '--older-than', '30d'],
      env: { BUNNY_API_KEY: KEY },
      out: () => {},
      err: () => {},
      baseUrl: api.url,
      storageFetch: store.fetch,
      now: NOW,
    });
    expect(code).toBe(0);
    expect(store.live.has('x.js')).toBe(false);
  });
});

describe('bunny:gc --dry-run', () => {
  it('lists what it would delete and sends only GET to the storage zone and the API', async () => {
    const r = await run(site({ '_astro/old.js': ago(90 * DAY) }), [...ARGV, '--dry-run']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('would delete _astro/old.js');
    expect(r.out).toContain('1 of 3 files would be deleted');
    expect(r.store.live.has('_astro/old.js')).toBe(true);
    expect(r.store.calls.every((c) => c.method === 'GET')).toBe(true);
    expect(r.api.every((q) => q.method === 'GET')).toBe(true);
  });
});

describe('bunny:gc refusals', () => {
  it('refuses under CI and with an empty key before any request', async () => {
    for (const env of [{ CI: '1', BUNNY_API_KEY: KEY }, { BUNNY_API_KEY: '' }]) {
      const r = await run(site({ '_astro/old.js': ago(90 * DAY) }), ARGV, { env });
      expect(r.code).toBe(1);
      expect(r.api).toEqual([]);
      expect(r.store.calls).toEqual([]);
    }
  });

  it.each([
    [[]],
    [['--zone', 'dev']],
    [['--zone', 'dev', '--older-than', '30']],
    [['--zone', 'dev', '--older-than', '0d']],
    [['--older-than', '30d']],
  ])('exits 2 on the arguments %j before any request', async (argv) => {
    const r = await run(site(), argv);
    expect(r.code).toBe(2);
    expect(r.api).toEqual([]);
    expect(r.store.calls).toEqual([]);
  });

  it('refuses a zone without a storage zone and deletes nothing', async () => {
    api = await fakeApi({ key: KEY });
    const store = storage(site());
    const err: string[] = [];
    const code = await main({
      argv: ARGV,
      env: { BUNNY_API_KEY: KEY },
      out: () => {},
      err: (t) => err.push(t),
      baseUrl: api.url,
      storageFetch: store.fetch,
      now: NOW,
    });
    expect(code).toBe(1);
    expect(err.join('')).toContain('run bunny:onboard first');
    expect(store.calls).toEqual([]);
  });

  it('deletes nothing when a date cannot be read', async () => {
    const r = await run(site({ '_astro/odd.js': 'yesterday-ish', '_astro/old.js': ago(90 * DAY) }), ARGV);
    expect(r.code).toBe(1);
    expect(r.err).toContain('not a date');
    expect([...r.store.calls].every((c) => c.method === 'GET')).toBe(true);
  });

  it('masks the zone password and never prints the account key when a delete fails', async () => {
    const r = await run(site({ '_astro/old.js': ago(90 * DAY) }), ARGV, { failDelete: true });
    expect(r.code).toBe(1);
    expect(r.err).toContain('***');
    for (const secret of [PASSWORD, KEY]) expect(r.out + r.err).not.toContain(secret);
  });

  it('sends the zone password, not the account key, to the storage endpoint', async () => {
    const r = await run(site(), ARGV);
    expect(r.store.calls.length).toBeGreaterThan(0);
    expect(r.store.calls.every((c) => c.accessKey === PASSWORD)).toBe(true);
    expect(r.api.every((q) => q.headers.accesskey === KEY)).toBe(true);
  });
});
