// Sidebar (plain Astro, outside Starlight): markup via the Astro Container API (node env), parsed with JSDOM.
// Zero client JS, so there is no DOM behaviour file; the live page is tests/e2e/sidebar-plain.spec.ts.
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
// @ts-expect-error jsdom ships no types and @types/jsdom is not a dependency
import * as jsdom from 'jsdom';
import { beforeAll, describe, expect, it } from 'vitest';
import { probeErrorLines } from './astro-props.ts';

type Component = Parameters<AstroContainer['renderToString']>[0];
const { JSDOM } = jsdom as { JSDOM: new (html: string) => { window: Window } };
// Template import: tsc has no .astro module types (as in ui-breadcrumbs.test.ts).
const load = async (name: string) =>
  ((await import(`../src/components/ui/${name}.astro`)) as { default: Component }).default;
const Sidebar = await load('Sidebar');
const SOURCE = new URL('../src/components/ui/Sidebar.astro', import.meta.url);

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});

async function render(props: Record<string, unknown>) {
  const html = await container.renderToString(Sidebar, { props });
  return { html, doc: new JSDOM(`<body>${html}</body>`).window.document };
}

const groups = [
  {
    label: 'Getting started',
    href: '/docs/start/',
    items: [
      { label: 'Install', href: '/docs/install/' },
      { label: 'First package', href: '/docs/first/', current: true },
    ],
  },
  { label: '', items: [{ label: 'Changelog', href: '/docs/changelog/' }] },
  { label: 'Guides', items: [{ label: 'Publishing', href: '/docs/publishing/' }] },
];

describe('Sidebar', () => {
  it('is a labelled nav landmark (default "Documentation", overridable)', async () => {
    expect((await render({ groups })).doc.querySelector('nav')?.getAttribute('aria-label')).toBe('Documentation');
    expect((await render({ groups, label: 'Reference' })).doc.querySelector('nav')?.getAttribute('aria-label')).toBe(
      'Reference',
    );
  });

  it('renders one section and list per group, one link per item, in order', async () => {
    const { doc } = await render({ groups });
    expect(doc.querySelectorAll('section.ocx-ui-sidebar__group')).toHaveLength(3);
    expect([...doc.querySelectorAll('li a')].map((a) => [a.textContent.trim(), a.getAttribute('href')])).toEqual([
      ['Install', '/docs/install/'],
      ['First package', '/docs/first/'],
      ['Changelog', '/docs/changelog/'],
      ['Publishing', '/docs/publishing/'],
    ]);
  });

  it('marks only the current item with aria-current="page"', async () => {
    const { doc } = await render({ groups });
    const current = [...doc.querySelectorAll('[aria-current]')];
    expect(current.map((a) => [a.getAttribute('aria-current'), a.textContent.trim()])).toEqual([
      ['page', 'First package'],
    ]);
  });

  it('a heading is plain text, a link with href, and absent for an empty label', async () => {
    const { doc } = await render({ groups });
    const headings = [...doc.querySelectorAll('h2')];
    expect(headings.map((h) => h.textContent.trim())).toEqual(['Getting started', 'Guides']);
    expect(headings[0]?.querySelector('a')?.getAttribute('href')).toBe('/docs/start/');
    expect(headings[1]?.querySelector('a')).toBeNull();
  });

  it('ships no script and no inline style value', async () => {
    const { html } = await render({ groups });
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/ style=/);
  });

  it('types: groups is required and items need href and label', () => {
    const lines = probeErrorLines(
      SOURCE,
      [
        `const ok: Props = { groups: [{ label: 'a', items: [{ href: '/', label: 'b' }] }] };`,
        `const bad1: Props = {};`,
        `const bad2: Props = { groups: [{ label: 'a', items: [{ href: '/' }] }] };`,
      ].join('\n'),
    );
    expect(lines).toEqual([1, 2]);
  });
});
