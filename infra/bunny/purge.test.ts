// bunny:purge against the fake API: a prefix purge on every hostname of the zone, a whole-zone purge without a
// path, bad paths and CI or an empty key before any request, and the key never echoed.
import { afterEach, describe, expect, it } from 'vitest';
import { fakeApi, type FakeApi } from './fake-api.ts';
import { main } from './purge.mjs';

const KEY = 'fake-account-key-0123456789';

// ponytail: hand-written to the documented pull-zone list shape (`Id`, `Name`, `Hostnames[].Value`), not a
// recorded response; re-check against the owner's recorded responses (infra/bunny/README.md, "Record a response").
const zone = (Id: number, Name: string, hosts: string[]) => ({
  Id,
  Name,
  Hostnames: hosts.map((Value, i) => ({ Id: Id * 10 + i, Value })),
  EdgeRules: [],
});

let api: FakeApi | undefined;
afterEach(async () => {
  await api?.close();
  api = undefined;
});

async function run(argv: string[], env: Record<string, string> = { BUNNY_API_KEY: KEY }, withZones = true) {
  api = await fakeApi({
    key: KEY,
    pullZones: withZones
      ? [zone(1, 'sh-ocx-dev', ['sh-ocx-dev.b-cdn.net']), zone(2, 'sh-ocx', ['ocx.sh', 'sh-ocx.b-cdn.net'])]
      : [],
  });
  const out: string[] = [];
  const err: string[] = [];
  const code = await main({ argv, env, out: (t) => out.push(t), err: (t) => err.push(t), baseUrl: api.url });
  return { code, out: out.join(''), err: err.join(''), requests: api.requests };
}

const posts = (r: Awaited<ReturnType<typeof run>>) => r.requests.filter((q) => q.method === 'POST').map((q) => q.path);

describe('bunny:purge', () => {
  it('purges a path as a prefix on the zone host', async () => {
    const r = await run(['--zone', 'dev', '/docs/']);
    expect(r.code).toBe(0);
    expect(posts(r)).toEqual(['/purge?url=https%3A%2F%2Fsh-ocx-dev.b-cdn.net%2Fdocs%2F*']);
  });

  it('purges every hostname the zone serves', async () => {
    const r = await run(['--zone', 'prod', '/_astro/']);
    expect(r.code).toBe(0);
    expect(posts(r)).toEqual([
      '/purge?url=https%3A%2F%2Focx.sh%2F_astro%2F*',
      '/purge?url=https%3A%2F%2Fsh-ocx.b-cdn.net%2F_astro%2F*',
    ]);
  });

  it('purges the whole zone when no path is given', async () => {
    const r = await run(['--zone', 'dev']);
    expect(r.code).toBe(0);
    expect(posts(r)).toEqual(['/pullzone/1/purgeCache']);
  });

  it.each([['docs/'], ['/a b'], ['/a?x=1'], ['/a#x'], ['/../x'], ['//evil.test/'], ['\\x']])(
    'refuses the path %j before any request',
    async (path) => {
      const r = await run(['--zone', 'dev', path]);
      expect(r.code).toBe(2);
      expect(r.requests).toEqual([]);
    },
  );

  it('exits 2 without a valid zone or with two paths, before any request', async () => {
    for (const argv of [[], ['--zone', 'staging'], ['--zone', 'dev', '/a/', '/b/']]) {
      const r = await run(argv);
      expect(r.code).toBe(2);
      expect(r.requests).toEqual([]);
    }
  });

  it('refuses under CI and with an empty key, with zero requests', async () => {
    for (const env of [{ CI: '1', BUNNY_API_KEY: KEY }, { BUNNY_API_KEY: '' }, {}]) {
      const r = await run(['--zone', 'dev', '/docs/'], env);
      expect(r.code).toBe(1);
      expect(r.requests).toEqual([]);
    }
  });

  it('exits 1 without a purge when the pull zone does not exist', async () => {
    const r = await run(['--zone', 'dev', '/docs/'], { BUNNY_API_KEY: KEY }, false);
    expect(r.code).toBe(1);
    expect(r.err).toContain('no pull zone named sh-ocx-dev');
    expect(posts({ ...r })).toEqual([]);
  });

  it('exits 1 on a wrong key and never prints it', async () => {
    const r = await run(['--zone', 'dev', '/docs/'], { BUNNY_API_KEY: 'wrong-key-987654321' });
    expect(r.code).toBe(1);
    expect(r.err).toContain('401');
    expect(r.out + r.err).not.toContain('wrong-key-987654321');
  });
});
