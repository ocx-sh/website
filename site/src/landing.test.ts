// C-306: the landing and hub pages of the root site, read from the built dist.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { HTML_GZ_MAX } from '../../tests/budgets.mjs';
import { dist, root } from './build-site.ts';

const read = (file: string) => readFileSync(`${dist}${file}`, 'utf8');
const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)],
  );
// Page-authored content: `<main>` minus the theme footer, whose links come from nav.json.
const main = (html: string) => (/<main[\s\S]*<\/main>/.exec(html)?.[0] ?? '').replace(/<footer[\s\S]*<\/footer>/, '');

describe('landing page (C-306)', () => {
  const html = () => read('index.html');

  it('has the hero with the three actions, /docs links without a trailing slash', () => {
    const h = html();
    expect(h).toMatch(/<h1[^>]*>ocx<\/h1>/);
    expect(h).toContain('The Simple Package Manager');
    for (const href of ['/docs/getting-started', '/install/', '/docs/user-guide'])
      expect(h, href).toContain(`href="${href}"`);
  });

  it('has the install tab set, four feature cards, five sections and the early-development banner', () => {
    const h = html();
    expect(h.match(/role="tab"/g)?.length).toBeGreaterThanOrEqual(5);
    expect(h.match(/class="[^"]*landing-cards__card/g)).toHaveLength(4);
    expect(h.match(/class="ocx-feature"/g) ?? h.match(/<section class="ocx-feature/g)).toHaveLength(5);
    expect(h).toContain('Early Development');
  });

  it('every <img> and <svg> has a reserved box', () => {
    const tags = [...main(html()).matchAll(/<(img|svg)\b[^>]*>/g)].map((m) => m[0]);
    expect(tags.length).toBeGreaterThan(0);
    for (const tag of tags) {
      const sized = /\bwidth="/.test(tag) && /\bheight="/.test(tag);
      // A theme `Icon` takes its box from the `.ocx-icon` size tokens, not from attributes.
      expect(sized || /aspect-ratio/.test(tag) || /class="[^"]*\bocx-icon\b/.test(tag), tag).toBe(true);
    }
  });
});

describe('root site dist', () => {
  it('has no /licensed/ URL anywhere', () => {
    const hits = files(dist).filter((f) => readFileSync(f).includes('/licensed/'));
    expect(hits).toEqual([]);
  });

  it('a page-authored href under a legacy proxy claim has no trailing slash (ADR 0002 F15)', () => {
    const legacy = JSON.parse(readFileSync(`${root}infra/bunny/legacy.json`, 'utf8')) as {
      entries: { mode: string; paths: string[] }[];
    };
    const claims = legacy.entries.filter((e) => e.mode === 'proxy').flatMap((e) => e.paths);
    const under = (p: string) => claims.some((c) => p === c || (c.endsWith('/') && p.startsWith(c)));
    const offenders: string[] = [];
    for (const f of files(dist).filter((f) => f.endsWith('.html'))) {
      for (const [, href = ''] of main(readFileSync(f, 'utf8')).matchAll(/ href="([^"]*)"/g)) {
        const p = href.split(/[?#]/)[0] ?? '';
        if (p.startsWith('/') && p.endsWith('/') && under(p)) offenders.push(`${f.slice(dist.length)}: ${href}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('no page names the removed `ocx run` spelling (`ocx exec` replaces it)', () => {
    const hits = files(dist)
      .filter((f) => f.endsWith('.html'))
      .filter((f) => /\bocx\s+(?:(?:--?[\w-]+\s+)*)run\b/.test(main(readFileSync(f, 'utf8')).replace(/<[^>]+>/g, '')));
    expect(hits).toEqual([]);
  });

  it('the install page pins setup-ocx exactly as the site workflow does', () => {
    const uses = /uses: (ocx-sh\/setup-ocx@[0-9a-f]{40} # v\d+\.\d+\.\d+)/.exec(
      readFileSync(`${root}.github/workflows/site.yml`, 'utf8'),
    )?.[1];
    expect(uses).toBeDefined();
    expect(read('install/index.html').replace(/<[^>]+>/g, '')).toContain(uses ?? '');
  });

  it('every built page, the landing first, keeps its gzipped HTML within HTML_GZ_MAX', () => {
    const sizes = Object.fromEntries(
      files(dist)
        .filter((f) => f.endsWith('.html'))
        .map((f) => [f.slice(dist.length), gzipSync(readFileSync(f)).length]),
    );
    expect(sizes['index.html'], 'landing page').toBeLessThanOrEqual(HTML_GZ_MAX);
    for (const [page, size] of Object.entries(sizes)) expect(size, page).toBeLessThanOrEqual(HTML_GZ_MAX);
  });

  it('the hubs render their entries from nav.json', () => {
    expect(read('integrations/index.html')).toContain('data-ocx-hub="integrations"');
    expect(read('apps/index.html')).toContain('data-ocx-hub="apps"');
  });
});
