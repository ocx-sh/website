// The root site's built output: claims layout, Pagefind version, robots and sitemap.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dist, root } from './build-site.ts';

const read = (file: string) => readFileSync(`${dist}${file}`, 'utf8');
const locs = (xml: string) => [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1] ?? '');

describe('site dist', () => {
  it('ocx-site check passes for ocx-sh/website, with the root Pagefind bundle', () => {
    const r = spawnSync(
      'node',
      ['packages/theme/bin/ocx-site.mjs', 'check', '--dist', 'site/dist', '--repo', 'ocx-sh/website'],
      { cwd: root, encoding: 'utf8' },
    );
    expect(r.stdout).toBe('');
    expect(r.status).toBe(0);
    expect(existsSync(`${dist}pagefind/pagefind-entry.json`)).toBe(true);
  });

  it('has the root claims, 404 and no other top-level directory', () => {
    for (const f of ['index', 'integrations/index', 'apps/index', 'install/index', '404'])
      expect(existsSync(`${dist}${f}.html`), f).toBe(true);
    const dirs = readdirSync(dist, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
    expect(dirs.toSorted()).toEqual(['_astro', 'apps', 'install', 'integrations', 'pagefind']);
  });

  it('names no legacy section bundle: the search chunk and every page leave out /docs/pagefind/ and kin', () => {
    const legacy = JSON.parse(readFileSync(`${root}infra/bunny/legacy.json`, 'utf8')) as {
      entries: { paths: string[] }[];
    };
    const bundles = legacy.entries.flatMap((e) => e.paths.map((p) => `${p.replace(/\/?$/, '/')}pagefind/`));
    expect(bundles).toContain('/docs/pagefind/');
    const built = [
      ...readdirSync(`${dist}_astro`)
        .filter((f) => f.endsWith('.js'))
        .map((f) => `_astro/${f}`),
      ...['index', 'integrations/index', 'apps/index', 'install/index', '404'].map((f) => `${f}.html`),
    ];
    for (const f of built) for (const b of bundles) expect(read(f), `${f}: ${b}`).not.toContain(b);
  });

  it('renders the header and search on the 404 page', () => {
    const html = read('404.html');
    expect(html).toContain('ocx-header');
    expect(html).toContain('data-zag-id="search"');
  });

  it('robots.txt allows all and names exactly one sitemap', () => {
    const lines = read('robots.txt').split('\n').filter(Boolean);
    expect(lines).toEqual(['User-agent: *', 'Allow: /', 'Sitemap: https://ocx.sh/sitemap-index.xml']);
  });

  it('sitemap lists only root claim URLs, each with a trailing slash', () => {
    const index = locs(read('sitemap-index.xml'));
    expect(index.length).toBeGreaterThan(0);
    const urls = index.flatMap((u) => locs(read(u.replace('https://ocx.sh/', ''))));
    expect(urls.toSorted()).toEqual([
      'https://ocx.sh/',
      'https://ocx.sh/apps/',
      'https://ocx.sh/install/',
      'https://ocx.sh/integrations/',
    ]);
  });
});

describe('task targets', () => {
  const list = spawnSync('task', ['--list-all', '--color=false'], { cwd: root, encoding: 'utf8' });
  it.skipIf(list.status !== 0)('lists site:dev and site:test (skipped: task not resolvable)', () => {
    expect(list.stdout).toMatch(/^\* site:dev:/m);
    expect(list.stdout).toMatch(/^\* site:test:/m);
  });
});
