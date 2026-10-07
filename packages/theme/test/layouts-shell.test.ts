// Shell layout (plain Astro sites): ocx and neutral mode, and the Starlight-free import graph.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
// @ts-expect-error jsdom ships no types and @types/jsdom is not a dependency
import * as jsdom from 'jsdom';
import { beforeAll, describe, expect, it } from 'vitest';
import nav from '../src/nav.json' with { type: 'json' };

type Component = Parameters<AstroContainer['renderToString']>[0];
const { JSDOM } = jsdom as { JSDOM: new (html: string) => { window: Window & typeof globalThis } };
const src = join(import.meta.dirname, '../src');
let container: AstroContainer;
let Shell: Component;

async function render(props: Record<string, unknown>, pathname = '/docs/x/') {
  const html = await container.renderToString(Shell, {
    request: new Request(`https://ocx.sh${pathname}`),
    props: { title: 'T', ...props },
  });
  return { html, doc: new JSDOM(html).window.document };
}

beforeAll(async () => {
  container = await AstroContainer.create();
  const layout = 'Shell';
  Shell = ((await import(`../src/layouts/${layout}.astro`)) as { default: Component }).default;
});

describe('Shell ocx mode', () => {
  it('renders the ocx.sh chrome: one header, mega menu, install, footer links, licence, toaster', async () => {
    const { doc } = await render({ description: 'D' });
    expect(doc.querySelectorAll('.ocx-header')).toHaveLength(1);
    expect(doc.querySelector('.ocx-header')?.getAttribute('data-ocx-active')).toBe('docs');
    expect(doc.querySelector('.ocx-mega')).not.toBeNull();
    expect(doc.querySelector('.ocx-header__install')).not.toBeNull();
    const footer = doc.querySelector('.ocx-footer')!;
    for (const l of nav.footer) expect(footer.querySelector(`a[href="${l.href}"]`)).not.toBeNull();
    expect(footer.textContent).toContain('Apache-2.0');
    expect(doc.querySelector('[data-zag-root="toast"]')).not.toBeNull();
    expect(doc.querySelector('main#main')).not.toBeNull();
    expect(doc.querySelector('meta[name="description"]')?.getAttribute('content')).toBe('D');
    expect(doc.querySelector('link[rel="icon"]')?.getAttribute('href')).toBe('/favicon.svg');
  });

  it('preloads the four upright font faces in both modes', async () => {
    for (const props of [{}, { brand: { title: 'M' } }]) {
      const { doc } = await render(props);
      const hrefs = [...doc.querySelectorAll('link[rel="preload"][as="font"][crossorigin]')].map((l) =>
        l.getAttribute('href'),
      );
      expect(hrefs.map((h) => /ibm-plex-(sans|mono)-latin-(400|600)-normal/.exec(h ?? '')?.[0])).toHaveLength(4);
      expect(hrefs.every((h) => h?.endsWith('.woff2'))).toBe(true);
    }
  });

  it('puts the theme script before any stylesheet, and honours canonical and activeSection', async () => {
    const { html, doc } = await render({ canonical: 'https://ocx.sh/c/', activeSection: 'install' });
    const script = html.indexOf('starlight-theme');
    expect(script).toBeGreaterThan(-1);
    const sheet = html.search(/<link[^>]+rel="stylesheet"|<style/);
    if (sheet > -1) expect(script).toBeLessThan(sheet);
    expect(doc.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://ocx.sh/c/');
    expect(doc.querySelector('.ocx-header')?.getAttribute('data-ocx-active')).toBe('install');
  });

  it('lists the sections in the mobile menu popover', async () => {
    const { doc } = await render({});
    const menu = doc.querySelector('.ocx-header__menu')!;
    expect(menu.getAttribute('popovertarget')).toBe('ocx-header-menu');
    expect(doc.querySelector('#ocx-header-menu[popover] a')).not.toBeNull();
  });
});

describe('Shell neutral mode', () => {
  const props = {
    brand: { title: 'Mirror', logoSrc: '/m.svg' },
    nav: [
      { label: 'Home', href: '/a/' },
      { label: 'Other', href: '/b/' },
    ],
    footer: { links: [{ label: 'About', href: '/about/' }], note: 'Note' },
  };

  it('renders the brand, links with aria-current, the footer, and none of the ocx chrome', async () => {
    const { doc } = await render(props, '/a/x/');
    expect(doc.querySelector('.ocx-header__brand')?.textContent?.trim()).toBe('Mirror');
    const img = doc.querySelector('.ocx-header__brand img')!;
    expect([img.getAttribute('width'), img.getAttribute('height'), img.getAttribute('alt')]).toEqual(['20', '20', '']);
    expect(doc.querySelector('.ocx-header__nav a[href="/a/"]')?.getAttribute('aria-current')).toBe('page');
    expect(doc.querySelector('.ocx-header__nav a[href="/b/"]')?.hasAttribute('aria-current')).toBe(false);
    expect(doc.querySelector('.ocx-footer')?.textContent).toContain('Note');
    expect(doc.querySelector('.ocx-mega')).toBeNull();
    expect(doc.querySelector('.ocx-header__install')).toBeNull();
    expect(doc.querySelector('a[aria-label="GitHub"], .ocx-header__tool-icon[data-icon="github"]')).toBeNull();
    expect(doc.querySelector('link[rel="icon"]')?.getAttribute('href')).toBe('data:,');
    expect(doc.querySelector('[data-ocx-theme]')).not.toBeNull();
  });

  it('logoAlt sets the logo alt; the image sits in a fixed box beside the wordmark', async () => {
    const { doc } = await render({ ...props, brand: { ...props.brand, logoAlt: 'Mirror logo' } }, '/a/');
    const img = doc.querySelector('.ocx-header__brand > .ocx-header__logo > img')!;
    expect(img.getAttribute('alt')).toBe('Mirror logo');
    expect(doc.querySelector('.ocx-header__brand > span:not(.ocx-header__logo)')?.textContent).toBe('Mirror');
  });

  it('shows no ocx footer or ocx.sh href without a footer, and no licence line without a note', async () => {
    const bare = await render({ brand: props.brand, nav: props.nav }, '/a/');
    expect(bare.doc.querySelector('.ocx-footer__links')?.textContent?.trim()).toBe('');
    expect(bare.doc.querySelector('.ocx-footer__license')).toBeNull();
    expect(bare.html).not.toContain('OCX Authors');
    const links = await render({ brand: props.brand, footer: { links: props.footer.links } });
    expect(links.doc.querySelector('.ocx-footer__license')).toBeNull();
    for (const h of [bare.html, links.html]) expect(h).not.toMatch(/(?:href|src)="[^"]*ocx\.sh/);
  });

  it('escapes consumer strings and renders the neutral drawer', async () => {
    const { doc } = await render({
      brand: { title: '<b>x</b>', logoSrc: '/m.svg"onerror="x' },
      nav: [{ label: '<i>L</i>', href: '/a/' }],
      description: '"><script>1</script>',
    });
    expect(doc.querySelector('b, i, main script')).toBeNull();
    expect(doc.querySelectorAll('script:not([src])')).toHaveLength(2);
    expect(doc.querySelector('.ocx-header__brand img')?.hasAttribute('onerror')).toBe(false);
    expect(doc.querySelector('#ocx-header-menu[aria-label="Main"] a[href="/a/"]')).not.toBeNull();
  });

  it('marks Home current only on its own path, never external hrefs', async () => {
    const { doc } = await render(
      {
        brand: props.brand,
        nav: [
          { label: 'Home', href: '/' },
          { label: 'Ext', href: 'https://e.com/a/' },
        ],
      },
      '/a/x/',
    );
    expect(doc.querySelector('.ocx-header__nav a[href="/"]')?.hasAttribute('aria-current')).toBe(false);
    expect(doc.querySelector('.ocx-header__nav a[href="https://e.com/a/"]')?.hasAttribute('aria-current')).toBe(false);
  });

  it('throws when nav or footer come without brand', async () => {
    await expect(render({ nav: [] })).rejects.toThrow('nav/footer need brand');
    await expect(render({ footer: { links: [] } })).rejects.toThrow('nav/footer need brand');
  });
});

describe('Starlight-free import graph', () => {
  const seen = new Set<string>();
  const walk = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    const text = readFileSync(file, 'utf8');
    expect(text, file).not.toMatch(/@astrojs\/starlight|virtual:starlight|Astro\.locals/);
    for (const m of text.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)['"](\.[^'"]+)['"]/g)) {
      const spec = m[1]!.replace(/\?raw$/, '');
      const target = resolve(dirname(file), spec);
      if (/\.(astro|mjs|js)$/.test(target) && existsSync(target)) walk(target);
    }
  };
  it.each(['layouts/Shell.astro', 'components/SiteHeader.astro', 'components/SiteFooter.astro', 'chrome.mjs'])(
    '%s reaches no Starlight module',
    (entry) => walk(join(src, entry)),
  );
});
