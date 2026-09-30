// C-264 Link: markup via the Astro Container API (node), parsed with JSDOM.
import { readFileSync } from 'node:fs';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
// @ts-expect-error jsdom ships no types and @types/jsdom is not a dependency
import * as jsdom from 'jsdom';
import { beforeAll, describe, expect, it } from 'vitest';

type Win = Window & typeof globalThis;
type Component = Parameters<AstroContainer['renderToString']>[0];
const { JSDOM } = jsdom as { JSDOM: new (html: string) => { window: Win } };
// Template import: tsc has no .astro module types (as in chrome.test.ts).
const load = async (name: string) =>
  ((await import(`../src/components/ui/${name}.astro`)) as { default: Component }).default;
const Link = await load('Link');

let withSite: AstroContainer;
let noSite: AstroContainer;
beforeAll(async () => {
  withSite = await AstroContainer.create({ astroConfig: { site: 'https://ocx.sh' } });
  noSite = await AstroContainer.create();
});

async function render(props: Record<string, unknown>, container = withSite) {
  const html = await container.renderToString(Link, { props, slots: { default: 'Docs' } });
  const doc = new JSDOM(`<body>${html}</body>`).window.document;
  return { html, a: doc.querySelector('a') as HTMLAnchorElement, doc };
}

describe('C-264 Link', () => {
  it('renders a plain a.ocx-ui-link with accent/always defaults, the slot text and no script', async () => {
    const { a, html } = await render({ href: '/docs/' });
    expect(a.getAttribute('href')).toBe('/docs/');
    expect(a.classList.contains('ocx-ui-link')).toBe(true);
    expect(a.dataset['underline']).toBe('always');
    expect(a.dataset['tone']).toBe('accent');
    expect(a.textContent).toBe('Docs');
    expect(a.querySelector('svg')).toBeNull();
    expect(html).not.toMatch(/<script/i);
  });

  it('underline and tone flow to data attributes', async () => {
    const { a } = await render({ href: '/x', underline: 'hover', tone: 'neutral' });
    expect(a.dataset['underline']).toBe('hover');
    expect(a.dataset['tone']).toBe('neutral');
  });

  describe('external auto-detection', () => {
    it.each([
      ['https://example.com/a', true],
      ['http://example.com', true],
      ['https://ocx.sh/docs/', false],
      ['/docs/', false],
      ['#top', false],
      ['mailto:hi@example.com', false],
      ['relative/path', false],
    ])('with site https://ocx.sh: %s -> %s', async (href, expected) => {
      const { a } = await render({ href });
      expect(!!a.querySelector('svg[data-icon="external"]')).toBe(expected);
    });

    it.each([
      ['https://ocx.sh/docs/', true],
      ['https://example.com', true],
      ['/docs/', false],
    ])('without a site: %s -> %s', async (href, expected) => {
      const { a } = await render({ href }, noSite);
      expect(!!a.querySelector('svg[data-icon="external"]')).toBe(expected);
    });

    it('the external prop overrides detection both ways', async () => {
      expect((await render({ href: '/docs/', external: true })).a.querySelector('svg')).not.toBeNull();
      expect((await render({ href: 'https://example.com', external: false })).a.querySelector('svg')).toBeNull();
    });

    it('the icon is named "(external)", sm, and sits with a word joiner in a nowrap wrapper', async () => {
      const { a } = await render({ href: 'https://example.com' });
      const svg = a.querySelector('svg');
      expect(svg?.getAttribute('aria-label')).toBe('(external)');
      expect(svg?.getAttribute('role')).toBe('img');
      expect(svg?.getAttribute('data-size')).toBe('sm');
      expect(a.querySelector('.ocx-ui-link__end')?.textContent).toBe('⁠');
      expect(a.textContent).toBe('Docs⁠');
    });

    it('external does not imply newTab', async () => {
      const { a } = await render({ href: 'https://example.com' });
      expect(a.hasAttribute('target')).toBe(false);
      expect(a.hasAttribute('rel')).toBe(false);
      expect(a.querySelector('.ocx-ui-link__sr')).toBeNull();
    });
  });

  it('newTab sets target and rel and appends the hidden text', async () => {
    const { a } = await render({ href: '/docs/', newTab: true });
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toBe('noopener noreferrer');
    const sr = a.querySelector('.ocx-ui-link__sr');
    expect(sr?.textContent).toBe(' (opens in a new tab)');
    expect(a.textContent).toBe('Docs (opens in a new tab)');
  });

  it('newTab with external keeps the icon before the hidden text', async () => {
    const { a } = await render({ href: 'https://example.com', newTab: true });
    const kids = [...a.children].map((c) => c.className);
    expect(kids.map((k) => k.split(' ')[0])).toEqual(['ocx-ui-link__end', 'ocx-ui-link__sr']);
  });

  it('aria-disabled="true" drops href and sets role=link', async () => {
    const { a } = await render({ href: '/docs/', 'aria-disabled': 'true' });
    expect(a.hasAttribute('href')).toBe(false);
    expect(a.getAttribute('role')).toBe('link');
    expect(a.getAttribute('aria-disabled')).toBe('true');
  });

  it('a link without aria-disabled keeps its href and no role', async () => {
    const { a } = await render({ href: '/docs/', 'aria-disabled': 'false' });
    expect(a.getAttribute('href')).toBe('/docs/');
    expect(a.hasAttribute('role')).toBe(false);
  });

  it('spreads rest attributes and merges class', async () => {
    const { a } = await render({
      href: '/docs/',
      class: 'extra',
      id: 'l1',
      'aria-label': 'Read the docs',
      'data-x': '1',
      hreflang: 'en',
    });
    expect(a.id).toBe('l1');
    expect(a.getAttribute('aria-label')).toBe('Read the docs');
    expect(a.dataset['x']).toBe('1');
    expect(a.getAttribute('hreflang')).toBe('en');
    expect(a.classList.contains('extra')).toBe(true);
    expect(a.classList.contains('ocx-ui-link')).toBe(true);
  });

  it('keeps a caller rel and target without newTab', async () => {
    const { a, html } = await render({ href: '/docs/', rel: 'nofollow', target: '_self' });
    expect(html.match(/\shref=/g)).toHaveLength(1);
    expect(a.getAttribute('rel')).toBe('nofollow');
    expect(a.getAttribute('target')).toBe('_self');
  });

  it('styles sit in @layer ocx, tokens only (no literal colours)', () => {
    const s = readFileSync(new URL('../src/components/ui/link.css', import.meta.url), 'utf8');
    expect(s).toMatch(/@layer ocx\s*\{/);
    expect(s).toMatch(/var\(--ocx-/);
    expect(s).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(/i);
  });
});
