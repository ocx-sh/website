// TileGrid: tiles with a title, subtitle and optional registry icon; a footer slot across the columns.
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
// @ts-expect-error jsdom ships no types and @types/jsdom is not a dependency
import * as jsdom from 'jsdom';
import { beforeAll, describe, expect, it } from 'vitest';

type Component = Parameters<AstroContainer['renderToString']>[0];
const TileGrid = ((await import(`../src/components/${'TileGrid'}.astro`)) as { default: Component }).default;
const { JSDOM } = jsdom as { JSDOM: new (html: string) => { window: { document: Document } } };

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});
const render = async (props: Record<string, unknown>, slots: Record<string, string> = {}) =>
  new JSDOM(await container.renderToString(TileGrid, { props, slots })).window.document;

const tiles = [
  { title: 'GitHub', subtitle: 'ghcr.io', icon: 'github' },
  { title: 'Harbor', subtitle: 'self-hosted' },
  { title: 'Bare' },
];

describe('TileGrid', () => {
  it('renders one list item per tile: title, then subtitle when given', async () => {
    const doc = await render({ tiles, label: 'Registries' });
    expect(doc.querySelector('ul')?.getAttribute('aria-label')).toBe('Registries');
    const items = [...doc.querySelectorAll('li')];
    expect(items.map((li) => li.querySelector('b')?.textContent?.trim())).toEqual(['GitHub', 'Harbor', 'Bare']);
    expect(items.map((li) => li.querySelector('span.ocx-tiles__subtitle')?.textContent ?? null)).toEqual([
      'ghcr.io',
      'self-hosted',
      null,
    ]);
  });

  it('draws an icon from the registry only for a tile that names one, decorative', async () => {
    const doc = await render({ tiles });
    const icons = [...doc.querySelectorAll('li')].map((li) => li.querySelector('svg.ocx-icon'));
    expect(icons[0]?.getAttribute('data-icon')).toBe('github');
    expect(icons[0]?.getAttribute('aria-hidden')).toBe('true');
    expect(icons[1]).toBeNull();
  });

  it('throws at build for an icon the registry lacks', async () => {
    await expect(render({ tiles: [{ title: 'x', icon: 'no-such-icon' }] })).rejects.toThrow(/no icon named/);
  });

  it('renders the footer slot after the tiles, only when given', async () => {
    const doc = await render({ tiles }, { footer: '<code id="cmd">ocx add ghcr.io/acme/deploy:2.1</code>' });
    const footer = doc.querySelector('.ocx-tiles > .ocx-tiles__footer');
    expect(footer?.querySelector('#cmd')?.textContent).toBe('ocx add ghcr.io/acme/deploy:2.1');
    expect(footer?.previousElementSibling?.tagName).toBe('UL');
    expect((await render({ tiles })).querySelector('.ocx-tiles__footer')).toBeNull();
  });
});
