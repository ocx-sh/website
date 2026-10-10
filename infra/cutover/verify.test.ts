// `cutover:verify` per-host checks: each runs green on a good fake site and red on a fake that
// breaks only that check. Fakes are `node:http` servers on loopback; no real network.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  checkCertificate,
  checkHomeLink,
  checkRobots,
  createContext,
  DOCS_PAGE,
  HSTS,
  httpFetch,
  main,
  parseOldUrls,
  peerCertExpiry,
  pinnedFetch,
  REGISTRY_REALM,
  REGISTRY_SERVICE,
  registryRealm,
  type Fetch,
  type Resolver,
} from './verify.mjs';

type Route = { status: number; location?: string };

interface Site {
  hsts: string[];
  xfo: string[];
  robotsTag?: string;
  rootLocation?: string;
  linkHeader?: string;
  canonical: string;
  ogUrl: string;
  homeTarget: string;
  logoTarget: string;
  docsExtra: string;
  routes: Record<string, Route>;
  httpStatus: number;
  httpLocation?: string;
  pagefindCache: string;
  pagefindType: string;
  astroCache: string;
  astroLinked: boolean;
  robots: string;
  sitemapOk: boolean;
}

interface Index {
  configStatus: number;
  packageType: string;
  packageStatus: number;
}

interface Registry {
  v2Status: number;
  auth?: string | undefined;
  tokenStatus: number;
  docsV2Status: number;
  docsV2Auth?: string | undefined;
}

const TOKEN_PATH = new URL(REGISTRY_REALM).pathname;
const SITEMAP = 'https://ocx.sh/sitemap-index.xml';
const OLD_URLS = '# crawl\n/old-ok\n\n/old-moved\n/old-var\n/docs/\nhttps://ocx.sh/old-abs?x=1\n';

const goodSite = (): Site => ({
  hsts: [HSTS],
  xfo: ['SAMEORIGIN'],
  canonical: 'https://ocx.sh/',
  ogUrl: 'https://ocx.sh/',
  homeTarget: '_self',
  logoTarget: '_self',
  docsExtra: '<a href="https://someone.github.io/third-party/">a third-party site</a>',
  routes: {
    '/old-ok': { status: 200 },
    '/old-var': { status: 200 },
    '/old-abs': { status: 200 },
    '/old-moved': { status: 301, location: '/docs/' },
  },
  httpStatus: 301,
  pagefindCache: 'public, max-age=0',
  pagefindType: 'text/javascript; charset=utf-8',
  astroCache: 'public, max-age=31536000, immutable',
  astroLinked: true,
  robots: `User-agent: *\nAllow: /\nDisallow: /cdn-cgi/\nSitemap: ${SITEMAP}\n`,
  sitemapOk: true,
});

const goodRegistry = (): Registry => ({
  v2Status: 401,
  // JFrog names the request host in both; `{host}` is filled per request like X-JFrog-Override-Base-Url.
  auth: `Bearer realm="${registryRealm('{host}')}",service="{host}"`,
  tokenStatus: 200,
  docsV2Status: 404,
});

const goodIndex = (): Index => ({ configStatus: 200, packageType: 'application/json', packageStatus: 200 });

let site = goodSite();
let index = goodIndex();
let registry = goodRegistry();
let server: http.Server;
let port = 0;

function send(res: http.ServerResponse, status: number, headers: Record<string, string | string[]>, body = '') {
  res.writeHead(status, headers);
  res.end(body);
}

/** A stub that answers every call with `value`. */
const resolved =
  <T>(value: T) =>
  () =>
    Promise.resolve(value);

const BASELINE = readFileSync(new URL('./dns-baseline.json', import.meta.url), 'utf8');
const page = (head: string, body: string) => `<!doctype html><html><head>${head}</head><body>${body}</body></html>`;

function handle(req: http.IncomingMessage, res: http.ServerResponse) {
  const host = req.headers.host ?? '';
  const path = (req.url ?? '/').split('?')[0] ?? '/';
  if (host === 'index.ocx.sh') {
    if (path === '/config.json') return send(res, index.configStatus, { 'content-type': 'application/json' }, '{}');
    return send(res, index.packageStatus, { 'content-type': index.packageType }, '{}');
  }
  if (req.headers['x-test-scheme'] === 'http') {
    return send(res, site.httpStatus, { location: site.httpLocation ?? `https://${host}/` });
  }
  const route = site.routes[path];
  if (route) return send(res, route.status, route.location ? { location: route.location } : {}, 'ok');

  const ctype = { 'content-type': 'text/html' };
  switch (path) {
    case '/__dup':
      return send(res, 200, { 'x-dup': ['a', 'b'] });
    case '/':
      return send(
        res,
        200,
        {
          ...ctype,
          'strict-transport-security': site.hsts,
          'x-frame-options': site.xfo,
          ...(site.robotsTag ? { 'x-robots-tag': site.robotsTag } : {}),
          ...(site.rootLocation ? { location: site.rootLocation } : {}),
          ...(site.linkHeader ? { link: site.linkHeader } : {}),
        },
        page(
          `<link rel="canonical" href="${site.canonical}"><meta property="og:url" content="${site.ogUrl}">` +
            (site.astroLinked ? '<script src="/_astro/app.abc123.js"></script>' : ''),
          'home',
        ),
      );
    case '/docs/':
    case DOCS_PAGE:
      return send(
        res,
        200,
        ctype,
        page(
          '',
          `<a class="title" href="/" target="${site.logoTarget}">logo</a>` +
            `<a class="VPLink link VPNavBarMenuLink" href="/" target="${site.homeTarget}">Home</a>` +
            `<a class="VPLink link VPNavBarMenuLink" href="/docs/guide/" >Guide</a>${site.docsExtra}`,
        ),
      );
    case '/_astro/app.abc123.js':
      return send(res, 200, { 'content-type': 'text/javascript', 'cache-control': site.astroCache }, '//');
    case '/pagefind/pagefind.js':
      return send(res, 200, { 'content-type': site.pagefindType, 'cache-control': site.pagefindCache }, '//');
    case '/v2/':
      return send(
        res,
        registry.v2Status,
        registry.auth ? { 'www-authenticate': registry.auth.replaceAll('{host}', host) } : {},
        '{}',
      );
    case TOKEN_PATH:
      return send(res, registry.tokenStatus, { 'content-type': 'application/json' }, '{"token":"t"}');
    case '/docs/v2/':
      return send(
        res,
        registry.docsV2Status,
        registry.docsV2Auth ? { 'www-authenticate': registry.docsV2Auth } : {},
        '',
      );
    case '/robots.txt':
      return send(res, 200, { 'content-type': 'text/plain' }, site.robots);
    case '/sitemap-index.xml':
      return send(res, site.sitemapOk ? 200 : 404, { 'content-type': 'application/xml' }, '<sitemapindex/>');
    default:
      return send(res, 404, ctype, 'gone');
  }
}

/** Sends every request to the loopback fake with the original host and scheme as headers. */
const router =
  (only?: string[]): Fetch =>
  (url, init) => {
    const target = new URL(url);
    if (only && !only.includes(target.hostname)) return Promise.reject(new Error(`no route to ${target.hostname}`));
    return httpFetch(`http://127.0.0.1:${port}${target.pathname}${target.search}`, {
      ...init,
      headers: { ...init?.headers, host: target.hostname, 'x-test-scheme': target.protocol.slice(0, -1) },
    });
  };

interface Seams {
  fetch?: Fetch | null;
  oldUrls?: string | null;
  env?: Record<string, string | undefined>;
  baseline?: string | null;
  resolver?: Resolver;
  pinned?: (host: string, ip: string) => Fetch;
  cert?: (host: string, ip: string) => Promise<Date>;
}

interface Run {
  code: number;
  lines: string[];
  errors: string[];
  failed: string[];
  names: string[];
}

async function run(
  argv: string[],
  {
    fetch = router(),
    oldUrls = OLD_URLS,
    env = { OCX_OLD_URLS: 'list.txt' },
    baseline = BASELINE,
    resolver,
    pinned,
    cert,
  }: Seams = {},
): Promise<Run> {
  const lines: string[] = [];
  const errors: string[] = [];
  const code = await main({
    argv,
    env,
    ...(fetch ? { fetch } : {}),
    ...(resolver ? { resolver } : {}),
    ...(pinned ? { pinned } : {}),
    ...(cert ? { cert } : {}),
    out: (l) => lines.push(l),
    err: (l) => errors.push(l),
    readFile: (path) => {
      const text = path.endsWith('dns-baseline.json') ? baseline : oldUrls;
      return text === null ? Promise.reject(new Error(`ENOENT ${path}`)) : Promise.resolve(text);
    },
  });
  const nameOf = (l: string) => l.split(/[ :]+/)[1] ?? '';
  return {
    code,
    lines,
    errors,
    failed: lines.filter((l) => l.startsWith('FAIL')).map(nameOf),
    names: lines.map(nameOf),
  };
}

beforeAll(async () => {
  server = http.createServer(handle);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});
afterAll(() => {
  server.closeAllConnections();
  server.close();
});
beforeEach(() => {
  site = goodSite();
  index = goodIndex();
  registry = goodRegistry();
});

const OCX_CHECKS = [
  'old-urls',
  'origin-leak',
  'home-link',
  'noindex',
  'security-headers',
  'no-bunny-host',
  'http-redirect',
  'pagefind',
  'astro-asset',
  'robots',
  'index-json',
];

describe('ocx.sh', () => {
  it('is green on a good site: one ok line per check, exit 0', async () => {
    const r = await run(['--host', 'ocx.sh']);
    expect(r.lines).toEqual(OCX_CHECKS.map((n) => `ok   ${n}`));
    expect(r.code).toBe(0);
  });

  const breaks: [string, string, (s: Site) => void][] = [
    // old-urls: only the old-URL check goes red
    ['a chain', 'old-urls', (s) => void (s.routes['/old-var'] = { status: 301, location: '/old-moved' })],
    [
      'a loop',
      'old-urls',
      (s) => {
        s.routes['/old-var'] = { status: 302, location: '/old-loop' };
        s.routes['/old-loop'] = { status: 302, location: '/old-var' };
      },
    ],
    ['a self redirect', 'old-urls', (s) => void (s.routes['/old-var'] = { status: 301, location: '/old-var' })],
    ['a 404', 'old-urls', (s) => void (s.routes['/old-var'] = { status: 404 })],
    ['a 307', 'old-urls', (s) => void (s.routes['/old-var'] = { status: 307, location: '/docs/' })],
    ['a redirect without Location', 'old-urls', (s) => void (s.routes['/old-var'] = { status: 301 })],
    ['a redirect to a 404', 'old-urls', (s) => void (s.routes['/old-var'] = { status: 301, location: '/gone' })],
    // origin leaks
    // an off-site redirect is not followed: the walk reports it, the leak check skips redirect responses
    [
      'a pages.dev redirect',
      'old-urls',
      (s) => void (s.routes['/old-var'] = { status: 301, location: 'https://ocx-website.pages.dev/docs/' }),
    ],
    ['the origin literal in the docs body', 'origin-leak', (s) => void (s.docsExtra = 'see ocx-website.pages.dev')],
    [
      'a github.io Link header',
      'origin-leak',
      (s) => void (s.linkHeader = '<https://ocx-sh.github.io/x/>; rel="canonical"'),
    ],
    ['a pages.dev canonical', 'origin-leak', (s) => void (s.canonical = 'https://x.pages.dev/')],
    // home and logo links
    ['a Home link without _self', 'home-link', (s) => void (s.homeTarget = '_blank')],
    ['a logo link without _self', 'home-link', (s) => void (s.logoTarget = '_blank')],
    // noindex
    ['noindex on ocx.sh', 'noindex', (s) => void (s.robotsTag = 'noindex, nofollow')],
    // security headers
    ['a doubled HSTS', 'security-headers', (s) => void (s.hsts = [HSTS, HSTS])],
    ['a wrong HSTS value', 'security-headers', (s) => void (s.hsts = ['max-age=31536000'])],
    ['no HSTS', 'security-headers', (s) => void (s.hsts = [])],
    ['a folded HSTS pair', 'security-headers', (s) => void (s.hsts = [`${HSTS}, ${HSTS}`])],
    ['a doubled X-Frame-Options', 'security-headers', (s) => void (s.xfo = ['SAMEORIGIN', 'DENY'])],
    ['a folded X-Frame-Options pair', 'security-headers', (s) => void (s.xfo = ['SAMEORIGIN, SAMEORIGIN'])],
    ['no X-Frame-Options', 'security-headers', (s) => void (s.xfo = [])],
    // b-cdn.net in the public surface
    ['a b-cdn.net Location', 'no-bunny-host', (s) => void (s.rootLocation = 'https://sh-ocx.b-cdn.net/')],
    ['a b-cdn.net Link', 'no-bunny-host', (s) => void (s.linkHeader = '<https://sh-ocx.b-cdn.net/>; rel="preload"')],
    ['a b-cdn.net canonical', 'no-bunny-host', (s) => void (s.canonical = 'https://sh-ocx.b-cdn.net/')],
    ['a b-cdn.net og:url', 'no-bunny-host', (s) => void (s.ogUrl = 'https://sh-ocx.b-cdn.net/')],
    [
      'a b-cdn.net redirect target',
      'no-bunny-host',
      (s) => void (s.routes['/old-var'] = { status: 301, location: 'https://sh-ocx.b-cdn.net/docs/' }),
    ],
    // ocx.sh-only
    ['a 302 http redirect', 'http-redirect', (s) => void (s.httpStatus = 302)],
    ['an http page served in clear', 'http-redirect', (s) => void (s.httpStatus = 200)],
    ['an http redirect to another host', 'http-redirect', (s) => void (s.httpLocation = 'https://www.ocx.sh/')],
    ['pagefind.js cached', 'pagefind', (s) => void (s.pagefindCache = 'public, max-age=60')],
    ['pagefind.js served as HTML', 'pagefind', (s) => void (s.pagefindType = 'text/html')],
    ['a short /_astro/ max-age', 'astro-asset', (s) => void (s.astroCache = 'public, max-age=3600')],
    ['no /_astro/ asset', 'astro-asset', (s) => void (s.astroLinked = false)],
    [
      'Disallow: / in robots.txt',
      'robots',
      (s) => void (s.robots = `User-agent: *\nDisallow: /\nSitemap: ${SITEMAP}\n`),
    ],
    ['no Sitemap line', 'robots', (s) => void (s.robots = 'User-agent: *\nAllow: /\n')],
    ['a sitemap path that 404s', 'robots', (s) => void (s.sitemapOk = false)],
  ];

  it.each(breaks)('%s turns exactly %s red', async (_label, check, mutate) => {
    mutate(site);
    const r = await run(['--host', 'ocx.sh']);
    expect(r.failed).toEqual([check]);
    expect(r.code).toBe(1);
  });

  it.each([
    ['config.json redirects', (i: Index) => void (i.configStatus = 301)],
    ['the package JSON is HTML', (i: Index) => void (i.packageType = 'text/html')],
    ['the package JSON is gone', (i: Index) => void (i.packageStatus = 404)],
  ])('index.ocx.sh: %s turns index-json red', async (_label, mutate) => {
    mutate(index);
    expect((await run(['--host', 'ocx.sh'])).failed).toEqual(['index-json']);
  });

  describe('with /docs/ a 404, as on the live site', () => {
    const only = { oldUrls: '/old-ok\n' };
    beforeEach(() => void (site.routes['/docs/'] = { status: 404 }));

    it.each([
      ['origin-leak', 'see ocx-website.pages.dev'],
      ['no-bunny-host', '<link rel="canonical" href="https://sh-ocx.b-cdn.net/x">'],
    ])('a %s finding only in the docs page body is red', async (check, docsExtra) => {
      site.docsExtra = docsExtra;
      expect((await run(['--host', 'ocx.sh'], only)).failed).toEqual([check]);
    });
  });

  it('does not follow a redirect off the site, and its Location is not an origin leak', async () => {
    site.routes['/old-var'] = { status: 302, location: 'https://ocx-sh.github.io/x' };
    const urls: string[] = [];
    const inner = router();
    const r = await run(['--host', 'ocx.sh'], { fetch: (u, i) => (urls.push(u), inner(u, i)) });
    expect(r.failed).toEqual(['old-urls']);
    expect(r.lines.find((l) => l.startsWith('FAIL old-urls'))).toContain('github.io');
    expect(urls.some((u) => u.includes('github.io'))).toBe(false);
  });

  it('a Disallow of a sub-path is not a site-wide block', async () => {
    expect((await run(['--host', 'ocx.sh'])).failed).toEqual([]);
  });
});

// Trimmed from the live `https://ocx.sh/docs/getting-started` nav bar (VitePress 2.0.0-alpha.16),
// before the ocx change that sets `target: '_self'`; `selfed` is the same markup after it.
const LIVE_NAV =
  '<div class="VPNavBarTitle has-sidebar" data-v-1e38c6bc><a class="title" href="/" data-v-1e38c6bc><img class="VPImage logo" src="/logo.svg" alt><span>ocx</span></a></div>' +
  '<nav class="VPNavBarMenu menu"><a class="VPLink link VPNavBarMenuLink" href="/" tabindex="0" data-v-52a1d768><span>Home</span></a>' +
  '<a class="VPLink link VPNavBarMenuLink" href="/docs/roadmap" tabindex="0"><span>Roadmap</span></a>' +
  '<a class="VPLink link vp-external-link-icon no-icon VPNavBarMenuLink" href="https://index.ocx.sh" target="_self" rel="noreferrer"><span>Catalog</span></a></nav>';
const selfed = LIVE_NAV.replace('class="title" href="/"', 'class="title" href="/" target="_self"').replace(
  'VPNavBarMenuLink" href="/" tabindex',
  'VPNavBarMenuLink" href="/" target="_self" tabindex',
);

describe('the Home and logo links on the real VitePress markup', () => {
  const check = (nav: string) =>
    checkHomeLink(
      createContext({
        host: 'ocx.sh',
        fetch: resolved({ status: 200, headers: {}, body: page('', nav) }),
        readFile: resolved(''),
        oldUrlsPath: 'x',
      }),
    );

  it('is red on today\'s live markup: both links lack target="_self"', async () => {
    expect(await check(LIVE_NAV)).toEqual(['logo link lacks target="_self"', 'Home nav link lacks target="_self"']);
  });

  it('is green once both links carry target="_self"; the Catalog link is not a Home link', async () => {
    expect(await check(selfed)).toEqual([]);
  });
});

describe('a .b-cdn.net host', () => {
  const dev = ['--host', 'sh-ocx-dev.b-cdn.net'];

  it('runs only the host-independent checks and needs noindex', async () => {
    site.robotsTag = 'noindex, nofollow';
    site.hsts = [];
    site.xfo = [];
    const r = await run(dev);
    expect(r.names).toEqual(['old-urls', 'origin-leak', 'home-link', 'noindex', 'index-json']);
    expect(r.code).toBe(0);
  });

  it('missing noindex is red', async () => {
    expect((await run(dev)).failed).toEqual(['noindex']);
  });

  it('does not require the front-door headers or flag b-cdn.net in its own URLs', async () => {
    site.robotsTag = 'noindex';
    site.hsts = [HSTS, HSTS];
    site.canonical = 'https://sh-ocx-dev.b-cdn.net/';
    expect((await run(dev)).code).toBe(0);
  });

  it('fetches the sitemap path on the host, not the literal ocx.sh URL', async () => {
    const reach = router(['sh-ocx-dev.b-cdn.net']);
    const make = () =>
      createContext({ host: 'sh-ocx-dev.b-cdn.net', fetch: reach, readFile: resolved(''), oldUrlsPath: 'x' });
    expect(await checkRobots(make())).toEqual([]);
    site.sitemapOk = false;
    expect(await checkRobots(make())).toHaveLength(1);
  });
});

describe('the rehearsal host next.ocx.sh', () => {
  const next = ['--host', 'next.ocx.sh'];
  beforeEach(() => void (site.robotsTag = 'noindex'));

  it('is green with noindex, with HSTS and X-Frame-Options once, and skips the ocx.sh-only checks', async () => {
    const r = await run(next);
    expect(r.names).toEqual([
      'old-urls',
      'origin-leak',
      'home-link',
      'noindex',
      'security-headers',
      'no-bunny-host',
      'index-json',
    ]);
    expect(r.code).toBe(0);
  });

  it.each([
    ['missing noindex', 'noindex', (s: Site) => void delete s.robotsTag],
    ['a doubled HSTS', 'security-headers', (s: Site) => void (s.hsts = [HSTS, HSTS])],
    ['a b-cdn.net redirect', 'no-bunny-host', (s: Site) => void (s.rootLocation = 'https://sh-ocx.b-cdn.net/')],
  ])('%s turns %s red', async (_label, check, mutate) => {
    mutate(site);
    expect((await run(next)).failed).toEqual([check]);
  });
});

describe('the nginx rehearsal host edge.ocx.sh', () => {
  const edge = ['--host', 'edge.ocx.sh', '--registry'];

  it('is green without noindex: nginx sends Host ocx.sh, so no noindex rule applies', async () => {
    expect((await run(edge)).code).toBe(0);
  });

  it('noindex on it turns noindex red', async () => {
    site.robotsTag = 'noindex';
    expect((await run(edge)).failed).toEqual(['noindex']);
  });
});

describe('the old-URL list', () => {
  it('is read from OCX_OLD_URLS, else infra/old-urls.txt', async () => {
    const paths: string[] = [];
    const base = { argv: ['--host', 'ocx.sh'], out: () => {}, err: () => {}, fetch: router() };
    await main({ ...base, env: {}, readFile: (p) => (paths.push(p), Promise.resolve('')) });
    await main({ ...base, env: { OCX_OLD_URLS: 'x.txt' }, readFile: (p) => (paths.push(p), Promise.resolve('')) });
    expect(paths).toEqual(['infra/old-urls.txt', 'x.txt']);
  });

  it('a missing file is red, never silently green', async () => {
    const r = await run(['--host', 'ocx.sh'], { oldUrls: null });
    expect(r.failed).toEqual(['old-urls']);
    expect(r.lines.find((l) => l.startsWith('FAIL old-urls'))).toContain('cannot read');
  });

  it('parses paths, absolute URLs, comments and blanks; rejects anything else', () => {
    expect(parseOldUrls('# c\n\n/a\nhttps://ocx.sh/b?x=1\n  /c  \n')).toEqual(['/a', '/b?x=1', '/c']);
    expect(() => parseOldUrls('/a\nnot-a-path')).toThrow(/line 2/);
  });
});

describe('main', () => {
  it.each([
    [[]],
    [['--host']],
    [['--host', 'a b']],
    [['--host', 'ocx.sh', '--bogus']],
    [['--host', 'ocx.sh', 'extra']],
  ])('usage error %j exits 2 with no request', async (argv) => {
    let requests = 0;
    const r = await run(argv, { fetch: () => (requests++, Promise.reject(new Error('no network'))) });
    expect(r.code).toBe(2);
    expect(requests).toBe(0);
    expect(r.errors.join()).toContain('usage');
  });

  it.each([[['--resolve']], [['--resolve', 'ocx.sh']], [['--resolve', '']], [['--dns=yes']]])(
    'a malformed mode flag %j exits 2 with no request',
    async (flag) => {
      let requests = 0;
      const r = await run(['--host', 'ocx.sh', ...flag], {
        fetch: () => (requests++, Promise.reject(new Error('no'))),
      });
      expect(r.code).toBe(2);
      expect(requests).toBe(0);
    },
  );

  it('a transport failure is a red check, not a crash', async () => {
    const r = await run(['--host', 'ocx.sh'], { fetch: () => Promise.reject(new Error('connect ECONNREFUSED')) });
    expect(r.code).toBe(1);
    expect(r.failed).toEqual(OCX_CHECKS);
    expect(r.lines.join('\n')).toContain('ECONNREFUSED');
  });
});

describe('httpFetch', () => {
  it('keeps a repeated header as an array and does not follow redirects', async () => {
    const dup = await httpFetch(`http://127.0.0.1:${port}/__dup`);
    expect(dup.headers['x-dup']).toEqual(['a', 'b']);
    const moved = await httpFetch(`http://127.0.0.1:${port}/old-moved`);
    expect(moved.status).toBe(301);
    expect(moved.headers['location']).toBe('/docs/');
  });
});

const REGISTRY_CHECKS = ['registry-challenge', 'registry-token', 'docs-v2'];

describe('--registry', () => {
  const argv = ['--host', 'ocx.sh', '--registry'];

  it('is green when /v2/ is the JFrog challenge, the token answers and /docs/v2/ is a docs path', async () => {
    const r = await run(argv);
    expect(r.lines).toEqual([...OCX_CHECKS, ...REGISTRY_CHECKS].map((n) => `ok   ${n}`));
    expect(r.code).toBe(0);
  });

  it('asks the token endpoint of the realm path with the service', async () => {
    const urls: string[] = [];
    const inner = router();
    await run(argv, { fetch: (u, i) => (urls.push(u), inner(u, i)) });
    expect(urls).toContain(`https://ocx.sh${TOKEN_PATH}?service=${REGISTRY_SERVICE}`);
  });

  const breaks: [string, string, (r: Registry) => void][] = [
    [
      '/v2/ answered by the site (404, no challenge)',
      'registry-challenge',
      (r) => ((r.v2Status = 404), (r.auth = undefined)),
    ],
    ['/v2/ answering 200', 'registry-challenge', (r) => void (r.v2Status = 200)],
    [
      'a changed realm',
      'registry-challenge',
      (r) => void (r.auth = `Bearer realm="https://sh-ocx.b-cdn.net/token",service="${REGISTRY_SERVICE}"`),
    ],
    [
      'a changed service',
      'registry-challenge',
      (r) => void (r.auth = `Bearer realm="${REGISTRY_REALM}",service="other"`),
    ],
    ['a Basic challenge', 'registry-challenge', (r) => void (r.auth = `Basic realm="${REGISTRY_REALM}"`)],
    ['a token endpoint 401', 'registry-token', (r) => void (r.tokenStatus = 401)],
    ['a token endpoint 404', 'registry-token', (r) => void (r.tokenStatus = 404)],
    [
      'a JFrog 401 on /docs/v2/',
      'docs-v2',
      (r) => ((r.docsV2Status = 401), (r.docsV2Auth = `Bearer realm="${REGISTRY_REALM}"`)),
    ],
    ['a bare 401 on /docs/v2/', 'docs-v2', (r) => void (r.docsV2Status = 401)],
    ['a challenge header on /docs/v2/', 'docs-v2', (r) => void (r.docsV2Auth = 'Bearer realm="x"')],
  ];

  it.each(breaks)('%s turns exactly %s red', async (_label, check, mutate) => {
    mutate(registry);
    const r = await run(argv);
    expect(r.failed).toEqual([check]);
    expect(r.code).toBe(1);
  });

  it('a 200 on /docs/v2/ is fine', async () => {
    registry.docsV2Status = 200;
    expect((await run(argv)).code).toBe(0);
  });
});

describe('the rehearsal host next.ocx.sh with --registry', () => {
  const next = ['--host', 'next.ocx.sh', '--registry'];
  beforeEach(() => void (site.robotsTag = 'noindex'));
  const NEXT_CHECKS = [
    'old-urls',
    'origin-leak',
    'home-link',
    'noindex',
    'security-headers',
    'no-bunny-host',
    'index-json',
  ];

  it('is green: the realm and service name next.ocx.sh, the host the fake nginx front answers on', async () => {
    const r = await run(next);
    expect(r.names).toEqual([...NEXT_CHECKS, ...REGISTRY_CHECKS]);
    expect(r.code).toBe(0);
  });

  it.each([
    ['a doubled HSTS', 'security-headers', (s: Site) => void (s.hsts = [HSTS, HSTS])],
    ['a b-cdn.net redirect', 'no-bunny-host', (s: Site) => void (s.rootLocation = 'https://sh-ocx.b-cdn.net/')],
  ])('%s turns exactly %s red', async (_label, check, mutate) => {
    mutate(site);
    const r = await run(next);
    expect(r.failed).toEqual([check]);
    expect(r.code).toBe(1);
  });

  it('a realm naming ocx.sh on another host is red', async () => {
    registry.auth = `Bearer realm="${REGISTRY_REALM}",service="${REGISTRY_SERVICE}"`;
    expect((await run(next)).failed).toEqual(['registry-challenge']);
  });

  it('/v2/ answered by Bunny is red', async () => {
    registry.v2Status = 404;
    registry.auth = undefined;
    expect((await run(next)).failed).toEqual(['registry-challenge']);
  });
});

describe('--dns', () => {
  const argv = ['--host', 'ocx.sh', '--dns'];
  const baseline = JSON.parse(BASELINE) as { host: string; MX: string[]; TXT: string[] };
  const mx = baseline.MX.map((m) => ({ priority: Number(m.split(' ')[0]), exchange: `${m.split(' ')[1]}.` }));
  const txt = baseline.TXT.map((t) => [t]);

  let queried: string[] = [];
  let live: { mx: Resolver['resolveMx']; txt: Resolver['resolveTxt'] };
  const resolver: Resolver = {
    resolveMx: (h) => (queried.push(`MX ${h}`), live.mx(h)),
    resolveTxt: (h) => (queried.push(`TXT ${h}`), live.txt(h)),
  };
  beforeEach(() => {
    queried = [];
    live = { mx: resolved(mx), txt: resolved(txt) };
  });

  it('the committed baseline names ocx.sh with MX and an SPF TXT', () => {
    expect(baseline.host).toBe('ocx.sh');
    expect(baseline.MX.length).toBeGreaterThan(0);
    expect(baseline.TXT.some((t) => t.startsWith('v=spf1'))).toBe(true);
  });

  it('is green when MX and TXT equal the baseline, whatever the order, case, trailing dot or TXT chunking', async () => {
    live = {
      mx: resolved([...mx].reverse().map((m) => ({ ...m, exchange: m.exchange.toUpperCase() }))),
      txt: resolved(baseline.TXT.map((t) => [t.slice(0, 7), t.slice(7)])),
    };
    const r = await run(argv, { resolver });
    expect(r.lines.at(-1)).toBe('ok   dns');
    expect(r.code).toBe(0);
    expect(queried.sort()).toEqual(['MX ocx.sh', 'TXT ocx.sh']);
  });

  const breaks: [string, () => void, string][] = [
    ['an MX gone', () => void (live.mx = resolved(mx.slice(1))), 'MX lost'],
    [
      'an MX added',
      () => void (live.mx = resolved([...mx, { priority: 5, exchange: 'mx.new.example.' }])),
      'MX gained',
    ],
    [
      'an MX priority changed',
      () => void (live.mx = resolved(mx.map((m) => ({ ...m, priority: m.priority + 1 })))),
      'MX lost',
    ],
    ['a TXT changed', () => void (live.txt = resolved([['v=spf1 -all']])), 'TXT lost'],
    ['a TXT added', () => void (live.txt = resolved([...txt, ['google-site-verification=x']])), 'TXT gained'],
    [
      'no TXT at all (ENODATA)',
      () =>
        void (live.txt = () =>
          Promise.reject(Object.assign(new Error('queryTxt ENODATA ocx.sh'), { code: 'ENODATA' }))),
      'TXT lost',
    ],
  ];

  it.each(breaks)('%s turns exactly dns red', async (_label, mutate, detail) => {
    mutate();
    const r = await run(argv, { resolver });
    expect(r.failed).toEqual(['dns']);
    expect(r.lines.find((l) => l.startsWith('FAIL dns'))).toContain(detail);
    expect(r.code).toBe(1);
  });

  it('a resolver failure is red with its message, not a crash', async () => {
    live.mx = () => Promise.reject(new Error('querySrv SERVFAIL'));
    const r = await run(argv, { resolver });
    expect(r.failed).toEqual(['dns']);
    expect(r.lines.join('\n')).toContain('SERVFAIL');
  });

  it.each([
    ['a missing baseline file', null, 'cannot read'],
    ['an unparsable baseline', '{', 'cannot read'],
    ['a baseline without TXT', '{"host":"ocx.sh","MX":[]}', 'needs host, MX and TXT'],
  ])('%s is red', async (_label, content, detail) => {
    const r = await run(argv, { resolver, baseline: content });
    expect(r.failed).toEqual(['dns']);
    expect(r.lines.find((l) => l.startsWith('FAIL dns'))).toContain(detail);
  });
});

describe('flags combine', () => {
  it('adds the certificate, dns and registry checks after the per-host ones', async () => {
    const baseline = JSON.parse(BASELINE) as { MX: string[]; TXT: string[] };
    const resolver: Resolver = {
      resolveMx: resolved(
        baseline.MX.map((m) => ({ priority: Number(m.split(' ')[0]), exchange: m.split(' ')[1] ?? '' })),
      ),
      resolveTxt: resolved(baseline.TXT.map((t) => [t])),
    };
    const r = await run(['--host', 'ocx.sh', '--registry', '--dns', '--resolve', '203.0.113.7'], {
      resolver,
      cert: resolved(new Date(Date.now() + 90 * 86_400_000)),
    });
    expect(r.names).toEqual([...OCX_CHECKS, 'certificate', 'dns', ...REGISTRY_CHECKS]);
    expect(r.code).toBe(0);
  });
});

describe('checkCertificate', () => {
  const days = (n: number) => () => Promise.resolve(new Date(Date.now() + n * 86_400_000));
  const check = (certExpiry: () => Promise<Date>) =>
    checkCertificate(
      createContext({ host: 'ocx.sh', fetch: router(), readFile: resolved(''), oldUrlsPath: 'x', certExpiry }),
    );

  it('is green above 30 days and red at or below, expired or unreadable', async () => {
    expect(await check(days(31))).toEqual([]);
    expect(await check(days(29))).toHaveLength(1);
    expect(await check(days(30))).toHaveLength(1);
    expect(await check(days(-3))).toEqual([expect.stringContaining('expires in 0 days')]);
    expect(await check(resolved(new Date('nonsense')))).toEqual([expect.stringContaining('unreadable')]);
  });

  it('is red with the probe error when the certificate cannot be read', async () => {
    await expect(check(() => Promise.reject(new Error('handshake failed')))).rejects.toThrow('handshake failed');
    const r = await run(['--host', 'ocx.sh', '--resolve', '203.0.113.7'], {
      cert: () => Promise.reject(new Error('handshake failed')),
    });
    expect(r.failed).toEqual(['certificate']);
    expect(r.lines.join('\n')).toContain('handshake failed');
  });
});

// Real TLS: certificates are generated with the `openssl` binary at test time (no dependency).
describe('--resolve against TLS fakes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'verify-tls-'));
  const PIN = '127.0.0.2';
  const DAY = 86_400_000;

  const makeCert = (name: string, days: number, san: string) => {
    const key = join(dir, `${name}.key`);
    const crt = join(dir, `${name}.crt`);
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'ec',
        '-pkeyopt',
        'ec_paramgen_curve:prime256v1',
        '-nodes',
        '-keyout',
        key,
        '-out',
        crt,
        '-days',
        String(days),
        '-subj',
        `/CN=${name}`,
        '-addext',
        `subjectAltName=${san}`,
      ],
      { stdio: 'ignore' },
    );
    return { key: readFileSync(key, 'utf8'), cert: readFileSync(crt, 'utf8') };
  };

  const servers: (http.Server | https.Server)[] = [];
  const listen = <S extends http.Server | https.Server>(s: S, host: string) =>
    new Promise<{ server: S; port: number }>((resolve) => {
      servers.push(s);
      s.listen(0, host, () => resolve({ server: s, port: (s.address() as AddressInfo).port }));
    });

  let good: ReturnType<typeof makeCert>;
  let ca = '';
  const seen: { sni: string | undefined; host: string | undefined }[] = [];
  let front: { port: number };
  let plain: { port: number };
  let second: { port: number };
  let short: { port: number };
  let foreign: { port: number };
  let hopTarget = '';

  beforeAll(async () => {
    good = makeCert('ocx.sh', 365, 'DNS:ocx.sh,DNS:next.ocx.sh,DNS:localhost');
    ca = good.cert;
    // The pinned address only: the second host must not be reachable through it.
    front = await listen(
      https.createServer(good, (req, res) => {
        seen.push({
          sni: (req.socket as import('node:tls').TLSSocket).servername || undefined,
          host: req.headers.host,
        });
        if (req.url === '/hop') return send(res, 302, { location: hopTarget });
        handle(req, res);
      }),
      PIN,
    );
    plain = await listen(
      http.createServer((req, res) => send(res, site.httpStatus, { location: `https://${req.headers.host}/` })),
      PIN,
    );
    second = await listen(
      https.createServer(good, (_req, res) => send(res, 200, {}, 'second')),
      '127.0.0.1',
    );
    short = await listen(
      https.createServer(makeCert('short', 10, 'DNS:ocx.sh'), (_q, res) => send(res, 200, {}, '')),
      PIN,
    );
    foreign = await listen(
      https.createServer(makeCert('foreign', 365, 'DNS:other.example'), (_q, res) => send(res, 200, {}, '')),
      PIN,
    );
    hopTarget = `https://localhost:${second.port}/landed`;
  });
  afterAll(() => {
    for (const s of servers) {
      s.closeAllConnections();
      s.close();
    }
    rmSync(dir, { recursive: true, force: true });
  });
  beforeEach(() => void (seen.length = 0));

  const ports = () => ({ https: front.port, http: plain.port });

  it('pinnedFetch reaches only the pinned host through the pin: a redirect to a second host uses normal lookup', async () => {
    const fetch = pinnedFetch({ host: 'ocx.sh', ip: PIN, ca, ports: ports() });
    const hop = await fetch('https://ocx.sh/hop');
    expect(hop.status).toBe(302);
    // localhost resolves to 127.0.0.1, where only the second fake listens; the pin (127.0.0.2) would be refused.
    const landed = await fetch(new URL(hop.headers['location'] as string, 'https://ocx.sh/').href);
    expect(landed).toMatchObject({ status: 200, body: 'second' });
    expect(seen.map((s) => s.host)).toEqual(['ocx.sh']);
  });

  it('pinnedFetch sends SNI and Host as the host, and uses the port override only for portless URLs of that host', async () => {
    const fetch = pinnedFetch({ host: 'ocx.sh', ip: PIN, ca, ports: ports() });
    expect((await fetch('https://ocx.sh/robots.txt')).status).toBe(200);
    expect(seen).toEqual([{ sni: 'ocx.sh', host: 'ocx.sh' }]);
    expect((await fetch(`https://ocx.sh:${front.port}/robots.txt`)).status).toBe(200);
    expect((await fetch('http://ocx.sh/')).status).toBe(301);
  });

  it('pinnedFetch lets an unpinned host fail by itself rather than reach the pinned server', async () => {
    const fetch = pinnedFetch({ host: 'ocx.sh', ip: PIN, ca, ports: ports() });
    await expect(fetch(`https://localhost:${front.port}/robots.txt`)).rejects.toThrow();
    expect(seen).toEqual([]);
  });

  it('peerCertExpiry reads the served certificate through the pin, with SNI as the host', async () => {
    const expiry = await peerCertExpiry({ host: 'ocx.sh', ip: PIN, port: front.port, ca });
    const days = (expiry.getTime() - Date.now()) / DAY;
    expect(days).toBeGreaterThan(360);
    expect(days).toBeLessThan(366);
  });

  it('peerCertExpiry rejects a certificate that is not valid for the host', async () => {
    await expect(peerCertExpiry({ host: 'ocx.sh', ip: PIN, port: foreign.port, ca: trusted() })).rejects.toThrow();
  });
  const trusted = () =>
    ['ocx.sh', 'short', 'foreign'].map((n) => readFileSync(join(dir, `${n}.crt`), 'utf8')).join('\n');

  // The whole check set against a fake that sits at the pinned IP while ocx.sh resolves elsewhere.
  const rehearse = (certPort: () => number) => ({
    pinned: (host: string, ip: string): Fetch => {
      const real = pinnedFetch({ host, ip, ca, ports: ports() });
      // index.ocx.sh is an unpinned host; a stub keeps the test off the network.
      return (url, init) =>
        new URL(url).hostname === 'index.ocx.sh'
          ? Promise.resolve({ status: 200, headers: { 'content-type': 'application/json' }, body: '{}' })
          : real(url, init);
    },
    cert: (host: string, ip: string) => peerCertExpiry({ host, ip, port: certPort(), ca: trusted() }),
  });
  const argv = ['--host', 'ocx.sh', '--resolve', PIN];

  it('pinned run: every check is green against the pinned fake, certificate included', async () => {
    const r = await run(argv, { ...rehearse(() => front.port), fetch: null });
    expect(r.lines).toEqual([...OCX_CHECKS, 'certificate'].map((n) => `ok   ${n}`));
    expect(r.code).toBe(0);
    expect(seen.length).toBeGreaterThan(0);
    expect(new Set(seen.map((s) => `${s.sni} ${s.host}`))).toEqual(new Set(['ocx.sh ocx.sh']));
  });

  it('pinned run: a certificate with 10 days left turns exactly certificate red', async () => {
    const r = await run(argv, { ...rehearse(() => short.port), fetch: null });
    expect(r.failed).toEqual(['certificate']);
    expect(r.lines.find((l) => l.startsWith('FAIL certificate'))).toContain('expires in 9 days');
  });

  it('pinned run: a certificate for another name turns exactly certificate red', async () => {
    const r = await run(argv, { ...rehearse(() => foreign.port), fetch: null });
    expect(r.failed).toEqual(['certificate']);
  });

  it('pinned run: a broken check is still red through the pin', async () => {
    site.hsts = [HSTS, HSTS];
    const r = await run(argv, { ...rehearse(() => front.port), fetch: null });
    expect(r.failed).toEqual(['security-headers']);
  });
});
