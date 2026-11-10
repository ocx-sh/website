// C-306: the landing and hub pages of the root site, read from the built dist.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { HTML_GZ_MAX } from '../../tests/budgets.mjs';
import { dist, root } from './build-site.ts';
import { HERO_SESSION, SUPPLY_SESSION } from './components/landing-content.ts';

const read = (file: string) => readFileSync(`${dist}${file}`, 'utf8');
const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)],
  );
// Page-authored content: `<main>` minus the theme footer, whose links come from nav.json.
const main = (html: string) => (/<main[\s\S]*<\/main>/.exec(html)?.[0] ?? '').replace(/<footer[\s\S]*<\/footer>/, '');

describe('landing page (C-306)', () => {
  const html = () => read('index.html');

  it('has one h1, the skip link target, with the three hero lines and the real routes', () => {
    const h = html();
    expect(h.match(/<h1\b/g)).toHaveLength(1);
    expect(h).toMatch(/<h1 id="_top"[^>]*>Same tools\.<br\/?><em>Every machine\.<\/em><\/h1>/);
    for (const href of ['/docs/getting-started', '/catalog/', 'https://github.com/ocx-sh/ocx'])
      expect(h, href).toContain(`href="${href}"`);
  });

  it('has an install bar offering every shell in the hero and in the call to action', () => {
    const bars = [...main(html()).matchAll(/class="ocx-cmdbar[" ][^>]*data-choices="([^"]*)"/g)].map((m) =>
      (JSON.parse((m[1] ?? '').replaceAll('&#34;', '"').replaceAll('&quot;', '"')) as { command: string }[]).map(
        (c) => c.command,
      ),
    );
    // The two `ocx add` bars of the page hold one command each; the install bars hold one per shell.
    const installs = bars.filter((b) => b.length > 1);
    expect(bars).toHaveLength(4);
    expect(installs).toHaveLength(2);
    expect(installs[0]).toHaveLength(5);
    expect(installs[1]).toEqual(installs[0]);
  });

  it('defines the platform detector once for the two install bars, the second only calls it', () => {
    const h = html();
    expect(h.match(/globalThis\.ocxDetect=/g)).toHaveLength(1);
    expect(h.match(/try\{ocxDetect\(document\.currentScript\)\}/g)).toHaveLength(1);
  });

  it('has the six problem cards, the closing line, four pillar rows and the call to action', () => {
    const h = html();
    expect(/data-stage-items[\s\S]*?data-stage-finale/.exec(h)?.[0].match(/data-stage-strike/g)).toHaveLength(6);
    expect(h).toContain('ocx add ocx.sh/nodejs/node:24');
    expect(h.match(/<section class="ocx-feature[ "]/g)).toHaveLength(4);
    expect(h).toContain('Run everywhere.');
    expect(h).toContain('ocx is in early development');
  });

  it('renders the final, revealed state: no inline style, hidden attribute or opacity in the markup', () => {
    const lp = /<div class="lp [\s\S]*<\/main>/.exec(html())?.[0] ?? '';
    expect(lp.length).toBeGreaterThan(0);
    // Only the Zag command bar sets inline style (a custom property for its width), and a Skeleton its line count.
    const styled = [...lp.matchAll(/ style="([^"]*)"/g)].map((m) => m[1] ?? '');
    for (const style of styled) expect(style).not.toMatch(/opacity|transform|visibility|display/);
  });

  it('defers the hero terminal, the integration tabs and the supply-chain session to fragments', () => {
    const h = main(html());
    const srcs = [...h.matchAll(/data-ocx-deferred[^>]*data-src="([^"]*)"/g)].map((m) => m[1]);
    expect(srcs).toEqual(['/frag/landing-hero/', '/frag/landing-integrations/', '/frag/landing-supply/']);
    for (const src of srcs) expect(existsSync(`${dist}${src}index.html`), src).toBe(true);
  });

  it('the integrations fragment is one tablist: a tab, a panel and a guide link each, the first selected', () => {
    const h = read('frag/landing-integrations/index.html');
    expect(h.match(/role="tablist"/g)).toHaveLength(1);
    const n = h.match(/role="tab"/g)?.length ?? 0;
    expect(n).toBe(4);
    expect(h.match(/role="tabpanel"/g)).toHaveLength(n);
    expect(h.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(h).toContain('href="/integrations/bazel/"');
    // The other tabs load their panel when first shown: their guide links live in the tab fragments.
    for (const [tab, href] of [
      ['actions', 'https://github.com/marketplace/actions/setup-ocx'],
      ['cmake', '/integrations/cmake/'],
      ['python', '/integrations/python/'],
    ] as const) {
      expect(h).toContain(`/frag/landing-tab/${tab}/`);
      expect(read(`frag/landing-tab/${tab}/index.html`), href).toContain(`href="${href}"`);
    }
    expect(main(html())).toContain('href="/integrations/"');
  });

  it('the session fragments hold the lines their skeletons are sized from', () => {
    const text = (html: string) =>
      html
        .replace(/<[^>]*>/g, '')
        .replaceAll('&#x26;', '&')
        .replaceAll('&#x3C;', '<');
    for (const [name, session] of [
      ['landing-hero', HERO_SESSION],
      ['landing-supply', SUPPLY_SESSION],
    ] as const) {
      const html = text(read(`frag/${name}/index.html`));
      for (const line of session.flatMap((fence) => fence.split('\n'))) expect(html, line).toContain(line.trim());
    }
  });

  it('every <img> and <svg> has a reserved box', () => {
    // The picker carries markup in attribute values (data-choices, an option's data-icon): data, not elements.
    const tags = [
      ...main(html())
        .replace(/ [\w-]+="[^"]*<[^"]*"/g, '')
        .matchAll(/<(img|svg)\b[^>]*>/g),
    ].map((m) => m[0]);
    expect(tags.length).toBeGreaterThan(0);
    for (const tag of tags) {
      const sized = /\bwidth="/.test(tag) && /\bheight="/.test(tag);
      // A theme `Icon` takes its box from the `.ocx-icon` size tokens, the shell picker's chevron from its own
      // `.ocx-ui-select__icon` (command-bar.css), not from attributes.
      expect(sized || /aspect-ratio/.test(tag) || /class="[^"]*\bocx-(?:icon|ui-select__icon)\b/.test(tag), tag).toBe(
        true,
      );
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
