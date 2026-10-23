// Catalog 0.5.3 parity (defect ledger D-xxx): the Shell column width, the sticky-footer frame, the nav's
// one current link, external links, the menu without a nav, and the global defaults. Container API (node).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
// @ts-expect-error jsdom ships no types and @types/jsdom is not a dependency
import * as jsdom from 'jsdom';
import { beforeAll, describe, expect, it } from 'vitest';
import ocxNav from '../src/nav.json' with { type: 'json' };
import { currentHref, isExternal } from '../src/nav.mjs';

type Component = Parameters<AstroContainer['renderToString']>[0];
const { JSDOM } = jsdom as { JSDOM: new (html: string) => { window: Window & typeof globalThis } };
const src = join(import.meta.dirname, '../src');
const shellSource = readFileSync(join(src, 'layouts/Shell.astro'), 'utf8');
const tokens = readFileSync(join(src, 'tokens.css'), 'utf8');
const shellStyle = shellSource.slice(shellSource.indexOf('<style is:global>'));
let container: AstroContainer;
let Shell: Component;

async function render(props: Record<string, unknown>, pathname = '/docs/x/') {
  const html = await container.renderToString(Shell, {
    request: new Request(`https://ocx.sh${pathname}`),
    props: { title: 'T', ...props },
  });
  return new JSDOM(html).window.document;
}

/** The declaration block of the first rule in `css` whose selector contains `selector`. */
const block = (css: string, selector: string): string => {
  const at = css.indexOf(selector);
  expect(at, selector).toBeGreaterThan(-1);
  return css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at));
};

beforeAll(async () => {
  container = await AstroContainer.create();
  Shell = ((await import(`../src/layouts/${'Shell'}.astro`)) as { default: Component }).default;
});

describe('Shell width', () => {
  it('D-005 D-110: width defaults to prose and reaches <main> and the footer frame', async () => {
    const doc = await render({});
    expect(doc.querySelector('main#main')?.getAttribute('data-width')).toBe('prose');
    expect(doc.querySelector('.ocx-shell__footer')?.getAttribute('data-width')).toBe('prose');
  });

  it.each(['wide', 'full'])('D-005 D-110: width="%s" is set on <main> and the footer frame', async (width) => {
    const doc = await render({ width });
    expect(doc.querySelector('main#main')?.getAttribute('data-width')).toBe(width);
    expect(doc.querySelector('.ocx-shell__footer')?.getAttribute('data-width')).toBe(width);
  });

  it('D-005 D-110: prose stays prose-width plus gutters, wide is --ocx-page-max, full has no cap and no <main> gutter', () => {
    expect(block(shellStyle, 'main,\n    .ocx-shell__footer')).toContain(
      'max-inline-size: calc(var(--ocx-prose-width) + var(--ocx-space-10))',
    );
    expect(block(shellStyle, "[data-width='wide']")).toContain('max-inline-size: var(--ocx-page-max)');
    expect(block(shellStyle, "[data-width='full']")).toContain('max-inline-size: none');
    expect(block(shellStyle, "main[data-width='full']")).toContain('padding-inline: 0');
    // The wide cap holds the old catalog's 1400px container and the docs sidebar + prose + outline row.
    expect(Number(/--ocx-page-max:\s*(\d+)px/.exec(tokens)?.[1])).toBeGreaterThanOrEqual(1400);
  });
});

describe('Shell frame and defaults', () => {
  it('D-128: body is a column at least one viewport tall and <main> grows, so a short page keeps the footer at the bottom', () => {
    const body = block(shellStyle, ':where(body) {');
    expect(body).toContain('min-block-size: 100svh');
    expect(body).toContain('display: flex');
    expect(body).toContain('flex-direction: column');
    expect(block(shellStyle, '    main {')).toContain('flex: 1 0 auto');
    // A flex item with auto side margins would shrink to its content: the column must claim its width.
    expect(block(shellStyle, 'main,\n    .ocx-shell__footer')).toContain('inline-size: 100%');
  });

  it('D-163: every box is border-box', () => {
    expect(block(shellStyle, ':where(*)::after {')).toContain('box-sizing: border-box');
  });

  it('D-168: body keeps the 13px UI base, 1.5 line height, antialiasing and the 0.15s scheme fade, held off during a switch', () => {
    const body = block(shellStyle, ':where(body) {');
    expect(body).toContain('font-size: var(--ocx-text-base)');
    expect(body).toContain('line-height: var(--ocx-lh-body)');
    expect(body).toContain('-webkit-font-smoothing: antialiased');
    expect(body).toContain('background-color var(--ocx-duration-base)');
    expect(body).toContain('color var(--ocx-duration-base)');
    expect(block(shellStyle, 'data-ocx-theme-switch] body')).toContain('transition: none');
    expect(/--ocx-text-base:\s*13px/.test(tokens)).toBe(true);
  });

  it('D-169: a bare link in <main> is accent ink without underline, accent-hover on hover; buttons inherit the font', () => {
    expect(block(shellStyle, ':where(main a) {')).toMatch(
      /color: var\(--ocx-color-accent-fg\);\s*text-decoration: none/,
    );
    expect(block(shellStyle, ':where(main a:hover)')).toContain('color: var(--ocx-color-accent-hover)');
    expect(block(shellStyle, ':where(main button)')).toContain('font: inherit');
  });
});

describe('neutral header and footer', () => {
  const brand = { title: 'Mirror' };

  it('D-126: the longest matching prefix alone is current (/ and /docs/ are not both active)', async () => {
    const nav = [
      { label: 'Home', href: '/' },
      { label: 'Docs', href: '/docs/' },
      { label: 'Reference', href: '/docs/reference/' },
    ];
    const current = async (path: string) => {
      const doc = await render({ brand, nav }, path);
      return [...doc.querySelectorAll('.ocx-header__nav a[aria-current]')].map((a) => a.getAttribute('href'));
    };
    expect(await current('/docs/guide/')).toEqual(['/docs/']);
    expect(await current('/docs/reference/y/')).toEqual(['/docs/reference/']);
    expect(await current('/')).toEqual(['/']);
    expect(await current('/other/')).toEqual([]);
    // The mobile menu list agrees.
    const doc = await render({ brand, nav }, '/docs/reference/y/');
    expect([...doc.querySelectorAll('#ocx-header-menu a[aria-current]')].map((a) => a.getAttribute('href'))).toEqual([
      '/docs/reference/',
    ]);
  });

  it('D-126: currentHref picks the longest prefix, ties and externals aside', () => {
    expect(currentHref('/docs/a/', ['/docs/', '/docs/a/', '/'])).toBe('/docs/a/');
    expect(currentHref('/docs/a/', ['https://e.com/docs/', '/x/'])).toBeUndefined();
    expect(currentHref('/base/', ['/base/', '/base/docs/'], '/base/')).toBe('/base/');
  });

  it('D-137: an external nav link opens in a new tab, noopener noreferrer, with the external icon; an internal one does not', async () => {
    const doc = await render({
      brand,
      nav: [
        { label: 'In', href: '/in/' },
        { label: 'Out', href: 'https://e.com/a/' },
      ],
    });
    const out = doc.querySelector('.ocx-header__nav a[href="https://e.com/a/"]')!;
    expect([out.getAttribute('target'), out.getAttribute('rel')]).toEqual(['_blank', 'noopener noreferrer']);
    expect(out.querySelector('svg[data-icon="external"]')).not.toBeNull();
    const inside = doc.querySelector('.ocx-header__nav a[href="/in/"]')!;
    expect([inside.hasAttribute('target'), inside.hasAttribute('rel'), inside.querySelector('svg')]).toEqual([
      false,
      false,
      null,
    ]);
    const drawer = doc.querySelector('#ocx-header-menu a[href="https://e.com/a/"]')!;
    expect(drawer.getAttribute('target')).toBe('_blank');
    expect(drawer.querySelector('svg[data-icon="external"]')).not.toBeNull();
  });

  it('D-137: an external footer link opens in a new tab with the external icon; an internal one does not', async () => {
    const doc = await render({
      brand,
      footer: {
        links: [
          { label: 'In', href: '/in/' },
          { label: 'Out', href: 'https://e.com/a/' },
          { label: 'Rel', href: '//e.com/b/' },
          { label: 'Mail', href: 'mailto:a@e.com' },
        ],
      },
    });
    const a = (href: string) => doc.querySelector(`.ocx-footer a[href="${href}"]`)!;
    for (const href of ['https://e.com/a/', '//e.com/b/']) {
      expect([a(href).getAttribute('target'), a(href).getAttribute('rel')]).toEqual(['_blank', 'noopener noreferrer']);
      expect(a(href).querySelector('svg[data-icon="external"]')).not.toBeNull();
    }
    for (const href of ['/in/', 'mailto:a@e.com']) {
      expect(a(href).hasAttribute('target')).toBe(false);
      expect(a(href).querySelector('svg')).toBeNull();
    }
  });

  it('D-137: isExternal is an absolute http(s) or protocol-relative URL', () => {
    expect(['https://a', 'HTTP://a', '//a', '/a', 'a/b', 'mailto:a@b', '/x//y'].map(isExternal)).toEqual([
      true,
      true,
      true,
      false,
      false,
      false,
      false,
    ]);
  });

  it('D-141: no nav means no dead menu button and no empty drawer; with a nav (and in ocx mode) they stay', async () => {
    const none = await render({ brand });
    expect(none.querySelector('.ocx-header__menu, #ocx-header-menu')).toBeNull();
    const some = await render({ brand, nav: [{ label: 'A', href: '/a/' }] });
    expect(some.querySelector('.ocx-header__menu')).not.toBeNull();
    expect(some.querySelector('#ocx-header-menu a')).not.toBeNull();
    const ocx = await render({});
    expect(ocx.querySelector('.ocx-header__menu')).not.toBeNull();
  });
});

describe('tokens', () => {
  it('D-161: --ocx-z-drawer-close sits between the drawer and the popover; --ocx-duration-shimmer is 1.6s and zeroed under reduced motion', () => {
    const z = (name: string) => Number(new RegExp(`--ocx-z-${name}:\\s*(\\d+)`).exec(tokens)?.[1]);
    expect(z('drawer-close')).toBeGreaterThan(z('drawer'));
    expect(z('drawer-close')).toBeLessThan(z('popover'));
    expect(/--ocx-duration-shimmer:\s*1\.6s/.test(tokens)).toBe(true);
    const reduced = tokens.slice(tokens.indexOf('prefers-reduced-motion: reduce'));
    expect(reduced).toMatch(/--ocx-duration-shimmer:\s*0s/);
  });

  it('D-161 D-127: the dark block answers to the .dark class as well as data-theme (the class the theme script now sets)', () => {
    expect(tokens).toMatch(/\.dark,\s*:root\[data-theme='dark'\]\s*\{/);
  });
});

describe('catalog chrome parity', () => {
  const brand = { title: 'Mirror' };

  it('D-138: a home link with match "prefix" is current under it unless a longer link matches; without it, home stays exact', async () => {
    const nav = [
      { label: 'Catalog', href: '/', match: 'prefix' as const },
      { label: 'Docs', href: '/docs/' },
    ];
    const current = async (path: string, links = nav) => {
      const doc = await render({ brand, nav: links }, path);
      return [...doc.querySelectorAll('.ocx-header__nav a[aria-current]')].map((a) => a.textContent?.trim());
    };
    expect(await current('/p/ns/pkg/')).toEqual(['Catalog']);
    expect(await current('/')).toEqual(['Catalog']);
    expect(await current('/docs/guide/')).toEqual(['Docs']);
    expect(await current('/p/ns/pkg/', [{ label: 'Catalog', href: '/', match: undefined as never }, nav[1]!])).toEqual(
      [],
    );
    expect(currentHref('/base/p/', [{ href: '/base/', match: 'prefix' }], '/base/')).toBe('/base/');
    expect(currentHref('/other/', [{ href: '/base/', match: 'prefix' }], '/base/')).toBeUndefined();
  });

  it('D-135: a footer link carries its title as a tooltip; ocx chrome appends extraFooterLinks after the nav.json links', async () => {
    const doc = await render({
      extraFooterLinks: [
        { label: 'catalog json', href: '/data/catalog/catalog.json', title: 'Not the index wire format' },
      ],
    });
    const links = [...doc.querySelectorAll('.ocx-footer__links a')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      ...ocxNav.footer.map((l) => l.href),
      '/data/catalog/catalog.json',
    ]);
    expect(links.at(-1)?.getAttribute('title')).toBe('Not the index wire format');
    expect(links[0]?.hasAttribute('title')).toBe(false);
    const neutral = await render({ brand, footer: { links: [{ label: 'A', href: '/a/', title: 'T' }] } });
    expect(neutral.querySelector('.ocx-footer a')?.getAttribute('title')).toBe('T');
  });

  it('D-139: ocx chrome renders extraNav links beside the sections and in the mobile menu; the longest match alone is current', async () => {
    const extraNav = [{ label: 'Docs', href: '/catalog/docs/', title: 'Catalog docs' }];
    const doc = await render({ extraNav }, '/catalog/docs/guide/');
    const link = doc.querySelector('.ocx-header__nav a[href="/catalog/docs/"]')!;
    expect([link.textContent?.trim(), link.getAttribute('title'), link.getAttribute('aria-current')]).toEqual([
      'Docs',
      'Catalog docs',
      'page',
    ]);
    // It outranks the nav.json claim that the path also falls under: no section is current beside it.
    expect(doc.querySelector('.ocx-header__nav [aria-current]') === link).toBe(true);
    expect(doc.querySelectorAll('.ocx-header__nav [aria-current]')).toHaveLength(1);
    expect(doc.querySelector('.ocx-header')?.getAttribute('data-ocx-active')).toBe('');
    expect(doc.querySelector('#ocx-header-menu a[href="/catalog/docs/"]')?.getAttribute('aria-current')).toBe('page');
    // Off its path it is a plain link and the section claim is back.
    const off = await render({ extraNav }, '/docs/x/');
    expect(off.querySelector('.ocx-header__nav a[href="/catalog/docs/"]')?.hasAttribute('aria-current')).toBe(false);
    expect(off.querySelector('.ocx-header')?.getAttribute('data-ocx-active')).toBe('docs');
    // Without extraNav the header is unchanged.
    expect((await render({})).querySelector('[data-ocx-section="extra"]')).toBeNull();
  });

  it('D-139 D-135: extraNav and extraFooterLinks are ocx-chrome props; neutral mode throws on them', async () => {
    await expect(render({ brand, extraNav: [{ label: 'A', href: '/a/' }] })).rejects.toThrow(
      'extraNav/extraFooterLinks',
    );
    await expect(render({ brand, extraFooterLinks: [{ label: 'A', href: '/a/' }] })).rejects.toThrow('extraNav');
  });

  it('D-158: an icon prop replaces the default favicon in both modes, leaving exactly one rel=icon', async () => {
    const icons = (doc: Document) => [...doc.querySelectorAll('link[rel="icon"]')].map((l) => l.getAttribute('href'));
    expect(icons(await render({ icon: '/c/mine.png' }))).toEqual(['/c/mine.png']);
    expect(icons(await render({ brand, icon: '/c/mine.png' }))).toEqual(['/c/mine.png']);
    expect(icons(await render({}))).toEqual(['/favicon.svg']);
    expect(icons(await render({ brand }))).toEqual(['data:,']);
  });
});

describe('consumer-overridable tokens are read', () => {
  const read = (path: string) => readFileSync(join(src, path), 'utf8');

  it('D-161: the Drawer close control stacks on --ocx-z-drawer-close', () => {
    const drawer = read('components/ui/Drawer.astro');
    expect(block(drawer, "[data-part='close-trigger']")).toMatch(
      /position:\s*relative;\s*z-index:\s*var\(--ocx-z-drawer-close\)/,
    );
  });

  it('D-161: the Skeleton sweep runs on --ocx-duration-shimmer', () => {
    expect(read('components/ui/skeleton.css')).toMatch(
      /animation:\s*ocx-ui-skeleton-sweep var\(--ocx-duration-shimmer\) linear infinite/,
    );
  });
});

describe('skip link', () => {
  it('D-114: the skip link lands on #main by default and on skipTarget when given', async () => {
    expect((await render({})).querySelector('a.ocx-skip')?.getAttribute('href')).toBe('#main');
    expect((await render({ skipTarget: 'prose' })).querySelector('a.ocx-skip')?.getAttribute('href')).toBe('#prose');
    expect(
      (await render({ brand: { title: 'M' }, skipTarget: 'x' })).querySelector('a.ocx-skip')?.getAttribute('href'),
    ).toBe('#x');
  });
});
