// C-067, C-303 HubGrid: a hub's entries grouped by category in nav.json order.
// Rendered with the Astro Container API (node environment), parsed with JSDOM.
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
// @ts-expect-error jsdom ships no types and @types/jsdom is not a dependency
import * as jsdom from 'jsdom';
import { beforeAll, describe, expect, it } from 'vitest';
import nav from '../src/nav.json' with { type: 'json' };

type Win = Window & typeof globalThis;
type Component = Parameters<AstroContainer['renderToString']>[0];
// Template import: tsc has no .astro module types (as in chrome.test.ts).
const HubGrid = ((await import(`../src/components/${'HubGrid'}.astro`)) as { default: Component }).default;
const { JSDOM } = jsdom as { JSDOM: new (html: string) => { window: Win } };

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});

async function render(hub: string): Promise<Document> {
  const html = await container.renderToString(HubGrid, { props: { hub } });
  return new JSDOM(html).window.document;
}

const groups = (doc: Document) => [...doc.querySelectorAll<HTMLElement>('.ocx-hub-grid__group')];
const items = (el: ParentNode) => [...el.querySelectorAll<HTMLElement>('.ocx-hub-grid__item')];

describe('C-303 HubGrid', () => {
  it.each(nav.hubs)(
    'C-303 HubGrid: $id lists its categories in nav.json order, each entry under its category',
    async (hub) => {
      const doc = await render(hub.id);
      expect(groups(doc).map((g) => g.dataset.ocxCategory)).toEqual(hub.categories.map((c) => c.id));
      for (const group of groups(doc)) {
        const ids = nav.entries
          .filter((e) => e.hub === hub.id && e.category === group.dataset.ocxCategory)
          .map((e) => e.id);
        expect(items(group).map((i) => i.dataset.ocxEntry)).toEqual(ids);
      }
      const heading = groups(doc)[0]?.querySelector('h2');
      expect(heading?.textContent?.trim()).toBe(hub.categories[0]?.label);
      expect(groups(doc)[0]?.getAttribute('aria-labelledby')).toBe(heading?.id);
    },
  );

  it('C-067 HubGrid: a planned entry is labelled "planned" and carries no href', async () => {
    const doc = await render('integrations');
    const cmake = doc.querySelector<HTMLElement>('[data-ocx-entry="cmake"]');
    expect(cmake?.dataset.planned).toBe('true');
    expect(cmake?.textContent).toContain('planned');
    expect(cmake?.querySelector('a, [href]')).toBeNull();
    expect(cmake?.textContent).toContain('CMake');
    // Every planned entry of the hub, and only those, is unlinked.
    for (const e of nav.entries.filter((x) => x.hub === 'integrations')) {
      const el = doc.querySelector(`[data-ocx-entry="${e.id}"]`);
      expect(el?.querySelector('a[href]') === null, e.id).toBe('planned' in e);
    }
  });

  it('C-067 HubGrid: an internal entry is a plain link without the external mark or "planned"', async () => {
    const bazel = (await render('integrations')).querySelector('[data-ocx-entry="bazel"]');
    expect(bazel?.querySelector('a')?.getAttribute('href')).toBe('/integrations/bazel/');
    expect(bazel?.querySelector('[data-icon="external"]')).toBeNull();
    expect(bazel?.textContent).not.toContain('planned');
    expect(bazel?.textContent).not.toContain('(external)');
  });

  it('C-067 HubGrid: an external entry shows the ↗ icon with the accessible text "(external)"', async () => {
    const lore = (await render('apps')).querySelector('[data-ocx-entry="lore"]');
    expect(lore?.querySelector('a')?.getAttribute('href')).toBe('https://lore.ocx.sh/');
    const icon = lore?.querySelector('svg[data-icon="external"]');
    expect(icon?.getAttribute('role')).toBe('img');
    expect(icon?.getAttribute('aria-label')).toBe('(external)');
  });

  it('C-303 HubGrid: an unknown hub fails the build', async () => {
    await expect(render('nope')).rejects.toThrow(/nope/);
  });
});
