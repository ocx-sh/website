// Deploy orchestration against the fake Bunny: design §3.4 rows, C-036…C-041, C-044.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { zoneName } from '../../../../packages/theme/src/registry.mjs';
import { deploy } from '../deploy.mjs';
import { run as runAction } from '../index.mjs';
import { fakeBunny, type FakeOptions, type Recorded } from './fake-bunny.ts';

type Nav = Parameters<typeof deploy>[0]['nav'];

const nav = JSON.parse(
  readFileSync(join(import.meta.dirname, '../../../../packages/theme/src/nav.json'), 'utf8'),
) as Nav;

const KEY = 'k-secret-0123456789';
const REPO = 'ocx-sh/index';
const HOST = 'storage.test';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function makeDist(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'deploy-dist-'));
  dirs.push(root);
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(join(root, dirname(rel)), { recursive: true });
    writeFileSync(join(root, rel), body);
  }
  return root;
}

const SITE: Record<string, string> = {
  'index.html': '<h1>home</h1>',
  'guide/page.html': '<h1>page</h1>',
  '404.html': '<h1>missing</h1>',
  '_astro/app.abc123.js': 'js',
  '_astro/app.abc123.css': 'css',
  'img/logo.svg': '<svg/>',
};

type Fetch = NonNullable<Parameters<typeof deploy>[0]['storage']['fetch']>;

interface RunOptions {
  files?: Record<string, string>;
  dist?: Record<string, string>;
  repo?: string;
  path?: string;
  dryRun?: boolean;
  forcePrune?: boolean;
  key?: string;
  fake?: Partial<FakeOptions>;
  /** wraps the fake's fetch, to inject failures */
  wrap?: (inner: Fetch) => Fetch;
}

function setup(o: RunOptions = {}) {
  const zone = zoneName(o.repo ?? REPO);
  const fake = fakeBunny({ zone, key: KEY, files: o.files ?? {}, ...o.fake });
  const fetch = o.wrap ? o.wrap(fake.fetch) : fake.fetch;
  const dist = makeDist(o.dist ?? SITE);
  const logs: string[] = [];
  const run = () =>
    deploy({
      inputs: {
        dist,
        ...(o.path === undefined ? {} : { path: o.path }),
        dryRun: o.dryRun ?? false,
        forcePrune: o.forcePrune ?? false,
      },
      repo: o.repo ?? REPO,
      nav,
      storage: { host: HOST, accessKey: o.key ?? KEY, fetch },
      log: (line) => logs.push(line),
      sleep: async () => {},
    });
  return { fake, dist, run, logs, zone };
}

const writes = (rs: Recorded[]) => rs.filter((r) => r.method !== 'GET');
/** Zone-relative path of a request. */
const rel = (r: Recorded) => decodeURIComponent(new URL(r.url).pathname).split('/').slice(2).join('/');
const message = (e: unknown) => (e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e));

async function failure(run: () => Promise<unknown>): Promise<Error> {
  try {
    await run();
  } catch (e) {
    return e as Error;
  }
  throw new Error('expected the deploy to fail');
}

/** Fail the first `times` matching requests with `status` (0 = a network error). */
function flaky(match: (method: string, url: string) => boolean, status: number, times: number) {
  const seen = { n: 0, attempts: new Map<string, number>() };
  const wrap =
    (inner: Fetch): Fetch =>
    async (url, init) => {
      const method = init?.method ?? 'GET';
      if (match(method, url)) {
        seen.attempts.set(url, (seen.attempts.get(url) ?? 0) + 1);
        if (seen.n < times) {
          seen.n++;
          if (status === 0) throw new TypeError('fetch failed');
          return new Response('nope', { status });
        }
      }
      return inner(url, init);
    };
  return { wrap, seen };
}

describe('happy path', () => {
  it('uploads every file under the path, 404.html to bunnycdn_errors, and reports counts and url', async () => {
    const { fake, run } = setup();
    const out = await run();
    expect(out).toMatchObject({ url: 'https://ocx.sh/catalog/', uploaded: 6, deleted: 0 });
    expect([...fake.files.keys()].sort()).toEqual(
      [
        'bunnycdn_errors/404.html',
        'catalog/_astro/app.abc123.css',
        'catalog/_astro/app.abc123.js',
        'catalog/guide/page.html',
        'catalog/img/logo.svg',
        'catalog/index.html',
      ].sort(),
    );
    expect(fake.violations).toEqual([]);
  });

  it('puts 404.html only under bunnycdn_errors, at the zone root of that directory, whatever the path', async () => {
    const { fake, run } = setup();
    await run();
    expect(fake.files.get('bunnycdn_errors/404.html')).toBe('<h1>missing</h1>');
    expect(fake.files.has('catalog/404.html')).toBe(false);
  });

  it('sends https://<host>/<zone>/<path><file> with AccessKey and an uppercase SHA-256 Checksum', async () => {
    const { fake, run, zone } = setup();
    await run();
    for (const r of fake.requests) {
      expect(r.headers.AccessKey).toBe(KEY);
      expect(r.url.startsWith(`https://${HOST}/${zone}/`)).toBe(true);
    }
    const put = writes(fake.requests).find((r) => rel(r) === 'catalog/index.html');
    const sum = createHash('sha256').update('<h1>home</h1>').digest('hex').toUpperCase();
    expect(put?.headers.Checksum).toBe(sum);
    expect(sum).toMatch(/^[0-9A-F]{64}$/);
  });

  it('defaults the path to the repo shortest claim and honours an explicit owned path', async () => {
    const pagefind = { 'index.html': 'x', 'pagefind/pagefind-entry.json': '{"version":"1.5.2"}' };
    // ocx-sh/ocx owns /docs/ (search) and /schemas/: the shortest is /docs/
    const dflt = setup({ repo: 'ocx-sh/ocx', dist: pagefind });
    expect((await dflt.run()).url).toBe('https://ocx.sh/docs/');
    expect(dflt.fake.files.has('docs/index.html')).toBe(true);

    const explicit = setup({ repo: 'ocx-sh/ocx', path: '/schemas/', dist: { 'index.html': 'x' } });
    expect((await explicit.run()).url).toBe('https://ocx.sh/schemas/');
    expect(explicit.fake.files.has('schemas/index.html')).toBe(true);
  });

  it('uploads at most 8 files at once, and more than one', async () => {
    const dist: Record<string, string> = { 'index.html': 'x' };
    for (let i = 0; i < 40; i++) dist[`_astro/f${i}.js`] = `js${i}`;
    const { fake, run } = setup({ dist, fake: { latencyMs: 5 } });
    await run();
    expect(fake.maxInflight).toBeLessThanOrEqual(8);
    expect(fake.maxInflight).toBeGreaterThan(1);
  });

  it('lists the path first and requests nothing outside the zone', async () => {
    const { fake, run, zone } = setup();
    await run();
    expect(fake.requests[0]?.method).toBe('GET');
    expect(fake.requests[0]?.url).toBe(`https://${HOST}/${zone}/catalog/`);
  });
});

describe('phase barrier (C-038)', () => {
  const isHtml = (p: string) => p.endsWith('.html');
  const isTopPagefind = (p: string) => /\/pagefind\/[^/]+$/.test(`/${p}`) && !isHtml(p);

  it('starts no top-level pagefind or HTML PUT before every asset PUT has finished, HTML last', async () => {
    const dist: Record<string, string> = {
      'index.html': 'i',
      '404.html': 'm',
      'a/b/c.html': 'c',
      'pagefind/pagefind.js': 'p',
      'pagefind/pagefind-entry.json': '{"version":"1.5.2"}',
      'pagefind/pagefind-ui.css': 'u',
      'pagefind/index/x.pf_index': 'chunk',
      'pagefind/fragment/y.pf_fragment': 'frag',
    };
    for (let i = 0; i < 30; i++) dist[`_astro/f${i}.js`] = `js${i}`;
    // /schemas/ is a search: false claim, so the entry is shipped but not required
    const { fake, run } = setup({ repo: 'ocx-sh/ocx', path: '/schemas/', dist, fake: { latencyMs: 3 } });
    await run();
    const phase = (p: string) => {
      if (p === 'bunnycdn_errors/404.html' || isHtml(p)) return 3;
      return /^schemas\/pagefind\/[^/]+$/.test(p) ? 2 : 1;
    };
    const puts = writes(fake.requests).map(rel);
    const order = puts.map(phase);
    expect(order).toEqual([...order].sort());
    expect(order.filter((n) => n === 1)).toHaveLength(32);
    expect(order.filter((n) => n === 2)).toHaveLength(3);
    expect(phase('schemas/pagefind/index/x.pf_index')).toBe(1);
    expect(puts.at(-1) && isHtml(puts.at(-1) ?? '')).toBe(true);
  });

  it('never has a phase-1 request in flight when a later phase starts', async () => {
    const dist: Record<string, string> = { 'index.html': 'i' };
    for (let i = 0; i < 20; i++) dist[`_astro/f${i}.js`] = `js${i}`;
    let assetsOpen = 0;
    let overlap = false;
    const { run } = setup({
      dist,
      fake: { latencyMs: 4 },
      wrap: (inner) => async (url, init) => {
        const asset = init?.method === 'PUT' && url.includes('/_astro/');
        if (init?.method === 'PUT' && !asset && assetsOpen > 0) overlap = true;
        if (asset) assetsOpen++;
        try {
          return await inner(url, init);
        } finally {
          if (asset) assetsOpen--;
        }
      },
    });
    await run();
    expect(overlap).toBe(false);
  });
});

describe('step 1 and 2 failures: zero requests (C-036)', () => {
  async function expectZero(o: RunOptions, text: RegExp) {
    const { fake, run } = setup(o);
    const err = await failure(run);
    expect(message(err)).toMatch(text);
    expect(fake.requests).toEqual([]);
    return err;
  }

  it('an empty storage-key', async () => {
    await expectZero({ key: '' }, /storage-key/);
  });

  it('a repo that owns no claim', async () => {
    await expectZero({ repo: 'ocx-sh/nobody' }, /owns no claim/);
  });

  it('a path the repo does not own', async () => {
    await expectZero({ path: '/docs/' }, /does not own/);
  });

  it('a missing index.html', async () => {
    await expectZero({ dist: { 'other.html': 'x' } }, /index\.html/);
  });

  it('a link that does not exist in dist', async () => {
    await expectZero({ dist: { 'index.html': '<a href="/catalog/nope/">x</a>' } }, /C-013/);
  });

  it('a file outside the claim layout', async () => {
    await expectZero(
      { repo: 'ocx-sh/website', path: '/integrations/', dist: { 'index.html': 'x', 'bazel/index.html': 'y' } },
      /C-014/,
    );
  });

  it('a search claim without a pagefind entry', async () => {
    await expectZero({ repo: 'ocx-sh/ocx', dist: { 'index.html': 'x' } }, /pagefind/i);
  });

  it('a symlink in dist', async () => {
    const { fake, run, dist } = setup();
    symlinkSync('/etc/hostname', join(dist, 'leak.txt'));
    const err = await failure(run);
    expect(message(err)).toMatch(/symlink/);
    expect(fake.requests).toEqual([]);
  });
});

describe('listing (step 3)', () => {
  it('a 401 on the listing exits before any write and never prints the key', async () => {
    const { fake, run } = setup({ key: 'wrong-key-0000' });
    const err = await failure(run);
    expect(message(err)).toMatch(/401/);
    expect(message(err)).not.toContain('wrong-key-0000');
    expect(writes(fake.requests)).toEqual([]);
  });

  it('a 500 on the listing is retried, then fatal, with no write', async () => {
    const { fake, run } = setup({ fake: { status: 500 } });
    const err = await failure(run);
    expect(message(err)).toMatch(/500/);
    expect(message(err)).not.toContain(KEY);
    expect(fake.requests.filter((r) => r.method === 'GET')).toHaveLength(3);
    expect(writes(fake.requests)).toEqual([]);
  });

  it('treats a 404 on the first listing of a new path as an empty listing', async () => {
    const f = flaky((m, u) => m === 'GET' && u.endsWith('/catalog/'), 404, 1);
    const { fake, run } = setup({ wrap: f.wrap });
    const out = await run();
    expect(out).toMatchObject({ uploaded: 6, deleted: 0 });
    expect(fake.files.has('catalog/index.html')).toBe(true);
  });

  it('a 404 on a nested directory is an error, never an empty listing', async () => {
    const wrap =
      (inner: Fetch): Fetch =>
      async (url, init) =>
        (init?.method ?? 'GET') === 'GET' && url.endsWith('/catalog/sub/')
          ? new Response('gone', { status: 404 })
          : inner(url, init);
    const { fake, run } = setup({ wrap, files: { 'catalog/sub/a.html': 'x', 'catalog/stale.html': 'x' } });
    const err = await failure(run);
    expect(message(err)).toMatch(/404/);
    expect(writes(fake.requests)).toEqual([]);
  });
});

describe('retry (C-039)', () => {
  const putMatch = (_m: string, url: string) => _m === 'PUT' && url.endsWith('/catalog/_astro/app.abc123.js');

  it.each([
    ['a 503', 503],
    ['a 429', 429],
    ['a network error', 0],
  ])('retries %s and succeeds on the third attempt', async (_name, status) => {
    const f = flaky(putMatch, status, 2);
    const { fake, run } = setup({ wrap: f.wrap });
    const out = await run();
    expect(out.uploaded).toBe(6);
    expect(fake.files.has('catalog/_astro/app.abc123.js')).toBe(true);
    const attempts = [...f.seen.attempts.entries()].find(([u]) => u.endsWith('app.abc123.js'))?.[1];
    expect(attempts).toBe(3);
  });

  it('does not retry a 403', async () => {
    const f = flaky(putMatch, 403, 99);
    const { fake, run } = setup({ wrap: f.wrap });
    const err = await failure(run);
    expect(message(err)).toMatch(/403/);
    expect([...f.seen.attempts.entries()].find(([u]) => u.endsWith('app.abc123.js'))?.[1]).toBe(1);
    expect(fake.violations).toEqual([]);
  });

  it('gives up after 3 attempts in phase 1: no phase 2, no prune, old HTML intact', async () => {
    const f = flaky(putMatch, 503, 99);
    const { fake, run } = setup({
      wrap: f.wrap,
      files: { 'catalog/index.html': 'OLD', 'catalog/gone.html': 'OLD-GONE' },
    });
    const err = await failure(run);
    expect(message(err)).toMatch(/503/);
    expect(message(err)).not.toContain(KEY);
    expect([...f.seen.attempts.entries()].find(([u]) => u.endsWith('app.abc123.js'))?.[1]).toBe(3);
    const done = writes(fake.requests);
    expect(done.some((r) => r.method === 'DELETE')).toBe(false);
    expect(done.some((r) => rel(r).endsWith('.html'))).toBe(false);
    expect(fake.files.get('catalog/index.html')).toBe('OLD');
    expect(fake.files.get('catalog/gone.html')).toBe('OLD-GONE');
  });

  it('a phase-2 failure leaves every page old or new, with all assets present and no prune', async () => {
    const f = flaky((m, u) => m === 'PUT' && u.endsWith('/catalog/guide/page.html'), 503, 99);
    const { fake, run } = setup({
      wrap: f.wrap,
      files: { 'catalog/index.html': 'OLD', 'catalog/guide/page.html': 'OLD-PAGE', 'catalog/gone.html': 'x' },
    });
    await failure(run);
    expect(writes(fake.requests).some((r) => r.method === 'DELETE')).toBe(false);
    for (const asset of ['_astro/app.abc123.js', '_astro/app.abc123.css', 'img/logo.svg'])
      expect(fake.files.has(`catalog/${asset}`)).toBe(true);
    for (const page of ['catalog/index.html', 'catalog/guide/page.html']) {
      expect(['OLD', 'OLD-PAGE', '<h1>home</h1>', '<h1>page</h1>']).toContain(fake.files.get(page));
    }
    expect(fake.files.has('catalog/gone.html')).toBe(true);
  });
});

describe('prune (C-041)', () => {
  it('deletes stale HTML only, never stale assets, other claims or bunnycdn_errors', async () => {
    const { fake, run } = setup({
      repo: 'ocx-sh/website',
      path: '/integrations/',
      dist: { 'index.html': 'new' },
      files: {
        'integrations/index.html': 'old',
        'integrations/stale.html': 'stale',
        'integrations/deep/stale2.html': 'stale',
        'integrations/old.js': 'orphan asset',
        'integrations/bazel/index.html': 'other claim (rules_ocx)',
        'bunnycdn_errors/404.html': 'err',
        'apps/index.html': 'outside the listing',
      },
    });
    const out = await run();
    expect(out).toMatchObject({ uploaded: 1, deleted: 2 });
    expect([...fake.files.keys()].sort()).toEqual(
      [
        'apps/index.html',
        'bunnycdn_errors/404.html',
        'integrations/bazel/index.html',
        'integrations/index.html',
        'integrations/old.js',
      ].sort(),
    );
    const deletes = fake.requests.filter((r) => r.method === 'DELETE');
    expect(deletes.map(rel).sort()).toEqual(['integrations/deep/stale2.html', 'integrations/stale.html']);
    expect(fake.violations).toEqual([]);
  });

  it("prunes the deploying repo's own claims under the path, and spares other repos'", async () => {
    const { fake, run } = setup({
      repo: 'ocx-sh/website',
      path: '/',
      dist: { 'index.html': 'new', 'pagefind/pagefind-entry.json': '{"version":"1.5.2"}' },
      files: {
        'install/old.html': 'own claim, stale',
        'docs/index.html': 'ocx-sh/ocx claim',
        'integrations/bazel/index.html': 'ocx-sh/rules_ocx claim',
      },
    });
    const out = await run();
    expect(out).toMatchObject({ uploaded: 2, deleted: 1 });
    expect([...fake.files.keys()].sort()).toEqual(
      ['docs/index.html', 'index.html', 'integrations/bazel/index.html', 'pagefind/pagefind-entry.json'].sort(),
    );
  });

  it('treats a 404 on a retried DELETE as deleted', async () => {
    let attempts = 0;
    const wrap =
      (inner: Fetch): Fetch =>
      async (url, init) => {
        if (init?.method !== 'DELETE' || !url.endsWith('/catalog/a.html')) return inner(url, init);
        // First attempt: the file is deleted but the response is lost to a 503. Second: gone.
        if (++attempts === 1) {
          await inner(url, init);
          return new Response('busy', { status: 503 });
        }
        return new Response('not found', { status: 404 });
      };
    const { fake, run } = setup({ wrap, files: { 'catalog/a.html': 'x' } });
    const out = await run();
    expect(out).toMatchObject({ deleted: 1 });
    expect(attempts).toBe(2);
    expect(fake.files.has('catalog/a.html')).toBe(false);
  });

  it('runs the prune after every PUT', async () => {
    const { fake, run } = setup({ files: { 'catalog/stale.html': 'x' } });
    await run();
    const methods = fake.requests.map((r) => r.method);
    expect(methods.lastIndexOf('PUT')).toBeLessThan(methods.indexOf('DELETE'));
  });

  it('a failed DELETE exits 1 naming the file, after the other deletes ran', async () => {
    const f = flaky((m, u) => m === 'DELETE' && u.endsWith('/catalog/a.html'), 403, 99);
    const { fake, run } = setup({
      wrap: f.wrap,
      files: { 'catalog/a.html': 'x', 'catalog/b.html': 'x' },
    });
    const err = await failure(run);
    expect(message(err)).toMatch(/a\.html/);
    expect(fake.files.has('catalog/b.html')).toBe(false);
    expect(fake.files.has('catalog/a.html')).toBe(true);
  });
});

describe('prune cap (C-320)', () => {
  const pages = (n: number, prefix: string) =>
    Object.fromEntries(Array.from({ length: n }, (_, i) => [`${prefix}${i}.html`, prefix]));
  /** `keep` pages besides index.html, kept by the build */
  const build = (keep: number) => ({ 'index.html': 'new', ...pages(keep, 'keep') });
  const dist = build(3);
  /** the zone before the deploy: the pages of `build(keep)` plus `stale` pages the build drops */
  const old = (stale: number, keep = 3) => ({
    ...Object.fromEntries(Object.keys(build(keep)).map((k) => [`catalog/${k}`, 'old'])),
    ...Object.fromEntries(Object.keys(pages(stale, 'gone')).map((k) => [`catalog/${k}`, 'stale'])),
  });
  const deletes = (rs: Recorded[]) => rs.filter((r) => r.method === 'DELETE');

  it('9 listed files, 5 of them stale: below the minimum, so no cap applies', async () => {
    const { fake, run } = setup({ dist, files: old(5) });
    expect(await run()).toMatchObject({ deleted: 5 });
    expect(deletes(fake.requests)).toHaveLength(5);
  });

  it('10 listed, 6 stale: exit 1 naming the count, zero DELETEs, the uploads stay', async () => {
    const { fake, run } = setup({ dist, files: old(6) });
    const err = await failure(run);
    expect(message(err)).toMatch(/6 of 10/);
    expect(message(err)).toMatch(/force-prune/);
    expect(deletes(fake.requests)).toEqual([]);
    expect(fake.files.get('catalog/index.html')).toBe('new');
    expect(fake.files.has('catalog/gone0.html')).toBe(true);
  });

  it('10 listed, 5 stale: exactly half is allowed', async () => {
    const { run } = setup({ dist: build(4), files: old(5, 4) });
    expect(await run()).toMatchObject({ deleted: 5 });
  });

  it('counts only HTML in scope: stale assets and other claims never raise the ratio', async () => {
    const orphans = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`catalog/old${i}.js`, 'x']));
    const files = { ...old(3), ...orphans };
    const { run } = setup({ dist, files });
    expect(await run()).toMatchObject({ deleted: 3 });
  });

  it('force-prune deletes anyway', async () => {
    const { fake, run } = setup({ dist, files: old(6), forcePrune: true });
    expect(await run()).toMatchObject({ deleted: 6 });
    expect(deletes(fake.requests)).toHaveLength(6);
  });

  it('a dry run refuses too, with only GETs sent', async () => {
    const { fake, run } = setup({ dist, files: old(6), dryRun: true });
    expect(message(await failure(run))).toMatch(/6 of 10/);
    expect(fake.requests.every((r) => r.method === 'GET')).toBe(true);
  });
});

describe('dry-run (C-044)', () => {
  it('sends only GET and plans the PUT and DELETE counts and paths', async () => {
    const { fake, run, logs } = setup({
      dryRun: true,
      files: { 'catalog/index.html': 'OLD', 'catalog/stale.html': 'x' },
    });
    const out = await run();
    expect(fake.requests.length).toBeGreaterThan(0);
    expect(fake.requests.every((r) => r.method === 'GET')).toBe(true);
    expect(out).toMatchObject({ uploaded: 0, deleted: 0, planned: { uploads: 6, deletes: 1 } });
    const text = logs.join('\n');
    expect(text).toContain('catalog/index.html');
    expect(text).toContain('catalog/stale.html');
    expect(text).toContain('bunnycdn_errors/404.html');
    expect(fake.files.get('catalog/index.html')).toBe('OLD');
  });
});

describe('index.mjs', () => {
  const index = join(import.meta.dirname, '../index.mjs');
  const spawn = (env: Record<string, string>) =>
    spawnSync(process.execPath, [index], {
      env: { PATH: process.env.PATH ?? '', ...env },
      encoding: 'utf8',
    });

  it('masks the key before anything else is printed', () => {
    const r = spawn({ 'INPUT_STORAGE-KEY': KEY, INPUT_DIST: 'dist', GITHUB_REPOSITORY: 'ocx-sh/nobody' });
    expect(r.status).toBe(1);
    expect(r.stdout.split('\n')[0]).toBe(`::add-mask::${KEY}`);
    expect(r.stdout.split('\n').slice(1).join('\n') + r.stderr).not.toContain(KEY);
  });

  it('exits 1 on an empty storage-key without any request', () => {
    const r = spawn({ 'INPUT_STORAGE-KEY': '', INPUT_DIST: 'dist', GITHUB_REPOSITORY: REPO });
    expect(r.status).toBe(1);
    expect(r.stdout + r.stderr).toMatch(/storage-key/);
  });

  it('reads INPUT_* env, writes the three outputs and the step summary', async () => {
    const out = mkdtempSync(join(tmpdir(), 'deploy-out-'));
    dirs.push(out);
    const fake = fakeBunny({ zone: zoneName(REPO), key: KEY, files: {} });
    const logs: string[] = [];
    const code = await runAction(
      {
        'INPUT_STORAGE-KEY': KEY,
        INPUT_DIST: makeDist(SITE),
        'INPUT_STORAGE-HOST': HOST,
        'INPUT_DRY-RUN': 'false',
        GITHUB_REPOSITORY: REPO,
        GITHUB_OUTPUT: join(out, 'output'),
        GITHUB_STEP_SUMMARY: join(out, 'summary'),
      },
      { fetch: fake.fetch, log: (l) => logs.push(l), sleep: async () => {} },
    );
    expect(code).toBe(0);
    expect(logs[0]).toBe(`::add-mask::${KEY}`);
    expect(readFileSync(join(out, 'output'), 'utf8').split('\n').sort()).toEqual([
      '',
      'deleted=0',
      'uploaded=6',
      'url=https://ocx.sh/catalog/',
    ]);
    const summary = readFileSync(join(out, 'summary'), 'utf8');
    expect(summary).toContain('https://ocx.sh/catalog/');
    expect(summary).not.toContain(KEY);
  });

  it('rejects a dry-run value that is not true or false, without any request', async () => {
    const fake = fakeBunny({ zone: zoneName(REPO), key: KEY, files: {} });
    const logs: string[] = [];
    const code = await runAction(
      { 'INPUT_STORAGE-KEY': KEY, INPUT_DIST: makeDist(SITE), 'INPUT_DRY-RUN': 'yes', GITHUB_REPOSITORY: REPO },
      { fetch: fake.fetch, log: (l) => logs.push(l) },
    );
    expect(code).toBe(1);
    expect(fake.requests).toEqual([]);
    expect(logs.join('\n')).not.toContain(KEY.slice(1) + 'x');
  });
});
