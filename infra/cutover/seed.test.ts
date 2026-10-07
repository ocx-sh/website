// `bunny:old-urls` against a fake site graph on loopback: the cap, the same-host filter, the
// today-healthy filter, determinism and the registry-prefix skip. No real network.
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { crawl, liveGet, main } from './seed.mjs';

interface Node {
  status?: number;
  location?: string;
  html?: string;
  type?: string;
}

const page = (...hrefs: string[]) => hrefs.map((h) => `<a href="${h}">x</a>`).join('');

let graph: Record<string, Node> = {};
let requested: string[] = [];
let server: http.Server;
let origin = '';

const goodGraph = (): Record<string, Node> => ({
  '/': {
    html:
      page(
        '/docs/getting-started',
        '/docs/roadmap',
        '/old-moved',
        '/chain',
        '/broken',
        '/v2/',
        '/v2/ocx/manifests/1',
        '/artifactory/x',
        '/docs/v2/',
        '/cdn-cgi/scripts/x.js',
      ) +
      `<link rel="icon" href="/logo.svg"><script src='/assets/app.js'></script><img src=/img/a.png>` +
      `<a href="https://elsewhere.invalid/x">out</a><a href="//elsewhere.invalid/y">out</a><a href="mailto:a@b.c">m</a>` +
      page('/docs/getting-started#top', '/search?q=a&amp;b=1'),
  },
  '/docs/': { status: 404 },
  '/docs/getting-started': { html: page('/docs/roadmap', '/') },
  '/docs/roadmap': { html: page('/docs/deep') },
  '/docs/deep': { html: '' },
  '/docs/v2/': { html: '' },
  '/old-moved': { status: 308, location: '/docs/roadmap' },
  '/chain': { status: 301, location: '/old-moved' },
  '/broken': { status: 500 },
  '/logo.svg': { type: 'image/svg+xml', html: '<svg/>' },
  '/assets/app.js': { type: 'text/javascript', html: 'x' },
  '/img/a.png': { type: 'image/png', html: '' },
  '/search': { html: '' },
});

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const path = req.url ?? '/';
    requested.push(`${req.method} ${req.headers.host} ${path}`);
    const node = graph[path.split('#')[0]?.split('?')[0] ?? ''];
    if (!node) return void res.writeHead(404).end();
    res.writeHead(node.status ?? 200, {
      'content-type': node.type ?? 'text/html',
      ...(node.location ? { location: node.location } : {}),
    });
    res.end(node.html ?? '');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
});
afterAll(() => {
  server.closeAllConnections();
  server.close();
});
beforeEach(() => {
  graph = goodGraph();
  requested = [];
});

const run = (options: { cap?: number; concurrency?: number } = {}) => crawl({ origin, get: liveGet, ...options });

describe('crawl', () => {
  it('keeps healthy same-host URLs and every asset, sorted, and drops the unhealthy', async () => {
    const { urls, dropped } = await run();
    expect(urls).toEqual([
      '/',
      '/assets/app.js',
      '/docs/deep',
      '/docs/getting-started',
      '/docs/roadmap',
      '/docs/v2/',
      '/img/a.png',
      '/logo.svg',
      '/old-moved',
      '/search?q=a&b=1',
    ]);
    // /docs/ (404), /chain (a chain) and /broken (500)
    expect(dropped).toBe(3);
  });

  it('never requests another host, a registry prefix, a fragment or anything but GET', async () => {
    await run();
    expect(
      requested.some(
        (r) => r.includes('elsewhere') || r.includes('/v2/ocx') || r.includes('/artifactory') || r.includes('/cdn-cgi'),
      ),
    ).toBe(false);
    expect(requested.filter((r) => /\s\/v2\/?$/.test(r))).toEqual([]);
    expect(requested.some((r) => r.includes('#'))).toBe(false);
    expect(requested.every((r) => r.startsWith('GET '))).toBe(true);
  });

  it('skips /v2/, /artifactory/ and /cdn-cgi/ but not /docs/v2/', async () => {
    const { urls } = await run();
    expect(urls.filter((u) => u.startsWith('/v2') || u.startsWith('/artifactory') || u.startsWith('/cdn-cgi'))).toEqual(
      [],
    );
    expect(urls).toContain('/docs/v2/');
  });

  it('drops a URL that redirects to a redirect, a loop, a 404 or a redirect without Location', async () => {
    graph['/a'] = { status: 301, location: '/gone' };
    graph['/b'] = { status: 301, location: '/b' };
    graph['/c'] = { status: 302 };
    graph['/d'] = { status: 307, location: '/docs/roadmap' };
    graph['/'] = { html: page('/a', '/b', '/c', '/d') };
    expect((await run()).urls).toEqual(['/']);
  });

  it('follows a redirect only to the origin, ocx.sh or a Bunny host', async () => {
    graph['/off'] = { status: 301, location: 'http://elsewhere.invalid/x' };
    graph['/bunny'] = { status: 301, location: 'http://sh-ocx.b-cdn.net/x' };
    graph['/'] = { html: page('/off', '/bunny') };
    const asked: string[] = [];
    const get: typeof liveGet = (url) => (
      asked.push(url),
      url.startsWith(origin) ? liveGet(url) : Promise.resolve({ status: 404, location: undefined, html: '' })
    ); // off-origin stub: never the network
    expect((await crawl({ origin, get })).urls).toEqual(['/']);
    expect(asked.some((u) => u.includes('elsewhere'))).toBe(false);
    expect(asked.some((u) => u.includes('sh-ocx.b-cdn.net'))).toBe(true);
  });

  it('stops at the cap and keeps the same URLs on every run, whatever the concurrency', async () => {
    graph = {
      '/docs/': { html: '' },
      '/': { html: page(...Array.from({ length: 50 }, (_, i) => `/p${String(i).padStart(2, '0')}`)) },
    };
    for (let i = 0; i < 50; i++) graph[`/p${String(i).padStart(2, '0')}`] = { html: '' };
    const runs = await Promise.all([
      run({ cap: 12, concurrency: 1 }),
      run({ cap: 12, concurrency: 8 }),
      run({ cap: 12 }),
    ]);
    for (const { urls } of runs) {
      expect(urls).toHaveLength(12);
      expect(urls).toEqual(runs[0]?.urls);
    }
    expect(runs[0]?.urls.slice(0, 3)).toEqual(['/', '/docs/', '/p00']);
  });

  it('is deterministic without a cap', async () => {
    expect(await run({ concurrency: 1 })).toEqual(await run({ concurrency: 8 }));
  });
});

describe('main', () => {
  const go = async (argv: string[], env: Record<string, string | undefined> = {}, previous?: string) => {
    const written: Record<string, string> = {};
    const lines: string[] = [];
    const errors: string[] = [];
    const code = await main({
      argv,
      env,
      out: (l) => lines.push(l),
      err: (l) => errors.push(l),
      writeFile: (p, t) => {
        written[p] = t;
        return Promise.resolve();
      },
      readFile: (p) => (previous === undefined ? Promise.reject(new Error(`ENOENT ${p}`)) : Promise.resolve(previous)),
    });
    return { code, lines, errors, written };
  };

  it('writes the sorted list with a comment header and reports the counts', async () => {
    const r = await go(['--origin', origin, '--out', 'list.txt']);
    expect(r.code).toBe(0);
    expect(r.lines).toEqual(['10 URLs written to list.txt, 3 dropped as unhealthy']);
    const lines = r.written['list.txt']?.split('\n') ?? [];
    expect(lines[0]).toMatch(/^# /);
    expect(lines.slice(1, -1)).toEqual((await run()).urls);
  });

  it('takes the file from OCX_OLD_URLS when --out is absent', async () => {
    expect(Object.keys((await go(['--origin', origin], { OCX_OLD_URLS: 'env.txt' })).written)).toEqual(['env.txt']);
  });

  it('writes nothing and exits 1 when nothing is healthy', async () => {
    graph = {};
    const r = await go(['--origin', origin]);
    expect(r.code).toBe(1);
    expect(r.written).toEqual({});
  });

  describe('a shrunken crawl', () => {
    const list = async () => `# header\n${(await run()).urls.join('\n')}\n`;
    const old = (extra: number) => `# header\n${Array.from({ length: extra }, (_, i) => `/gone${i}`).join('\n')}\n`;

    it('refuses, exits 1 and leaves the file when under 90% of the committed list survives', async () => {
      const r = await go(['--origin', origin, '--out', 'list.txt'], {}, (await list()) + old(3));
      expect(r.code).toBe(1);
      expect(r.written).toEqual({});
      expect(r.errors.join()).toMatch(/refusing to write list\.txt: 3 of 13 listed URLs/);
    });

    it('writes when 90% or more survives, or when there is no committed list', async () => {
      const urls = (await run()).urls;
      const lost = Array.from({ length: 9 }, (_, i) => `/lost${i}`);
      // 10 of 11 listed URLs survive (91%): written; 10 of 19: refused.
      expect((await go(['--origin', origin, '--out', 'a.txt'], {}, `${urls.join('\n')}\n/lost\n`)).code).toBe(0);
      expect(
        (await go(['--origin', origin, '--out', 'b.txt'], {}, `${urls.join('\n')}\n${lost.join('\n')}\n`)).code,
      ).toBe(1);
      expect((await go(['--origin', origin, '--out', 'c.txt'])).code).toBe(0);
    });
  });

  it('exits 2 on an unknown flag', async () => {
    expect((await go(['--nope'])).code).toBe(2);
  });
});
