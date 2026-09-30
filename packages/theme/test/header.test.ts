// Header markup (C-023, C-190…C-192, C-130a/b): the section nav is a Zag navigation-menu whose
// every part is SSR-final; the ecosystem Content is the mega panel, a popover with a vertical
// Zag tabs rail. JS-off semantics here; browser behaviour is header.spec.ts.
import { readFileSync } from 'node:fs';
import * as tabsZag from '@zag-js/tabs';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
// @ts-expect-error jsdom ships no types and @types/jsdom is not a dependency
import * as jsdom from 'jsdom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import * as nm from '../src/components/navigation-menu.zag.mjs';
import { ssrApi } from '../src/components/ui/zag-runtime.mjs';
import nav from '../src/nav.json' with { type: 'json' };
import { activeSection } from '../src/nav.mjs';
import { domAttrs } from './zag-helpers.ts';

type Component = Parameters<AstroContainer['renderToString']>[0];
const { JSDOM } = jsdom as { JSDOM: new (html: string) => { window: Window & typeof globalThis } };
const load = async (dir: string, name: string): Promise<Component> =>
  ((await import(`../src/${dir}/${name}.astro`)) as { default: Component }).default;

// Minimum locals: Starlight's Search reads only `t` / `t.all()`; the overrides read `starlightRoute`.
const t = Object.assign((key: string) => key, { all: () => ({}) });
let container: AstroContainer;
let Header: Component;
let EcosystemMenu: Component;

async function render(component: Component, pathname = '/docs/x/'): Promise<Document> {
  const html = await container.renderToString(component, {
    request: new Request(`https://ocx.sh${pathname}`),
    locals: { t, starlightRoute: {} } as unknown as App.Locals,
  });
  return new JSDOM(html).window.document;
}

/** Attributes Zag owns on an element: ours (class, Astro scoping, section hooks, the JS-off
 * popover wiring, the wrapper's data-zag-*) are left out. */
const OWN = /^(class|data-astro-.*|data-ocx-.*|data-zag-(root|state|props|id)|aria-label|href|popover(target)?)$/;
const zagAttrs = (el: Element | null | undefined) =>
  Object.fromEntries([...(el?.attributes ?? [])].filter((a) => !OWN.test(a.name)).map((a) => [a.name, a.value]));

const NM = '.ocx-header__nav';
const ecosystem = nav.sections.find((s) => !('href' in s));

afterEach(() => {
  vi.unstubAllGlobals();
});

beforeAll(async () => {
  container = await AstroContainer.create();
  Header = await load('starlight', 'Header');
  EcosystemMenu = await load('components', 'EcosystemMenu');
});

describe('C-023 Header sections', () => {
  it('C-023: renders the .ocx-header root', async () => {
    expect((await render(Header)).querySelector('.ocx-header')).not.toBeNull();
  });

  it('D-R3 fallback: Header keeps its inline brand copy, not <Logo>: a link, the 20px mark, the wordmark', async () => {
    const brand = (await render(Header)).querySelector('.ocx-header > .ocx-header__brand');
    expect(brand?.tagName).toBe('A');
    expect(brand?.classList.contains('ocx-logo')).toBe(false);
    expect(brand?.getAttribute('href')).toBe(nav.brand.href);
    expect(brand?.getAttribute('aria-label')).toBe('ocx home');
    const [svg, word] = [...(brand?.children ?? [])];
    expect(svg?.getAttribute('width')).toBe('20');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(word?.tagName).toBe('SPAN');
    expect(word?.textContent).toBe(nav.brand.wordmark);
  });

  it.each(nav.sections.map((s) => [s.id, s] as const))(
    'C-190: section %s is a Link item or the Trigger of an Item whose Content is a popover',
    async (_, s) => {
      const doc = await render(Header);
      const el = doc.querySelector(`.ocx-header [data-ocx-section="${s.id}"]`);
      expect(el?.textContent.trim()).toBe(s.label);
      expect(el?.parentElement?.matches(`${NM} > ul > li`)).toBe(true);
      if ('href' in s) {
        expect(el?.tagName).toBe('A');
        expect(el?.getAttribute('href')).toBe(s.href);
      } else {
        expect(el?.tagName).toBe('BUTTON');
        // C-192: the JS-off fallback names the Content, which is a popover.
        const target = el?.getAttribute('popovertarget') ?? '';
        expect(target).toBe(el?.getAttribute('aria-controls'));
        const content = doc.getElementById(target);
        expect(content?.hasAttribute('popover')).toBe(true);
        expect(content?.matches('nav.ocx-mega')).toBe(true);
      }
    },
  );

  it.each([
    ['/docs/x/', 'docs'],
    ['/integrations/bazel/x/', 'ecosystem'],
    ['/apps/', 'ecosystem'],
    ['/install/', 'install'],
    ['/', ''],
  ])('C-023/C-007/C-192: %s → aria-current="page" only on %j', async (pathname, section) => {
    expect(activeSection(nav, pathname)).toBe(section);
    const current = [...(await render(Header, pathname)).querySelectorAll('.ocx-header [aria-current]')];
    expect(current.map((el) => [el.getAttribute('data-ocx-section'), el.getAttribute('aria-current')])).toEqual(
      section ? [[section, 'page']] : [],
    );
  });

  it('C-130b/C-192: the nav is an interaction-triggered Zag root (loads on first pointerenter/focusin)', async () => {
    const doc = await render(Header);
    const root = doc.querySelector<HTMLElement>('.ocx-header [data-zag-root="navigation-menu"]');
    expect(root?.dataset['zagRoot']).toBe('navigation-menu');
    expect(root?.querySelector('nav.ocx-header__nav[aria-label="ocx sections"]')).not.toBeNull();
    expect(root?.dataset['zagState']).toBe('idle');
    expect(root?.dataset['zagId']).toBe(nm.NAV_ID);
    expect(root?.hasAttribute('data-zag-trigger')).toBe(false);
    expect(JSON.parse(root?.dataset['zagProps'] ?? '')).toMatchObject({ openDelay: 200 });
  });

  // SSR carries connect()'s attributes minus `lean`'s (defaults and live-only ones, Spec Delta C-130a Z9).
  it.each(['/docs/x/', '/apps/'])('C-130a: %s SSR parts equal lean connect() of an unstarted machine', async (path) => {
    const doc = await render(Header, path);
    const root = doc.querySelector<HTMLElement>('.ocx-header [data-zag-root="navigation-menu"]');
    const own = JSON.parse(root?.dataset['zagProps'] ?? '{}') as Record<string, unknown>;
    const api = ssrApi(nm.machine, nm.connect, { ...own, id: nm.NAV_ID, ids: nm.ids });
    const parts = nm.parts(api);
    const ssr = (attrs: Record<string, unknown>) => domAttrs(nm.lean(attrs, { nav: true }));
    expect(zagAttrs(root)).toEqual(ssr(parts.root));
    expect(zagAttrs(doc.querySelector(`${NM} > ul`))).toEqual(ssr(parts.list));
    const active = activeSection(nav, path);
    for (const s of nav.sections) {
      const item = doc.querySelector(`${NM} [data-ocx-section="${s.id}"]`)?.parentElement;
      expect(zagAttrs(item), `item ${s.id}`).toEqual(ssr(parts.item(s.id)));
      const part = item?.firstElementChild;
      if ('href' in s) expect(zagAttrs(part), `link ${s.id}`).toEqual(ssr(parts.link(s.id, s.id === active)));
      else {
        // C-192: aria-current is ours (Zag's trigger has none); aria-expanded comes with the machine.
        const { 'aria-current': current, ...rest } = zagAttrs(part);
        expect(current).toBe(s.id === active ? 'page' : undefined);
        expect(rest, `trigger ${s.id}`).toEqual(ssr(parts.trigger(s.id, { ssr: true })));
        expect(zagAttrs(doc.getElementById(nm.ids.content(s.id))), `content ${s.id}`).toEqual(ssr(parts.content(s.id)));
      }
    }
    expect(doc.querySelector('.ocx-header [data-focus], .ocx-header [data-focus-visible]')).toBeNull();
    // What `lean` drops is a default or live-only: nothing the first paint or JS-off reads.
    expect(root?.querySelector('[dir], [data-scope], [style]')).toBeNull();
  });

  it('C-192: SSR trigger and Content, literally: wired by id, no aria-expanded, no hidden', async () => {
    const doc = await render(Header);
    const trigger = doc.querySelector(`${NM} button`);
    expect(zagAttrs(trigger)).toEqual({
      id: 'nav-menu:ocx-nav:trigger:ecosystem',
      type: 'button',
      'aria-controls': 'ocx-ecosystem-menu',
    });
    expect(trigger?.getAttribute('popovertarget')).toBe('ocx-ecosystem-menu');
    const content = doc.getElementById('ocx-ecosystem-menu');
    expect(zagAttrs(content)).toEqual({
      id: 'ocx-ecosystem-menu',
      'aria-labelledby': 'nav-menu:ocx-nav:trigger:ecosystem',
    });
    expect(content?.hasAttribute('popover')).toBe(true);
  });

  it("C-192: Search.astro, the header's one early script, mounts the navigation-menu root", () => {
    const src = readFileSync(new URL('../src/starlight/Search.astro', import.meta.url), 'utf8');
    const script = src.split('<script>').slice(1).join('');
    expect(script).toMatch(/querySelector<HTMLElement>\('\.ocx-header \[data-zag-root="navigation-menu"\]'\)/);
    expect(script).toMatch(/mount\(nav, \{ load: \(\) => import\('\.\.\/components\/navigation-menu\.zag\.mjs'\) \}\)/);
  });

  it('D-Z21: no Hint (Zag tooltip) on header buttons', async () => {
    expect((await render(Header)).querySelector('.ocx-header [data-zag-root="tooltip"]')).toBeNull();
  });

  it('C-130f: header and panel styles live in @layer ocx and use --ocx-* tokens only', () => {
    for (const file of ['../src/starlight/Header.astro', '../src/components/EcosystemMenu.astro']) {
      const css = readFileSync(new URL(file, import.meta.url), 'utf8').split('<style')[1] ?? '';
      expect(css, file).toMatch(/^[^{]*>\s*@layer ocx\s*\{/);
      expect(css.match(/var\(--(?!ocx-|_|sl-)[\w-]+/g) ?? [], file).toEqual([]);
      expect(css.match(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(/gi) ?? [], file).toEqual([]);
    }
  });
});

describe('C-023 EcosystemMenu markup', () => {
  it('C-023: header trigger popovertarget equals the popover panel id', async () => {
    const doc = await render(Header);
    const panel = doc.querySelector('.ocx-mega[popover]');
    expect(panel?.id).toBe(nm.ids.content(ecosystem?.id ?? ''));
    expect(doc.querySelector('.ocx-header button[popovertarget]')?.getAttribute('popovertarget')).toBe(panel?.id);
  });

  it('C-191: rail is a vertical Zag tablist, one tab per hub, one selected; hub links sit outside it', async () => {
    const doc = await render(EcosystemMenu);
    const list = doc.querySelector('.ocx-mega__rail [role="tablist"]');
    expect(list?.getAttribute('aria-orientation')).toBe('vertical');
    const tabs = [...(list?.querySelectorAll('[role="tab"]') ?? [])];
    expect(tabs.map((t) => [t.tagName, t.getAttribute('data-value'), t.textContent.trim()])).toEqual(
      nav.hubs.map((h) => ['BUTTON', h.id, h.label]),
    );
    expect(tabs.filter((t) => t.getAttribute('aria-selected') === 'true')).toHaveLength(1);
    for (const tab of tabs) {
      const panel = doc.querySelector(`[aria-labelledby="${tab.id}"]`);
      expect(panel?.getAttribute('role')).toBe('tabpanel');
      expect(panel?.matches(`.ocx-mega__panel[data-ocx-hub="${tab.getAttribute('data-value')}"]`)).toBe(true);
    }
    // A tablist owns tabs only (axe aria-required-children): the hub links are its sibling.
    expect(list?.querySelector('a')).toBeNull();
    expect(
      [...doc.querySelectorAll('.ocx-mega__rail a.ocx-mega__hub-link')].map((a) => a.getAttribute('href')),
    ).toEqual(nav.hubs.map((h) => h.href));
    expect(doc.querySelector('fieldset, input[type="radio"]')).toBeNull();
  });

  it('C-130a: the rail SSR equals lean connect() of an unstarted vertical tabs machine', async () => {
    const doc = await render(EcosystemMenu);
    const api = ssrApi(tabsZag.machine, tabsZag.connect, {
      id: nm.RAIL_ID,
      orientation: 'vertical',
      defaultValue: nav.hubs[0]?.id,
    });
    const ssr = (attrs: Record<string, unknown>) => domAttrs(nm.lean(attrs));
    expect(zagAttrs(doc.querySelector('.ocx-mega [data-part="root"]'))).toEqual(ssr(api.getRootProps()));
    expect(zagAttrs(doc.querySelector('.ocx-mega [data-part="list"]'))).toEqual(ssr(api.getListProps()));
    for (const h of nav.hubs) {
      expect(zagAttrs(doc.querySelector(`[role="tab"][data-value="${h.id}"]`)), `tab ${h.id}`).toEqual(
        ssr(api.getTriggerProps({ value: h.id })),
      );
      expect(zagAttrs(doc.querySelector(`.ocx-mega__panel[data-ocx-hub="${h.id}"]`)), `panel ${h.id}`).toEqual(
        ssr(api.getContentProps({ value: h.id })),
      );
    }
  });

  it('C-023: strip is present', async () => {
    expect((await render(EcosystemMenu)).querySelector('.ocx-mega__strip')).not.toBeNull();
  });

  // The component takes no props, so the caps are checked against the real
  // nav.json. Today no category holds more than 5 entries, so the "n more →"
  // branch is asserted absent here; the >5 case needs a fixture nav or props.
  it.each(nav.hubs.map((h) => [h.id, h] as const))(
    'C-023: hub %s panel caps ≤4 categories × ≤5 items, each with desc, "n more →" past 5',
    async (_, hub) => {
      const doc = await render(EcosystemMenu);
      const panel = doc.querySelector(`.ocx-mega__panel[data-ocx-hub="${hub.id}"]`);
      expect(panel).not.toBeNull();
      const categories = [...(panel?.querySelectorAll('.ocx-mega__category') ?? [])];
      expect(categories).toHaveLength(Math.min(4, hub.categories.length));
      for (const [i, cat] of categories.entries()) {
        const entries = nav.entries.filter((e) => e.hub === hub.id && e.category === hub.categories[i]?.id);
        const items = [...cat.querySelectorAll('.ocx-mega__item')].filter((li) => !li.querySelector('.ocx-mega__more'));
        expect(items.length).toBeLessThanOrEqual(5);
        expect(items).toHaveLength(Math.min(5, entries.length));
        expect(items.map((li) => li.querySelector('.ocx-mega__desc')?.textContent.trim())).toEqual(
          entries.slice(0, 5).map((e) => e.desc),
        );
        const more = cat.querySelector('.ocx-mega__more');
        if (entries.length > 5) {
          expect(more?.textContent.trim()).toBe(`${entries.length - 5} more →`);
          expect(more?.getAttribute('href')).toBe(hub.href);
        } else {
          expect(more).toBeNull();
        }
      }
    },
  );
});

describe('C-105 navigation-menu.zag readDom', () => {
  it('passes the stable content ids and surfaces value changes as ocx:navigation-menu:change', () => {
    const { window } = new JSDOM('<nav></nav>');
    vi.stubGlobal('CustomEvent', window.CustomEvent); // emit runs in the page's realm
    const root = window.document.querySelector('nav') as HTMLElement;
    const props = nm.readDom(root) as { ids: unknown; onValueChange: (d: { value: string }) => void };
    expect(props.ids).toBe(nm.ids);
    const seen: unknown[] = [];
    root.addEventListener('ocx:navigation-menu:change', (e) => seen.push((e as CustomEvent).detail));
    props.onValueChange({ value: 'ecosystem' });
    expect(seen).toEqual([{ value: 'ecosystem' }]);
  });
});
