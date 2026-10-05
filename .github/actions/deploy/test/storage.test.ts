// C-322 contract: the storage client lists with bounded concurrency, deletes only listed files,
// and never leaks the AccessKey. Written from the contract text; the producer pipeline extends it.
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { listRecursive, remove, type StorageClient, upload, walkDist } from '../storage.mjs';
import { fakeBunny, type FakeOptions } from './fake-bunny.ts';

const KEY = 'k-secret-0123456789';

function setup(over: Partial<FakeOptions> = {}) {
  const fake = fakeBunny({ zone: 'z', key: KEY, files: {}, ...over });
  const client: StorageClient = { host: 'storage.test', zone: 'z', accessKey: KEY, fetch: fake.fetch };
  return { fake, client };
}

const message = (e: unknown) => (e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e));

describe('listRecursive', () => {
  it('returns every nested entry', async () => {
    const { client } = setup({ files: { 'index.html': 'a', 'docs/a.html': 'b', 'docs/deep/c.html': 'c' } });
    const entries = await listRecursive(client);
    const files = entries.filter((e) => !e.IsDirectory).map((e) => `${e.Path}${e.ObjectName}`);
    expect(files.sort()).toEqual(['/z/docs/a.html', '/z/docs/deep/c.html', '/z/index.html']);
  });

  it('runs at most 5 listings at once', async () => {
    const files = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`d${i}/f.html`, 'x']));
    const { client, fake } = setup({ files, latencyMs: 5 });
    const entries = await listRecursive(client);
    expect(entries.filter((e) => !e.IsDirectory)).toHaveLength(12);
    expect(fake.maxInflight).toBeLessThanOrEqual(5);
  });
});

describe('remove', () => {
  it('sends DELETE for a listed file, never ending in a slash, and refuses a directory entry', async () => {
    const { client, fake } = setup({ files: { 'docs/a.html': 'x', 'b.html': 'y' } });
    const entries = await listRecursive(client);
    const file = entries.find((e) => e.ObjectName === 'b.html');
    const dir = entries.find((e) => e.IsDirectory);
    expect(file).toBeDefined();
    expect(dir).toBeDefined();
    await remove(client, file!);
    const deletes = () => fake.requests.filter((r) => r.method === 'DELETE');
    expect(deletes()).toHaveLength(1);
    expect(deletes()[0]!.url.endsWith('/')).toBe(false);
    await expect(remove(client, dir!)).rejects.toThrow();
    expect(deletes()).toHaveLength(1);
  });

  it('refuses a file entry whose URL would end in a slash', async () => {
    const { client, fake } = setup({ files: { 'a.html': 'x' } });
    await listRecursive(client);
    await expect(remove(client, { Path: '/z/', ObjectName: 'a.html/', IsDirectory: false })).rejects.toThrow();
    expect(fake.requests.filter((r) => r.method === 'DELETE')).toHaveLength(0);
  });
});

describe('upload', () => {
  it('rejects a remote path containing .. before any request', async () => {
    const { client, fake } = setup();
    await expect(upload(client, 'docs/../../x.html', 'a')).rejects.toThrow(/\.\./);
    expect(fake.requests).toHaveLength(0);
  });
});

describe('requests', () => {
  it('never send allowRootDelete', async () => {
    const { client, fake } = setup({ files: { 'a.html': 'x' } });
    await upload(client, 'new.html', 'n');
    const [file] = (await listRecursive(client)).filter((e) => e.ObjectName === 'a.html');
    await remove(client, file!);
    expect(fake.requests.length).toBeGreaterThan(0);
    for (const r of fake.requests) expect(JSON.stringify(r).toLowerCase()).not.toContain('allowrootdelete');
  });
});

describe('AccessKey redaction', () => {
  it('replaces the key with *** in a forced 401', async () => {
    const { client } = setup({ status: 401 });
    const err = await listRecursive(client).then(
      () => null,
      (e: unknown) => e,
    );
    expect(message(err)).not.toContain(KEY);
    expect(message(err)).toContain('***');
  });

  it('replaces the key with *** in a forced 500', async () => {
    const { client } = setup({ status: 500 });
    const err = await upload(client, 'a.html', 'x').then(
      () => null,
      (e: unknown) => e,
    );
    expect(message(err)).not.toContain(KEY);
    expect(message(err)).toMatch(/500/);
  });

  it('replaces the key with *** when the transport fails', async () => {
    const { client } = setup({ failWith: new Error(`connect ETIMEDOUT (AccessKey: ${KEY})`) });
    const err = await listRecursive(client).then(
      () => null,
      (e: unknown) => e,
    );
    expect(message(err)).not.toContain(KEY);
    expect(message(err)).toContain('***');
  });
});

/** Everything an error exposes plus everything the run wrote to stdout/stderr/console. */
async function captureAll(run: () => Promise<unknown>): Promise<string> {
  const out: string[] = [];
  const sink = (chunk: unknown) => (out.push(String(chunk)), true);
  const spies = [
    vi.spyOn(process.stdout, 'write').mockImplementation(sink),
    vi.spyOn(process.stderr, 'write').mockImplementation(sink),
    ...(['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void out.push(a.map(String).join(' '))),
    ),
  ];
  try {
    const err = await run().then(
      () => null,
      (e: unknown) => e,
    );
    if (err instanceof Error) {
      out.push(err.message, err.stack ?? '', JSON.stringify(err, Object.getOwnPropertyNames(err)));
      if (err.cause) out.push(err.cause instanceof Error ? (err.cause.stack ?? '') : JSON.stringify(err.cause));
    } else out.push(String(err));
  } finally {
    for (const spy of spies) spy.mockRestore();
  }
  return out.join('\n');
}

describe('AccessKey redaction, every output', () => {
  const cases: [string, Partial<FakeOptions>][] = [
    ['401', { status: 401 }],
    ['500', { status: 500 }],
    ['transport error', { failWith: new Error(`connect ETIMEDOUT AccessKey=${KEY} AccessKey=${KEY}`) }],
  ];
  for (const [name, over] of cases) {
    for (const [op, call] of [
      ['list', (c: StorageClient) => listRecursive(c)],
      ['upload', (c: StorageClient) => upload(c, 'a.html', 'x')],
      ['remove', (c: StorageClient) => remove(c, { Path: '/z/', ObjectName: 'a.html', IsDirectory: false })],
    ] as const) {
      it(`never prints the key: ${op} under ${name}`, async () => {
        const { client } = setup(over);
        const all = await captureAll(() => call(client));
        expect(all).not.toContain(KEY);
        expect(all).not.toContain(encodeURIComponent(KEY));
        expect(all).toMatch(/\*\*\*|failed/);
      });
    }
  }

  it('redacts a key that straddles the body truncation point', async () => {
    const { client } = setup({ status: 500 });
    const padded = {
      ...client,
      fetch: () => Promise.resolve(new Response(`${'x'.repeat(190)}${KEY}`, { status: 500 })),
    };
    expect(await captureAll(() => upload(padded, 'a.html', 'x'))).not.toContain(KEY.slice(0, 8));
  });

  it('survives a key that is a regex metacharacter soup', async () => {
    const weird = 'a.b*c+(d)[e]$^';
    const fake = fakeBunny({ zone: 'z', key: weird, files: {}, status: 401 });
    const client: StorageClient = { host: 'storage.test', zone: 'z', accessKey: weird, fetch: fake.fetch };
    expect(await captureAll(() => listRecursive(client))).not.toContain(weird);
  });

  it('turns a hung request into a redacted timeout error', async () => {
    const { client, fake } = setup({ hang: true });
    const all = await captureAll(() => listRecursive({ ...client, timeoutMs: 20 }));
    expect(fake.requests[0]!.hasSignal).toBe(true);
    expect(all).not.toContain(KEY);
    expect(all).toMatch(/timed? ?out|abort/i);
  });
});

describe('request shape', () => {
  it('sends AccessKey, https URLs on the configured host and zone, and refuses redirects', async () => {
    const { client, fake } = setup({ files: { 'docs/a.html': 'x' } });
    await listRecursive(client, 'docs');
    await upload(client, 'docs/b c.html', 'y');
    for (const r of fake.requests) {
      expect(r.headers.AccessKey).toBe(KEY);
      expect(r.url.startsWith('https://storage.test/z/')).toBe(true);
      expect(r.redirect).toBe('error');
      expect(r.hasSignal).toBe(true);
    }
    expect(fake.requests[0]!.url).toBe('https://storage.test/z/docs/');
    expect(fake.requests[1]!.url).toBe('https://storage.test/z/docs/b%20c.html');
  });

  it('refuses a host that would send the key elsewhere', async () => {
    const { client, fake } = setup();
    for (const host of ['evil.test/x', 'evil.test@good.test', '']) {
      await expect(listRecursive({ ...client, host })).rejects.toThrow();
    }
    expect(fake.requests).toHaveLength(0);
  });
});

describe('upload', () => {
  it('sends PUT with the uppercase SHA-256 of the body as Checksum', async () => {
    const { client, fake } = setup();
    await upload(client, 'a/b.html', 'hello');
    const [req] = fake.requests;
    expect(req!.method).toBe('PUT');
    expect(req!.headers.Checksum).toBe(createHash('sha256').update('hello').digest('hex').toUpperCase());
    expect(fake.files.get('a/b.html')).toBe('hello');
  });

  it.each(['', '/a.html', 'a//b.html', 'a/', 'a\\b.html', '../a.html', 'a/..', 'a..b.html', '.', 'a/./b.html'])(
    'rejects the remote path %j before any request',
    async (path) => {
      const { client, fake } = setup();
      await expect(upload(client, path, 'a')).rejects.toThrow();
      expect(fake.requests).toHaveLength(0);
    },
  );

  it('throws a StorageError-shaped error carrying the HTTP status', async () => {
    const { client } = setup({ status: 500 });
    const err = await upload(client, 'a.html', 'x').then(
      () => null,
      (e: unknown) => e,
    );
    expect((err as { status?: number }).status).toBe(500);
  });
});

describe('listRecursive limits', () => {
  it('throws when the tree is deeper than maxDepth', async () => {
    const { client } = setup({ files: { 'a/b/c/d.html': 'x' } });
    await expect(listRecursive(client, '', { maxDepth: 2 })).rejects.toThrow(/depth/i);
    await expect(listRecursive(client, '', { maxDepth: 3 })).resolves.toHaveLength(4);
  });

  it('throws when the listing exceeds maxEntries', async () => {
    const files = Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`f${i}.html`, 'x']));
    const { client } = setup({ files });
    await expect(listRecursive(client, '', { maxEntries: 5 })).rejects.toThrow(/entries|count|cap/i);
    await expect(listRecursive(client, '', { maxEntries: 6 })).resolves.toHaveLength(6);
  });

  it('lists a subdirectory and rejects .. in it before any request', async () => {
    const { client, fake } = setup({ files: { 'docs/a.html': 'x', 'b.html': 'y' } });
    const entries = await listRecursive(client, 'docs/');
    expect(entries.map((e) => e.ObjectName)).toEqual(['a.html']);
    await expect(listRecursive(client, 'docs/../x')).rejects.toThrow(/\.\./);
    expect(fake.requests).toHaveLength(1);
  });

  it('rejects a malformed listing', async () => {
    const { client } = setup();
    const bad = { ...client, fetch: () => Promise.resolve(new Response('{"not":"an array"}', { status: 200 })) };
    await expect(listRecursive(bad)).rejects.toThrow();
    const badEntry = { ...client, fetch: () => Promise.resolve(new Response('[{"ObjectName":1}]', { status: 200 })) };
    await expect(listRecursive(badEntry)).rejects.toThrow();
  });
});

describe('remove, defensive', () => {
  const dirEntry = { Path: '/z/', ObjectName: 'docs', IsDirectory: true };

  it('never issues a DELETE for a directory, a trailing slash, a foreign zone or a .. name', async () => {
    const { client, fake } = setup({ files: { 'docs/a.html': 'x' } });
    const bad = [
      dirEntry,
      { Path: '/z/', ObjectName: 'docs/', IsDirectory: true },
      { Path: '/z/', ObjectName: '', IsDirectory: false },
      { Path: '/z/', ObjectName: '..', IsDirectory: false },
      { Path: '/z/', ObjectName: 'a/b.html', IsDirectory: false },
      { Path: '/z/docs', ObjectName: 'a.html', IsDirectory: false },
      { Path: '/z/../y/', ObjectName: 'a.html', IsDirectory: false },
      { Path: '/other/', ObjectName: 'a.html', IsDirectory: false },
      { Path: '/z/', ObjectName: 'a.html', IsDirectory: undefined },
    ];
    for (const entry of bad) await expect(remove(client, entry as never)).rejects.toThrow();
    expect(fake.requests).toHaveLength(0);
    expect(fake.violations).toEqual([]);
    expect(fake.files.has('docs/a.html')).toBe(true);
  });

  it('deletes a nested listed file at its exact URL', async () => {
    const { client, fake } = setup({ files: { 'docs/deep/a.html': 'x' } });
    const file = (await listRecursive(client)).find((e) => e.ObjectName === 'a.html')!;
    await remove(client, file);
    expect(fake.requests.at(-1)!.url).toBe('https://storage.test/z/docs/deep/a.html');
    expect(fake.violations).toEqual([]);
    expect(fake.files.size).toBe(0);
  });

  it('only ever issues DELETE urls without a trailing slash across a full list-and-prune', async () => {
    const { client, fake } = setup({ files: { 'a.html': '1', 'd/b.html': '2', 'd/e/c.html': '3' } });
    for (const e of (await listRecursive(client)).filter((x) => !x.IsDirectory)) await remove(client, e);
    expect(fake.violations).toEqual([]);
    expect(fake.requests.filter((r) => r.method === 'DELETE').every((r) => !r.url.endsWith('/'))).toBe(true);
    expect(fake.files.size).toBe(0);
  });
});

describe('walkDist', () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
  });
  function dist(files: Record<string, string>) {
    const root = mkdtempSync(join(tmpdir(), 'walkdist-'));
    roots.push(root);
    const dir = join(root, 'dist');
    mkdirSync(dir);
    for (const [rel, body] of Object.entries(files)) {
      mkdirSync(join(dir, rel, '..'), { recursive: true });
      writeFileSync(join(dir, rel), body);
    }
    return { root, dir };
  }

  it('returns sorted POSIX-relative files with absolute paths', async () => {
    const { dir } = dist({ 'index.html': 'a', 'docs/b.html': 'b', 'docs/deep/c.css': 'c' });
    const files = await walkDist(dir);
    expect(files.map((f) => f.path)).toEqual(['docs/b.html', 'docs/deep/c.css', 'index.html']);
    expect(files.every((f) => f.absolute.startsWith(dir))).toBe(true);
  });

  it('rejects a symlinked file, even one pointing inside dist', async () => {
    const { dir } = dist({ 'index.html': 'a' });
    symlinkSync(join(dir, 'index.html'), join(dir, 'link.html'));
    await expect(walkDist(dir)).rejects.toThrow(/symlink/i);
  });

  it('rejects a symlinked directory that points outside dist', async () => {
    const { root, dir } = dist({ 'index.html': 'a' });
    mkdirSync(join(root, 'secret'));
    writeFileSync(join(root, 'secret', 'k.txt'), 'private');
    symlinkSync(join(root, 'secret'), join(dir, 'assets'), 'dir');
    await expect(walkDist(dir)).rejects.toThrow(/symlink/i);
  });

  it('rejects a dangling symlink', async () => {
    const { dir } = dist({ 'index.html': 'a' });
    symlinkSync(join(dir, 'nope'), join(dir, 'dangling'));
    await expect(walkDist(dir)).rejects.toThrow(/symlink/i);
  });

  it('rejects a dist root that is itself a symlink', async () => {
    const { root, dir } = dist({ 'index.html': 'a' });
    symlinkSync(dir, join(root, 'dist-link'), 'dir');
    await expect(walkDist(join(root, 'dist-link'))).rejects.toThrow(/symlink/i);
  });

  it('rejects an entry whose name contains ..', async () => {
    const { dir } = dist({ 'index.html': 'a', 'a..b.html': 'b' });
    await expect(walkDist(dir)).rejects.toThrow(/\.\./);
  });

  it('rejects a missing dist and a dist that is a file', async () => {
    const { root, dir } = dist({ 'index.html': 'a' });
    await expect(walkDist(join(root, 'nope'))).rejects.toThrow();
    await expect(walkDist(join(dir, 'index.html'))).rejects.toThrow();
  });

  it('enforces the depth and file-count caps', async () => {
    const { dir } = dist({ 'a/b/c/d.html': 'x', 'e.html': 'y', 'f.html': 'z' });
    await expect(walkDist(dir, { maxDepth: 2 })).rejects.toThrow(/depth/i);
    await expect(walkDist(dir, { maxEntries: 2 })).rejects.toThrow(/entries|count|cap/i);
    await expect(walkDist(dir, { maxDepth: 3, maxEntries: 3 })).resolves.toHaveLength(3);
  });
});
