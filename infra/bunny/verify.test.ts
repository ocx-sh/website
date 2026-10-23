// bunny:verify against a fake CDN host: every probe green, then one break at a time, each listed by path.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import committed from './legacy.json' with { type: 'json' };
import { main, probesFor, type Probe } from './verify.mjs';

type Legacy = { entries: (typeof committed.entries)[number][] };
type Plan = { legacy: Legacy };
interface Reply {
  status?: number;
  headers?: Record<string, string | string[]>;
  body?: string;
}

const page = (head = '', body = '') =>
  `<!doctype html><html><head><title>t</title>${head}</head><body>${body}</body></html>`;
// /integrations/bazel/ is an OriginStorage claim since the rules_ocx flip: the committed plan carries a storage probe.
const STORAGE_PLAN: Plan = { legacy: committed };
// legacy.json holds no proxy entry any more: the proxy probes keep their coverage through this sample.
const PROXY_ENTRY = {
  id: 'legacy-proxy',
  repo: 'ocx-sh/proxied',
  mode: 'proxy',
  origin: 'https://ocx-website.pages.dev',
  paths: ['/docs/authoring/'],
};
const PROXY_PLAN: Plan = { legacy: { entries: [...committed.entries, PROXY_ENTRY] } };

// ponytail: the replies are hand-written, not recorded from a b-cdn.net host. M0 recorded the redirect status,
// `Location` and the storage 200/404 bodies (plan, M0 Result); the header set (`x-robots-tag`, canonical) is not.
/** What a correct zone answers for a probe. */
function good(p: Probe, noindex = true): Reply {
  const headers = noindex ? { 'x-robots-tag': 'noindex, nofollow' } : {};
  if (p.kind === 'redirect') return { status: p.status, headers: { ...headers, location: p.location! } };
  const canonical = `<link rel="canonical" href="${p.canonical ?? `https://ocx.sh${p.path}`}">`;
  return {
    status: 200,
    headers: { ...headers, 'content-type': 'text/html' },
    body: page(canonical, '<a href="https://jqlang.github.io/jq/">jq</a>'),
  };
}

let server: Server | undefined;
afterEach(async () => {
  server?.closeAllConnections();
  await new Promise((r) => (server ? server.close(r) : r(undefined)));
  server = undefined;
});

/** A fake CDN host answering `good` for every probe of the zone, except where `patch` replaces a reply. */
async function run(
  zone = 'dev',
  {
    plan = {},
    patch = {},
    down = false,
    host,
    indexable = false,
  }: { plan?: object; patch?: Record<string, Reply>; down?: boolean; host?: string; indexable?: boolean } = {},
) {
  const probes = probesFor(zone, plan);
  const requests: { path: string; headers: Record<string, unknown> }[] = [];
  server = createServer((req, res) => {
    requests.push({ path: req.url!, headers: req.headers });
    const probe = probes.find((p) => p.path === req.url);
    // Like the live origin, 404 for a path no probe asked for (`/docs/` is one): no noindex, no page.
    const reply = probe ? { ...good(probe, !indexable), ...patch[req.url!] } : { status: 404, ...patch[req.url!] };
    res.writeHead(reply.status ?? 200, reply.headers);
    res.end(reply.body ?? '');
  });
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  if (down) await new Promise((r) => server!.close(r));
  const out: string[] = [];
  const err: string[] = [];
  const code = await main({
    argv: ['--zone', zone, ...(host ? ['--host', host] : [])],
    out: (t) => out.push(t),
    err: (t) => err.push(t),
    baseUrl,
    plan,
  });
  return { code, requests, out: out.join(''), err: err.join('') };
}

/** The probe path of the sample proxy rule. */
const DOCS = probesFor('dev', PROXY_PLAN).find((p) => p.kind === 'proxy')!.path;

describe('probesFor', () => {
  it('derives the dev probes from the plan: default origin, proxies, redirects with golden Locations', () => {
    const probes = probesFor('dev', PROXY_PLAN);
    expect(probes).toContainEqual({ kind: 'default', path: '/', status: 200 });
    expect(probes).toContainEqual({ kind: 'proxy', path: '/docs/authoring/announcing', status: 200 });
    expect(probes).toContainEqual({
      kind: 'redirect',
      path: '/apps/catalog',
      status: 302,
      location: 'https://ocx-sh.github.io/catalog/',
    });
    expect(probes).toContainEqual({
      kind: 'redirect',
      path: '/apps/catalog/a/b/',
      status: 302,
      location: 'https://ocx-sh.github.io/catalog/a/b',
    });
    expect(probes.some((p) => p.kind === 'storage')).toBe(true);
  });

  it('probes an OriginStorage claim root with its canonical on ocx.sh', () => {
    expect(probesFor('dev', STORAGE_PLAN)).toContainEqual({
      kind: 'storage',
      path: '/integrations/bazel/',
      status: 200,
      canonical: 'https://ocx.sh/integrations/bazel/',
    });
  });

  it('probes only the first root of a repo with several claims: /docs/ is a page, /schemas/ has no index', () => {
    const roots = probesFor('prod')
      .filter((p) => p.kind === 'storage' && p.canonical?.endsWith(p.path))
      .map((p) => p.path);
    expect(roots).toContain('/docs/');
    expect(roots).not.toContain('/schemas/');
  });

  it('probes a real page per proxy rule, never a directory pattern: /docs/authoring/ is a 404 on the origin', () => {
    const paths = probesFor('prod', PROXY_PLAN)
      .filter((p) => p.kind === 'proxy')
      .map((p) => p.path);
    expect(paths).toEqual(['/docs/authoring/announcing']);
    expect(paths).not.toContain('/docs/authoring/');
  });

  it('refuses a proxy rule with no known-good path in old-urls.txt', () => {
    const legacy = { entries: [...committed.entries, { ...PROXY_ENTRY, paths: ['/nope/'] }] };
    expect(() => probesFor('dev', { legacy })).toThrow(/legacy-proxy: no known-good path/);
  });

  it('a preview zone has no origin rules: the default origin only', () => {
    expect(probesFor('preview:ocx')).toEqual([{ kind: 'default', path: '/', status: 200 }]);
  });
});

describe('a correct zone', () => {
  it('passes every probe with exit 0 and sends no credential', async () => {
    const { code, out, requests, err } = await run('dev', { plan: STORAGE_PLAN });
    expect(code).toBe(0);
    expect(err).toBe('');
    expect(out).toMatch(/sh-ocx-dev\.b-cdn\.net: \d+ probes, 0 failed/);
    expect(requests).toHaveLength(probesFor('dev', STORAGE_PLAN).length);
    expect(requests.every((r) => r.headers.accesskey === undefined && r.headers.authorization === undefined)).toBe(
      true,
    );
  });

  it('passes prod and a preview zone', async () => {
    expect((await run('prod')).code).toBe(0);
    expect((await run('preview:ocx')).code).toBe(0);
  });

  it('a third-party github.io link in the body is not a leak', async () => {
    const body = page(
      '<link rel="canonical" href="https://ocx.sh/docs/">',
      '<a href="https://jqlang.github.io/jq/">jq</a>',
    );
    const { code } = await run('dev', {
      plan: PROXY_PLAN,
      patch: { [DOCS]: { ...good({ kind: 'proxy', path: DOCS, status: 200 }), body } },
    });
    expect(code).toBe(0);
  });

  it('a redirect to a github.io Location is the golden one, not a leak', async () => {
    const { code } = await run('dev');
    expect(code).toBe(0);
    expect(probesFor('dev').some((p) => p.location?.includes('github.io'))).toBe(true);
  });
});

describe('each break fails exactly its probe, exit 1', () => {
  const noindex = { 'x-robots-tag': 'noindex, nofollow' };
  const html = (body: string) => ({ headers: { ...noindex, 'content-type': 'text/html' }, body });

  it.each([
    ['a proxy that answers 404', { [DOCS]: { status: 404 } }, `FAIL proxy ${DOCS}: status 404, expected 200`],
    [
      'a redirect that answers 301',
      { '/apps/catalog/a/b/': { status: 301 } },
      'FAIL redirect /apps/catalog/a/b/: status 301, expected 302',
    ],
    [
      'a redirect with the wrong Location',
      { '/apps/catalog/a/b/': { headers: { ...noindex, location: 'https://ocx-sh.github.io/catalog/' } } },
      'FAIL redirect /apps/catalog/a/b/: Location is "https://ocx-sh.github.io/catalog/", expected "https://ocx-sh.github.io/catalog/a/b"',
    ],
    [
      'a response without noindex',
      { '/docs/': { headers: { 'content-type': 'text/html' } } },
      'FAIL storage /docs/: X-Robots-Tag has no noindex',
    ],
    [
      'a proxy whose Location names pages.dev',
      { [DOCS]: { headers: { ...noindex, location: 'https://ocx-website.pages.dev/docs/' } } },
      `FAIL proxy ${DOCS}: origin leak in header:location: ocx-website.pages.dev`,
    ],
    [
      'a proxied page whose canonical names pages.dev',
      { [DOCS]: html(page('<link rel="canonical" href="https://x.pages.dev/docs/">')) },
      `FAIL proxy ${DOCS}: origin leak in canonical: x.pages.dev`,
    ],
    [
      'a proxied body carrying ocx-website.pages.dev',
      { [DOCS]: html(page('', '<script src="https://ocx-website.pages.dev/a.js"></script>')) },
      `FAIL proxy ${DOCS}: origin leak in body: ocx-website.pages.dev`,
    ],
    ['a default origin without noindex', { '/': { headers: {} } }, 'FAIL default /: X-Robots-Tag has no noindex'],
  ] as [string, Record<string, Reply>, string][])('%s', async (_, patch, line) => {
    const { code, err } = await run('dev', { plan: PROXY_PLAN, patch });
    expect(code).toBe(1);
    expect(err.trim().split('\n')).toEqual([line]);
  });

  it('a storage root whose canonical is not on ocx.sh', async () => {
    const wrong = html(page('<link rel="canonical" href="https://sh-ocx-dev.b-cdn.net/integrations/bazel/">'));
    const { code, err } = await run('dev', { plan: STORAGE_PLAN, patch: { '/integrations/bazel/': wrong } });
    expect(code).toBe(1);
    expect(err).toContain(
      'FAIL storage /integrations/bazel/: canonical is "https://sh-ocx-dev.b-cdn.net/integrations/bazel/", expected "https://ocx.sh/integrations/bazel/"',
    );
  });

  it('a storage root with no canonical at all', async () => {
    const { code, err } = await run('dev', { plan: STORAGE_PLAN, patch: { '/integrations/bazel/': html(page()) } });
    expect(code).toBe(1);
    expect(err).toContain('canonical is null');
  });

  it('lists every failed probe, not just the first', async () => {
    const { code, err, out } = await run('dev', {
      plan: PROXY_PLAN,
      patch: { [DOCS]: { status: 500 }, '/apps/catalog/a/b/': { status: 404 } },
    });
    expect(code).toBe(1);
    expect(err.trim().split('\n')).toHaveLength(2);
    expect(out).toMatch(/2 failed/);
  });

  it('a host that does not answer fails every probe, exit 1', async () => {
    const { code, err } = await run('dev', { down: true });
    expect(code).toBe(1);
    expect(err).toMatch(/FAIL default \/: request failed/);
  });
});

describe('--host', () => {
  it('next.ocx.sh is a b-cdn-like host: it must answer noindex', async () => {
    expect((await run('prod', { host: 'next.ocx.sh' })).code).toBe(0);
    const { code, err } = await run('prod', { host: 'next.ocx.sh', patch: { '/': { headers: {} } } });
    expect(code).toBe(1);
    expect(err.trim()).toBe('FAIL default /: X-Robots-Tag has no noindex');
  });

  it('ocx.sh must not answer noindex, and may answer without it', async () => {
    expect((await run('prod', { host: 'ocx.sh', indexable: true })).code).toBe(0);
    const { code, err } = await run('prod', { host: 'ocx.sh' });
    expect(code).toBe(1);
    expect(err).toContain('X-Robots-Tag has noindex on the public host');
  });

  it('exits 2 for a host the zone does not serve', async () => {
    const err: string[] = [];
    const code = await main({ argv: ['--zone', 'dev', '--host', 'ocx.sh'], out: () => {}, err: (t) => err.push(t) });
    expect([code, err.join('')]).toEqual([2, expect.stringContaining('not a host of zone dev')]);
  });
});

describe('arguments', () => {
  it.each([[['--zone', 'staging']], [[]], [['--zone', 'dev', '--bogus']]])(
    'exits 2 on %j without a request',
    async (argv) => {
      const err: string[] = [];
      let called = 0;
      const code = await main({
        argv,
        out: () => {},
        err: (t) => err.push(t),
        fetch: () => (called++, Promise.reject(new Error('no'))),
      });
      expect(code).toBe(2);
      expect(called).toBe(0);
    },
  );
});

describe('index (wire) zone probes', () => {
  async function wire(over: Record<string, Reply> = {}, argv: string[] = []) {
    const etag = '"abc"';
    server = createServer((req, res) => {
      const path = req.url!;
      let reply: Reply = { status: 404 };
      if (path === '/config.json')
        reply =
          req.headers['if-none-match'] === etag
            ? { status: 304 }
            : {
                status: 200,
                headers: { 'content-type': 'application/json', etag, 'access-control-allow-origin': '*' },
              };
      else if (path === '/c/index.json') reply = { status: 200 };
      else if (path === '/') reply = { status: 301, headers: { location: 'https://ocx.sh/catalog/' } };
      else if (path.startsWith('/p/')) reply = { status: 200, headers: { 'content-security-policy': 'sandbox' } };
      reply = { ...reply, ...over[path] };
      res.writeHead(reply.status ?? 200, reply.headers);
      res.end(reply.body ?? '{}');
    });
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
    const out: string[] = [];
    const err: string[] = [];
    const code = await main({
      argv: ['--zone', 'index', ...argv],
      out: (t) => out.push(t),
      err: (t) => err.push(t),
      baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    });
    return { code, out: out.join(''), err: err.join('') };
  }

  it('passes on a correct host and probes sharkdp/bat by default', async () => {
    const r = await wire();
    expect([r.code, r.out]).toEqual([0, 'sh-ocx-index-edge.b-cdn.net: 4 probes, 0 failed\n']);
  });

  it('takes the sample package by flag', async () => {
    const r = await wire({ '/p/a/b.json': { status: 404 } }, ['--package', 'a/b']);
    expect(r.code).toBe(1);
    expect(r.err).toContain('FAIL wire /p/a/b.json: status 404');
  });

  it.each([
    [
      'no CORS',
      '/config.json',
      { status: 200, headers: { 'content-type': 'application/json', etag: '"abc"' } },
      'Access-Control-Allow-Origin',
    ],
    [
      'no ETag',
      '/config.json',
      { status: 200, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' } },
      'no ETag',
    ],
    ['no sandbox', '/p/sharkdp/bat.json', { status: 200, headers: {} }, 'Content-Security-Policy'],
    ['no catalog redirect', '/', { status: 200, headers: {} }, 'expected 301'],
    ['wrong Location', '/', { status: 301, headers: { location: 'https://ocx.sh/' } }, 'Location is'],
    ['index 500', '/c/index.json', { status: 500 }, 'status 500'],
  ])('fails on %s', async (_n, path, reply, msg) => {
    const r = await wire({ [path]: reply });
    expect(r.code).toBe(1);
    expect(r.err).toContain(msg);
  });

  it('rejects a malformed --package', async () => {
    const r = await wire({}, ['--package', '../x']);
    expect(r.code).toBe(2);
  });
});
