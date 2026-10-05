// redact() empties every secret-named field of a recorded Bunny response; the client refuses CI,
// keeps the key out of every error and log line, and retries only GET.
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { BunnyApiError, EXIT, RefusalError, createClient, findByName, redact } from './api.mjs';
import { fakeApi, type FakeApi } from './fake-api.ts';

const zone = {
  Id: 7,
  Name: 'sh-ocx',
  Password: 'pw-1',
  ReadOnlyPassword: 'pw-2',
  Hostnames: [{ Value: 'ocx.sh', CertificateKey: 'ck' }],
  Edge: { AccessKey: 'ak', ZoneSecurityKey: 'zsk', AWSSigningKey: 'a', AWSSigningSecret: 'b', LogForwardingToken: 't' },
  Keys: ['kept'],
  KeyName: 'kept-too',
};

describe('findByName', () => {
  const items = [
    { Name: 'a', Id: 1 },
    { Name: 'b', Id: 2 },
  ];

  it('finds an entry in an array and in a paged { Items } body', () => {
    expect(findByName(items, 'b')).toEqual({ Name: 'b', Id: 2 });
    expect(findByName({ Items: items }, 'a')).toEqual({ Name: 'a', Id: 1 });
    expect(findByName(items, 'c')).toBeUndefined();
  });

  it.each([[null], [{}], ['x']])('throws on a body without an entry list (%j)', (body) => {
    expect(() => findByName(body, 'a')).toThrow(/no items/);
  });

  it('EXIT is the one status table', () => {
    expect(EXIT).toEqual({ ok: 0, refused: 1, usage: 2 });
  });
});

describe('redact', () => {
  it('empties every field whose name ends in key, secret, password or token, at any depth', () => {
    const out = redact(zone) as typeof zone;
    expect(out.Password).toBe('');
    expect(out.ReadOnlyPassword).toBe('');
    expect(out.Hostnames[0]!.CertificateKey).toBe('');
    expect(out.Edge).toEqual({
      AccessKey: '',
      ZoneSecurityKey: '',
      AWSSigningKey: '',
      AWSSigningSecret: '',
      LogForwardingToken: '',
    });
  });

  it('keeps every other field and does not mutate the input', () => {
    const out = redact(zone) as typeof zone;
    expect(out.Id).toBe(7);
    expect(out.Name).toBe('sh-ocx');
    expect(out.Hostnames[0]!.Value).toBe('ocx.sh');
    expect(out.Keys).toEqual(['kept']);
    expect(out.KeyName).toBe('kept-too');
    expect(zone.Password).toBe('pw-1');
  });

  it('matches the field name case-insensitively', () => {
    expect(redact({ accesskey: 'x', APITOKEN: 'y' })).toEqual({ accesskey: '', APITOKEN: '' });
  });
});

describe('redact edge cases', () => {
  it('walks arrays of objects, top-level arrays and tolerates primitives and null', () => {
    expect(redact([{ Token: 't', Id: 1 }, null, 'x', 3])).toEqual([{ Token: '', Id: 1 }, null, 'x', 3]);
    expect(redact(null)).toBeNull();
    expect(redact('AccessKey')).toBe('AccessKey');
  });

  it('empties a secret-named field whatever its value type', () => {
    expect(redact({ ApiKey: { nested: 'x' }, Secret: 5, Password: null, Other: { Key: ['a'] } })).toEqual({
      ApiKey: '',
      Secret: '',
      Password: '',
      Other: { Key: '' },
    });
  });
});

const KEY = 'fake-key-0123456789';
const env = { BUNNY_API_KEY: KEY };

let fake: FakeApi | undefined;
afterEach(async () => {
  await fake?.close();
  fake = undefined;
});

/** A client on a fresh fake; waits are recorded, not slept. */
async function setup(opts: Parameters<typeof fakeApi>[0] = { key: KEY }, timeoutMs?: number) {
  fake = await fakeApi(opts);
  const waits: number[] = [];
  const logs: string[] = [];
  const client = createClient(env, {
    baseUrl: fake.url,
    sleep: (ms) => Promise.resolve(void waits.push(ms)),
    log: (line) => logs.push(line),
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  });
  return { fake, client, waits, logs };
}

/** The error a promise rejects with. */
async function failure(p: Promise<unknown>): Promise<BunnyApiError> {
  try {
    await p;
  } catch (err) {
    return err as BunnyApiError;
  }
  throw new Error('expected a rejection');
}

describe('refusal', () => {
  it('refuses with exit code 1 when CI is set, before any request', async () => {
    fake = await fakeApi({ key: 'fake' });
    expect(() => createClient({ CI: '1', BUNNY_API_KEY: 'fake' }, { baseUrl: fake!.url })).toThrow(RefusalError);
    try {
      createClient({ CI: 'true', BUNNY_API_KEY: 'fake' }, { baseUrl: fake.url });
    } catch (err) {
      expect((err as RefusalError).exitCode).toBe(1);
    }
    expect(fake.requests).toHaveLength(0);
  });

  it.each([{}, { BUNNY_API_KEY: '' }, { BUNNY_API_KEY: '  ' }])('refuses an empty key %j', async (e) => {
    fake = await fakeApi({ key: 'fake' });
    expect(() => createClient(e, { baseUrl: fake!.url })).toThrow(RefusalError);
    expect(fake.requests).toHaveLength(0);
  });

  it('reads only the env it is given, never process.env', async () => {
    const saved = { CI: process.env.CI, key: process.env.BUNNY_API_KEY };
    process.env.CI = 'true';
    delete process.env.BUNNY_API_KEY;
    try {
      const { client } = await setup();
      await expect(client.get('/pullzone')).resolves.toEqual([]);
    } finally {
      if (saved.CI === undefined) delete process.env.CI;
      else process.env.CI = saved.CI;
      if (saved.key !== undefined) process.env.BUNNY_API_KEY = saved.key;
    }
  });

  // The child skips this test (guard variable), so the recursion is one level deep.
  it.skipIf(process.env.BUNNY_API_TEST_CHILD === '1')(
    'the suite passes with CI=true in the outer environment',
    () => {
      const run = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', 'infra/bunny/api.test.ts'], {
        env: { ...process.env, CI: 'true', BUNNY_API_TEST_CHILD: '1' },
        encoding: 'utf8',
        timeout: 120_000,
      });
      expect(run.status, run.stdout + run.stderr).toBe(0);
    },
    130_000,
  );
});

describe('requests', () => {
  it('sends AccessKey and JSON bodies', async () => {
    const { fake, client } = await setup({ key: KEY });
    await client.post('/pullzone', { Name: 'sh-ocx' });
    const [req] = fake.requests;
    expect(req!.headers.accesskey).toBe(KEY);
    expect(req!.headers['content-type']).toBe('application/json');
    expect(req!.body).toEqual({ Name: 'sh-ocx' });
    expect(fake.state.pullZones[0]!.Name).toBe('sh-ocx');
  });

  it('returns null for an empty body', async () => {
    const { fake, client } = await setup({ key: KEY, pullZones: [{ Id: 1, Name: 'z', Hostnames: [], EdgeRules: [] }] });
    await expect(client.post('/pullzone/1/addHostname', { Hostname: 'ocx.sh' })).resolves.toBeNull();
    expect(fake.state.pullZones[0]!.Hostnames[0]!.Value).toBe('ocx.sh');
  });

  it('rejects a path that would leave the API host, with no request', async () => {
    const { fake, client } = await setup();
    await expect(client.get('//evil.test/x')).rejects.toThrow(/invalid path/);
    await expect(client.get('pullzone')).rejects.toThrow(/invalid path/);
    expect(fake.requests).toHaveLength(0);
  });
});

describe('secrets never reach an error or a log line', () => {
  const clean = (texts: string[]) => {
    for (const t of texts) {
      expect(t).not.toContain(KEY);
      expect(t).not.toContain(KEY.slice(0, 10));
    }
  };

  it('401: the fake echoes the offered key in its body', async () => {
    fake = await fakeApi({ key: 'another-key' });
    const logs: string[] = [];
    const client = createClient(env, { baseUrl: fake.url, log: (l) => logs.push(l) });
    const err = await failure(client.get('/pullzone'));
    expect(err.status).toBe(401);
    expect(fake.requests[0]!.headers.accesskey).toBe(KEY);
    expect(err.message).toContain('***');
    clean([err.message, String(err.stack), ...logs]);
    expect(fake.requests).toHaveLength(1);
  });

  it('500: a body that quotes the key, on a GET that exhausts its retries', async () => {
    const { fake, client, logs } = await setup();
    fake.fail('GET', '/pullzone', ...Array.from({ length: 3 }, () => ({ status: 500, body: `boom AccessKey=${KEY}` })));
    const err = await failure(client.get('/pullzone'));
    expect(err.status).toBe(500);
    expect(err.message).toContain('***');
    clean([err.message, String(err.stack), ...logs]);
  });

  it('500 on a POST, with the key URL-encoded in the body', async () => {
    const { fake, client, logs } = await setup();
    fake.fail('POST', '/pullzone', { status: 500, body: encodeURIComponent(KEY) });
    const err = await failure(client.post('/pullzone', {}));
    clean([err.message, ...logs]);
  });

  it('timeout: a hung request ends with a deadline error', async () => {
    const { fake, client, logs } = await setup({ key: KEY }, 50);
    fake.fail('POST', '/pullzone', { hang: true });
    const err = await failure(client.post('/pullzone', {}));
    expect(err.status).toBe(0);
    expect(err.message).toMatch(/timeout|abort/i);
    clean([err.message, String(err.stack), ...logs]);
  });

  it('a network error whose own message carries the key', async () => {
    const logs: string[] = [];
    const client = createClient(env, {
      fetch: () => Promise.reject(new Error(`connect failed with AccessKey: ${KEY}`)),
      sleep: () => Promise.resolve(),
      log: (l) => logs.push(l),
    });
    const err = await failure(client.get('/pullzone'));
    expect(err.message).toContain('AccessKey: ***');
    expect(err.cause).toBeUndefined();
    clean([err.message, String(err.stack), ...logs]);
  });
});

describe('retries (GET only)', () => {
  it('retries a GET on 500 and returns the first success', async () => {
    const { fake, client, waits } = await setup();
    fake.fail('GET', '/pullzone', { status: 500 }, { status: 503 });
    await expect(client.get('/pullzone')).resolves.toEqual([]);
    expect(fake.requests).toHaveLength(3);
    expect(waits).toHaveLength(2);
  });

  it('gives up after 3 attempts', async () => {
    const { fake, client } = await setup();
    fake.fail('GET', '/pullzone', { status: 500 }, { status: 500 }, { status: 500 }, { status: 500 });
    expect((await failure(client.get('/pullzone'))).status).toBe(500);
    expect(fake.requests).toHaveLength(3);
  });

  it('honours Retry-After seconds and an HTTP date, capped', async () => {
    const { fake, client, waits } = await setup();
    fake.fail('GET', '/pullzone', { status: 429, headers: { 'retry-after': '2' } });
    await client.get('/pullzone');
    expect(waits).toEqual([2000]);
    waits.length = 0;
    fake.fail('GET', '/storagezone', {
      status: 503,
      headers: { 'retry-after': new Date(Date.now() - 5000).toUTCString() },
    });
    await client.get('/storagezone');
    expect(waits).toEqual([0]);
  });

  it('caps an enormous Retry-After at 60 seconds', async () => {
    const { fake, client, waits } = await setup();
    fake.fail('GET', '/pullzone', { status: 429, headers: { 'retry-after': '99999' } });
    await client.get('/pullzone');
    expect(waits).toEqual([60_000]);
  });

  it('retries a network error on GET', async () => {
    let calls = 0;
    const client = createClient(env, {
      fetch: () => (++calls < 3 ? Promise.reject(new TypeError('fetch failed')) : Promise.resolve(new Response('[]'))),
      sleep: () => Promise.resolve(),
    });
    await expect(client.get('/pullzone')).resolves.toEqual([]);
    expect(calls).toBe(3);
  });

  it.each([401, 404, 400])('does not retry a GET on %i', async (status) => {
    const { fake, client } = await setup();
    fake.fail('GET', '/pullzone', { status });
    expect((await failure(client.get('/pullzone'))).status).toBe(status);
    expect(fake.requests).toHaveLength(1);
  });

  it.each([
    ['POST', 500],
    ['POST', 429],
    ['DELETE', 503],
  ])('never retries a %s on %i', async (method, status) => {
    const { fake, client } = await setup();
    fake.fail(method, '/pullzone', { status });
    expect((await failure(client.request(method, '/pullzone/1/edgerules/x'))).status).toBe(status);
    expect(fake.requests).toHaveLength(1);
  });

  it('never retries a POST network error', async () => {
    let calls = 0;
    const client = createClient(env, {
      fetch: () => {
        calls++;
        return Promise.reject(new TypeError('fetch failed'));
      },
      sleep: () => Promise.resolve(),
    });
    await failure(client.post('/pullzone', {}));
    expect(calls).toBe(1);
  });
});

describe('fake API', () => {
  it('upserts and deletes edge rules and records the sequence', async () => {
    const { fake, client } = await setup({ key: KEY, pullZones: [{ Id: 1, Name: 'z', Hostnames: [], EdgeRules: [] }] });
    await client.post('/pullzone/1/edgerules/addOrUpdate', { Description: 'ocx:a' });
    const guid = fake.state.pullZones[0]!.EdgeRules[0]!.Guid;
    await client.post('/pullzone/1/edgerules/addOrUpdate', { Guid: guid, Description: 'ocx:a2' });
    expect(fake.state.pullZones[0]!.EdgeRules).toHaveLength(1);
    expect(fake.state.pullZones[0]!.EdgeRules[0]!.Description).toBe('ocx:a2');
    await client.delete(`/pullzone/1/edgerules/${guid}`);
    expect(fake.state.pullZones[0]!.EdgeRules).toHaveLength(0);
    expect(fake.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      'POST /pullzone/1/edgerules/addOrUpdate',
      'POST /pullzone/1/edgerules/addOrUpdate',
      `DELETE /pullzone/1/edgerules/${guid}`,
    ]);
  });

  it('calls afterRequest with the state each request left', async () => {
    const seen: number[] = [];
    const { client } = await setup({
      key: KEY,
      pullZones: [{ Id: 1, Name: 'z', Hostnames: [], EdgeRules: [] }],
      afterRequest: (state) => seen.push(state.pullZones[0]!.EdgeRules.length),
    });
    await client.post('/pullzone/1/edgerules/addOrUpdate', { Description: 'a' });
    await client.get('/pullzone');
    expect(seen).toEqual([1, 1]);
  });
});
