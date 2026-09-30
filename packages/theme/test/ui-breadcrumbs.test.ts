// Breadcrumbs (design "Prev / next · breadcrumb" tile): markup via the Astro Container API (node env),
// parsed with JSDOM. Zero client JS, so there is no DOM behaviour file; collapse is CSS + native popover.
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
const Breadcrumbs = await load('Breadcrumbs');

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});

async function render(props: Record<string, unknown>) {
  const html = await container.renderToString(Breadcrumbs, { props });
  return { html, doc: new JSDOM(`<body>${html}</body>`).window.document };
}

const three = [{ label: 'ocx.sh', href: '/' }, { label: 'docs', href: '/docs/' }, { label: 'Install' }];
const five = [
  { label: 'ocx.sh', href: '/' },
  { label: 'docs', href: '/docs/' },
  { label: 'Guides' },
  { label: 'Publishing', href: '/docs/publishing/' },
  { label: 'Signing' },
];
const trailItems = (doc: Document) => [...doc.querySelectorAll('nav > ol > li:not(.ocx-ui-crumbs__more)')];

describe('Breadcrumbs', () => {
  it('renders a labelled nav landmark over an ordered list, one li per item', async () => {
    const { doc } = await render({ items: three });
    const nav = doc.querySelector('nav.ocx-ui-crumbs');
    expect(nav?.getAttribute('aria-label')).toBe('Breadcrumbs');
    expect(trailItems(doc).map((li) => li.textContent.trim())).toEqual(['ocx.sh', 'docs', 'Install']);
    expect((await render({ items: three, label: 'Trail' })).doc.querySelector('nav')?.getAttribute('aria-label')).toBe(
      'Trail',
    );
  });

  it('the last item is the current page: aria-current, never a link, even with an href', async () => {
    const { doc } = await render({ items: [...three.slice(0, 2), { label: 'Install', href: '/docs/install/' }] });
    const current = doc.querySelectorAll('[aria-current]');
    expect(current).toHaveLength(1);
    expect(current[0]?.getAttribute('aria-current')).toBe('page');
    expect(current[0]?.tagName).toBe('SPAN');
    expect(doc.querySelector('a[href="/docs/install/"]')).toBeNull();
  });

  it('items with an href are links; items without one are plain text', async () => {
    const { doc } = await render({ items: five });
    const links = [...doc.querySelectorAll('nav > ol > li > a')];
    expect(links.map((a) => [a.textContent.trim(), a.getAttribute('href')])).toEqual([
      ['ocx.sh', '/'],
      ['docs', '/docs/'],
      ['Publishing', '/docs/publishing/'],
    ]);
    expect(trailItems(doc)[2]?.querySelector('a')).toBeNull();
  });

  it('the separator is CSS with empty alt text, never text in the tree', async () => {
    const { doc } = await render({ items: three });
    expect(doc.querySelector('nav')?.textContent.replace(/\s+/g, '')).toBe('ocx.shdocsInstall');
    const src = readFileSync(new URL('../src/components/ui/breadcrumbs.css', import.meta.url), 'utf8');
    expect(src).toContain("content: '/' / '';");
  });

  it('a leading icon comes from the registry, decorative', async () => {
    const { doc } = await render({ items: [{ label: 'shell', href: '/', icon: 'shell' }, { label: 'x' }] });
    const svg = doc.querySelector('a svg.ocx-icon');
    expect(svg?.getAttribute('data-icon')).toBe('shell');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
  });

  it('a long label keeps its full text in title; a short one has no title', async () => {
    const long = 'A very long page title that will not fit the trail';
    const { doc } = await render({ items: [{ label: 'docs', href: '/docs/' }, { label: long }] });
    expect(doc.querySelector('[aria-current]')?.getAttribute('title')).toBe(long);
    expect(doc.querySelector('a')?.hasAttribute('title')).toBe(false);
  });

  it('three items or fewer: no collapse control', async () => {
    const { doc } = await render({ items: three });
    expect(doc.querySelector('.ocx-ui-crumbs__more, [data-mid], [popover]')).toBeNull();
  });

  it('more than three: the middle items are marked foldable and repeated in a native popover', async () => {
    const { doc } = await render({ items: five, id: 'crumbs-x' });
    expect(trailItems(doc).map((li) => li.hasAttribute('data-mid'))).toEqual([false, true, true, false, false]);
    const more = doc.querySelector('.ocx-ui-crumbs__more');
    expect(more?.previousElementSibling?.textContent.trim()).toBe('ocx.sh');
    const button = more?.querySelector('button');
    expect(button?.getAttribute('type')).toBe('button');
    expect(button?.getAttribute('popovertarget')).toBe('crumbs-x');
    expect(button?.getAttribute('aria-label')).toBe('Show 2 more');
    const panel = doc.getElementById('crumbs-x');
    expect(panel?.hasAttribute('popover')).toBe(true);
    expect([...(panel?.querySelectorAll('li') ?? [])].map((li) => li.textContent.trim())).toEqual(['docs', 'Guides']);
    expect(panel?.querySelector('a')?.getAttribute('href')).toBe('/docs/');
  });

  it('a single item renders just the current page', async () => {
    const { doc } = await render({ items: [{ label: 'Home' }] });
    expect(trailItems(doc)).toHaveLength(1);
    expect(doc.querySelector('[aria-current="page"]')?.textContent.trim()).toBe('Home');
  });

  it('ships zero client JS; styles in @layer ocx, tokens only', async () => {
    const { html } = await render({ items: five });
    expect(html).not.toMatch(/<script/);
    const style = readFileSync(new URL('../src/components/ui/breadcrumbs.css', import.meta.url), 'utf8');
    expect(style).toMatch(/@layer ocx\s*\{/);
    expect(style).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(/i);
  });
});
