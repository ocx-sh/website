// Sidebar and mobile menu markup (C-230, C-231, C-130a/b, S-109): the top level is the design's
// flat list, nested groups are Zag collapsibles whose SSR equals connect(); Starlight's persistence
// hooks and semantics are kept, and the pre-paint restore script runs here in jsdom. The toggle is a
// manual Zag drawer root whose SSR keeps the JS-off popover fallback. Browser behaviour (drawer,
// swipe, focus, restore across navigation) is tests/e2e/{mobile,sidebar}.spec.ts.
import * as collapsible from '@zag-js/collapsible';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
// @ts-expect-error jsdom ships no types and @types/jsdom is not a dependency
import * as jsdom from 'jsdom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ssrApi } from '../src/components/ui/zag-runtime.mjs';
import * as menu from '../src/starlight/mobile-menu.zag.mjs';
import { domAttrs } from './zag-helpers.ts';

type Component = Parameters<AstroContainer['renderToString']>[0];
type Win = Window & typeof globalThis;
type Options = { runScripts?: 'dangerously'; url?: string; beforeParse?: (w: Win) => void };
const { JSDOM } = jsdom as { JSDOM: new (html: string, options?: Options) => { window: Win } };
const load = async (name: string): Promise<Component> =>
  ((await import(`../src/starlight/${name}.astro`)) as { default: Component }).default;

const t = Object.assign((key: string) => ({ 'menuButton.accessibleLabel': 'Menu' })[key] ?? key, { all: () => ({}) });
let container: AstroContainer;

const link = (label: string, href: string, isCurrent = false, extra = {}) => ({
  type: 'link' as const,
  label,
  href,
  isCurrent,
  badge: undefined,
  attrs: {},
  ...extra,
});
const group = (label: string, entries: unknown[], collapsed = false) => ({
  type: 'group' as const,
  label,
  entries,
  collapsed,
  badge: undefined,
});

/** A top-level link, a top-level group holding links and nested groups (one current, one collapsed, one nested deeper). */
const sidebar = (current = '/docs/b/') => [
  link('Components', '/docs/components/', current === '/docs/components/'),
  group('Guides', [
    link('A', '/docs/a/', current === '/docs/a/', { badge: { text: 'new', variant: 'tip' } }),
    group('Current', [link('B', '/docs/b/', current === '/docs/b/')], true),
    group(
      'Closed',
      [link('C', '/docs/c/', current === '/docs/c/'), group('Deep', [link('D', '/docs/d/')], true)],
      true,
    ),
    group('Open 🚀', [link('E', '/docs/e/')], false),
  ]),
];

async function html(name: string, entries: unknown[] = sidebar(), pathname = '/docs/b/'): Promise<string> {
  return container.renderToString(await load(name), {
    request: new Request(`https://ocx.sh${pathname}`),
    locals: {
      t,
      starlightRoute: { hasSidebar: true, sidebar: entries, entry: { data: { title: 'x' } }, dir: 'ltr' },
    } as unknown as App.Locals,
  });
}
const doc = (markup: string) => new JSDOM(markup).window.document;

beforeAll(async () => {
  container = await AstroContainer.create();
});

/** Starlight 0.42's own `getSidebarHash` (utils/navigation; not in its export map, so by path). */
const { getSidebarHash: starlightHash } = (await import(
  /* @vite-ignore */ '../node_modules/@astrojs/starlight/dist/utils/navigation.js'
)) as { getSidebarHash: (entries: unknown[]) => string };

/** A group root's machine props, as SSR or the restore script wrote them. */
const zagProps = (g: HTMLElement): unknown => JSON.parse(g.dataset['zagProps']!) as unknown;
const groups = (d: Document) => [...d.querySelectorAll<HTMLElement>('[data-zag-root="collapsible"]')];
const label = (g: Element) => g.querySelector('[data-part="trigger"]')?.firstChild?.textContent;
const ssr = (id: string, defaultOpen: boolean) => ssrApi(collapsible.machine, collapsible.connect, { id, defaultOpen });

/** A group's Zag-owned attributes per part, as the DOM reads them. */
function partAttrs(g: Element) {
  const read = (el: Element | null) =>
    Object.fromEntries(
      [...(el?.attributes ?? [])].filter((a) => !/^(class|data-zag-.*)$/.test(a.name)).map((a) => [a.name, a.value]),
    );
  const trigger = g.querySelector(':scope > [data-part="trigger"]');
  return { root: read(g), trigger: read(trigger), content: read(trigger?.nextElementSibling ?? null) };
}
const apiAttrs = (id: string, open: boolean) => {
  const api = ssr(id, open);
  return {
    root: domAttrs(api.getRootProps()),
    trigger: domAttrs(api.getTriggerProps()),
    content: domAttrs(api.getContentProps()),
  };
};

describe('C-230 Sidebar markup', () => {
  it('the top level is flat: links and group labels, no disclosure, no <details>', async () => {
    const d = doc(await html('Sidebar'));
    const top = d.querySelector('sl-sidebar-state-persist > ul.top-level');
    expect(top).not.toBeNull();
    expect(d.querySelector('details, summary')).toBeNull();
    const [first, second] = [...top!.children];
    expect(first?.querySelector(':scope > a')?.getAttribute('href')).toBe('/docs/components/');
    expect(second?.querySelector(':scope > .group-label')?.firstChild?.textContent).toBe('Guides');
    expect(second?.querySelector(':scope > [data-zag-root], :scope > button')).toBeNull();
  });

  it('aria-current="page" marks the current link only; link badges render', async () => {
    const d = doc(await html('Sidebar'));
    expect(
      [...d.querySelectorAll('sl-sidebar-state-persist [aria-current="page"]')].map((a) => a.getAttribute('href')),
    ).toEqual(['/docs/b/']);
    expect(d.querySelector('a[href="/docs/a/"]')?.textContent).toContain('new');
  });

  it('a link label is bare text, no wrapper element (DOM budget); a badge is its only child', async () => {
    const d = doc(await html('Sidebar'));
    expect(d.querySelector('a[href="/docs/b/"]')?.children).toHaveLength(0);
    const a = d.querySelector('a[href="/docs/a/"]')!;
    expect([...a.children].map((c) => c.className)).toEqual(['sl-badge tip']);
    expect(a.firstChild?.textContent).toBe('A');
  });

  it('C-130b: every nested group is an idle collapsible root, open when it holds the current page or is not collapsed', async () => {
    const d = doc(await html('Sidebar'));
    const found = groups(d).map((g) => [label(g), g.dataset['zagState'], zagProps(g)]);
    expect(found).toEqual([
      ['Current', 'idle', { defaultOpen: true }],
      ['Closed', 'idle', { defaultOpen: false }],
      ['Deep', 'idle', { defaultOpen: false }],
      ['Open 🚀', 'idle', { defaultOpen: true }],
    ]);
    expect(groups(d).map((g) => g.dataset['zagId'])).toEqual(['sb-0', 'sb-1', 'sb-2', 'sb-3']);
  });

  it('DOM budget: a group label is bare text; a nested group is li root, button trigger, ul content', async () => {
    const d = doc(await html('Sidebar'));
    expect(d.querySelector('sl-sidebar-state-persist .large:not(a)')).toBeNull();
    for (const g of groups(d)) {
      expect(g.tagName).toBe('LI');
      expect([...g.children].map((c) => c.tagName)).toEqual(['BUTTON', 'UL']);
      expect(g.querySelector(':scope > [data-part="trigger"]')?.children).toHaveLength(0);
    }
  });

  it('C-130a: root, trigger and content of each group equal connect() for its id and open state', async () => {
    const d = doc(await html('Sidebar'));
    for (const g of groups(d)) {
      const open = (zagProps(g) as { defaultOpen: boolean }).defaultOpen;
      expect(partAttrs(g), label(g) ?? '').toEqual(apiAttrs(g.dataset['zagId']!, open));
    }
    expect(d.body.innerHTML).not.toMatch(/data-focus/);
  });

  it("keeps Starlight's persistence hook: sl-sidebar-state-persist with Starlight's sidebar hash", async () => {
    const d = doc(await html('Sidebar'));
    expect(d.querySelector('sl-sidebar-state-persist')?.getAttribute('data-hash')).toBe(starlightHash(sidebar()));
    // The hash names the sidebar, not the page: another current page shares it (restore across navigation).
    const other = doc(await html('Sidebar', sidebar('/docs/e/'), '/docs/e/'));
    expect(other.querySelector('sl-sidebar-state-persist')?.getAttribute('data-hash')).toBe(starlightHash(sidebar()));
  });

  it('JS off: a noscript rule in @layer ocx shows every nested group; no rule without groups', async () => {
    const markup = await html('Sidebar');
    expect(markup).toMatch(
      /<noscript><style>@layer ocx\{[^<]*\[hidden\][^<]*display:block[^<]*\}<\/style><\/noscript>/,
    );
    expect(await html('Sidebar', [link('Components', '/docs/components/', true)])).not.toContain('<noscript>');
  });

  it("renders the mobile menu footer (MobileMenuFooter) below the list, hidden at ≥ 50rem as Starlight's", async () => {
    const d = doc(await html('Sidebar'));
    expect(d.querySelector('.md\\:sl-hidden .ocx-mobile-sections')).not.toBeNull();
  });
});

describe('C-230 S-109 pre-paint restore (inline script)', () => {
  /** The sidebar parsed inside a pane, running its inline scripts, with a stored state and a viewport. */
  function page(markup: string, { stored, wide = true }: { stored?: unknown; wide?: boolean }) {
    return new JSDOM(`<div id="starlight__sidebar">${markup}</div>`, {
      runScripts: 'dangerously',
      url: 'https://ocx.sh/docs/b/',
      beforeParse(w) {
        w.matchMedia = ((q: string) => ({
          matches: wide && q.includes('min-width: 50em'),
        })) as unknown as Win['matchMedia'];
        if (stored !== undefined) w.sessionStorage.setItem('sl-sidebar-state', JSON.stringify(stored));
      },
    }).window;
  }
  const hash = starlightHash(sidebar());

  it('restores each stored open state before the machine starts: parts equal connect() for the new state', async () => {
    const w = page(await html('Sidebar'), { stored: { hash, open: [false, true, true, false], scroll: 0 } });
    const found = groups(w.document);
    expect(found.map((g) => zagProps(g))).toEqual([
      { defaultOpen: false },
      { defaultOpen: true },
      { defaultOpen: true },
      { defaultOpen: false },
    ]);
    for (const [i, g] of found.entries()) {
      expect(partAttrs(g), label(g) ?? '').toEqual(apiAttrs(`sb-${i}`, [false, true, true, false][i]!));
      expect(g.dataset['zagState']).toBe('idle');
    }
  });

  it.each([
    ['another sidebar (hash mismatch)', { stored: { hash: 'other', open: [false, true, true, false] } }],
    [
      'a narrow viewport (the pane is the mobile menu, as Starlight)',
      { stored: { hash, open: [false, true, true, false] }, wide: false },
    ],
    ['nothing stored', {}],
    ['a corrupt entry', { stored: 'not json {' }],
  ])('leaves the SSR state for %s', async (_, options) => {
    const markup = await html('Sidebar');
    const w = page(markup, options);
    expect(groups(w.document).map((g) => zagProps(g))).toEqual(groups(doc(markup)).map((g) => zagProps(g)));
  });

  it('saves a group change under the sidebar hash (Starlight key, open[] by group index), keeping the rest', async () => {
    const w = page(await html('Sidebar'), { stored: { hash, open: [true], scroll: 12 } });
    const target = groups(w.document)[2]!;
    target.dispatchEvent(new w.CustomEvent('ocx:collapsible:change', { detail: { open: true }, bubbles: true }));
    expect(JSON.parse(w.sessionStorage.getItem('sl-sidebar-state')!)).toEqual({
      hash,
      open: [true, null, true],
      scroll: 12,
    });
  });

  it('a change on another sidebar starts a fresh entry for this one', async () => {
    const w = page(await html('Sidebar'), { stored: { hash: 'other', open: [true, true], scroll: 99 } });
    groups(w.document)[1]!.dispatchEvent(
      new w.CustomEvent('ocx:collapsible:change', { detail: { open: true }, bubbles: true }),
    );
    expect(JSON.parse(w.sessionStorage.getItem('sl-sidebar-state')!)).toMatchObject({ hash, open: [null, true] });
  });

  it('no mount by DOMContentLoaded (Search overridden): every group takes the error state, whose rule shows it', async () => {
    const markup = await html('Sidebar');
    const bare = page(markup, {});
    await new Promise((r) => bare.addEventListener('load', r));
    expect(groups(bare.document).map((g) => g.dataset['zagState'])).toEqual(Array(4).fill('error'));
    const mark = `<script>document.querySelector('sl-sidebar-state-persist').dataset.mounted=''</script>`;
    const mounted = page(markup + mark, {});
    await new Promise((r) => mounted.addEventListener('load', r));
    expect(groups(mounted.document).map((g) => g.dataset['zagState'])).toEqual(Array(4).fill('idle'));
  });

  it('without nested groups the script restores scroll only (no group code shipped)', async () => {
    const markup = await html('Sidebar', [link('Components', '/docs/components/', true)]);
    const script = doc(markup).querySelector('sl-sidebar-state-persist script')?.textContent ?? '';
    expect(script).toContain('scrollTop');
    expect(script).not.toContain('collapsible');
    expect(script.length).toBeLessThan(260);
  });
});

describe('C-231 MobileMenuToggle markup', () => {
  const api = () =>
    ssrApi(menu.machine, menu.connect, {
      modal: false,
      swipeDirection: 'start',
      id: 'mobile-menu',
      ids: { content: menu.PANE },
    });

  it('C-130b: the toggle sits in a manual Zag drawer root, idle, with its props', async () => {
    const root = doc(await html('MobileMenuToggle')).querySelector<HTMLElement>('[data-zag-root]');
    expect(root?.dataset).toMatchObject({
      zagRoot: 'drawer',
      zagState: 'idle',
      zagTrigger: 'manual',
      zagId: 'mobile-menu',
      zagProps: JSON.stringify({ modal: false, swipeDirection: 'start' }),
    });
  });

  it("D-Z4 C-231: the button keeps Starlight's hooks and its JS-off popover fallback, named by its label", async () => {
    const button = doc(await html('MobileMenuToggle')).querySelector('[data-zag-root] > button');
    expect(button?.classList.contains('sl-menu-button')).toBe(true);
    expect(button?.getAttribute('popovertarget')).toBe('starlight__sidebar');
    expect(button?.textContent?.trim()).toBe('Menu');
    expect(button?.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(2);
  });

  it.each([
    ['trigger', () => api().getTriggerProps(), '[data-zag-root] > button'],
    ['backdrop', () => api().getBackdropProps(), '[data-zag-root] > div'],
  ] as const)('C-130a: the %s carries connect() minus lean()', async (part, props, selector) => {
    const el = doc(await html('MobileMenuToggle')).querySelector(selector);
    const own = /^(class|popovertarget)$/;
    const actual = Object.fromEntries(
      [...(el?.attributes ?? [])].filter((a) => !own.test(a.name)).map((a) => [a.name, a.value]),
    );
    expect(actual).toEqual(domAttrs(menu.lean(part, props())));
  });

  it('lean(): SSR keeps what JS-off and first paint read (no expanded state: the popover invoker reports it)', () => {
    expect(Object.keys(menu.lean('trigger', api().getTriggerProps())).sort()).toEqual(['aria-controls', 'type']);
    expect(menu.lean('trigger', api().getTriggerProps())['aria-controls']).toBe(menu.PANE);
    expect(Object.keys(menu.lean('backdrop', api().getBackdropProps())).sort()).toEqual(['hidden', 'id']);
  });

  it('parts(): the pane is never `hidden` (the popover shows it) and is a named dialog only while open', () => {
    const closed = menu.parts(api()).content;
    expect(closed).not.toHaveProperty('hidden');
    expect(closed).not.toHaveProperty('role');
    expect(closed).not.toHaveProperty('aria-modal');
    expect(closed['id']).toBe(menu.PANE);
    const open = menu.parts(
      ssrApi(menu.machine, menu.connect, {
        modal: false,
        defaultOpen: true,
        id: 'mobile-menu',
        ids: { content: menu.PANE },
      }),
    );
    expect(open.content).toMatchObject({ role: 'dialog', 'aria-labelledby': open.trigger['id'] });
    expect(open.content).not.toHaveProperty('hidden');
  });

  describe('readDom()', () => {
    type Handlers = {
      ids: unknown;
      onEscapeKeyDown: (e: Event) => void;
      onInteractOutside: (e: Event) => void;
      onOpenChange: (d: { open: boolean }) => void;
    };
    /** jsdom has no popover API: `menu` stands in for an auto popover open over the pane. */
    function setup() {
      const w = new JSDOM(
        '<span><button>t</button></span><div id="starlight__sidebar"><a href="#">x</a></div><div id="m"><a href="#">in</a></div>',
      ).window;
      const d = w.document;
      const root = d.querySelector('span')!;
      const hide = vi.fn();
      const menuEl = Object.assign(d.getElementById('m')!, { popover: 'auto', hidePopover: hide });
      const all = d.querySelectorAll.bind(d);
      vi.spyOn(d, 'querySelectorAll').mockImplementation(((sel: string) =>
        sel === '[popover]:popover-open' ? [menuEl] : all(sel)) as typeof d.querySelectorAll);
      const events: unknown[] = [];
      root.addEventListener('ocx:mobile-menu:change', (e) => events.push((e as CustomEvent).detail));
      vi.stubGlobal('CustomEvent', w.CustomEvent); // emit() builds events from the global
      vi.stubGlobal('HTMLElement', w.HTMLElement);
      vi.stubGlobal('Element', w.Element);
      return { w, d, root, menuEl, hide, events, h: menu.readDom(root) as unknown as Handlers };
    }
    afterEach(() => vi.unstubAllGlobals());

    it('keeps the pane id', () => {
      expect(setup().h.ids).toEqual({ content: menu.PANE });
    });

    it('Esc hides a native popover open over the pane and keeps the drawer open (preventDefault)', () => {
      const { w, hide, h } = setup();
      const esc = new w.KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
      h.onEscapeKeyDown(esc);
      expect(hide).toHaveBeenCalledOnce();
      expect(esc.defaultPrevented).toBe(true);
    });

    it('Esc with nothing over the pane is left to the drawer', () => {
      const { w, d, h } = setup();
      vi.spyOn(d, 'querySelectorAll').mockReturnValue([] as unknown as NodeListOf<Element>);
      const esc = new w.KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
      h.onEscapeKeyDown(esc);
      expect(esc.defaultPrevented).toBe(false);
    });

    it('interaction inside an open popover is not outside; elsewhere it is', () => {
      const { w, d, menuEl, h } = setup();
      const at = (target: Element, open: boolean) => {
        vi.spyOn(target, 'closest').mockReturnValue(open ? menuEl : null);
        const e = new w.CustomEvent('pointerdown.outside', { cancelable: true, detail: { target } });
        h.onInteractOutside(e);
        return e.defaultPrevented;
      };
      expect(at(menuEl.querySelector('a')!, true)).toBe(true);
      expect(at(d.body, false)).toBe(false);
    });

    it('emits ocx:mobile-menu:change once per change; a close returns focus to the toggle', async () => {
      const { d, root, events, h } = setup();
      h.onOpenChange({ open: true });
      d.querySelector<HTMLElement>('#starlight__sidebar a')!.focus();
      h.onOpenChange({ open: false });
      h.onOpenChange({ open: false }); // Zag reports Escape's close twice
      await new Promise((r) => setTimeout(r, 0));
      expect(events).toEqual([{ open: true }, { open: false }]);
      expect(d.activeElement).toBe(root.querySelector('button'));
    });

    it('a close leaves focus the reader moved outside the pane', async () => {
      const { d, h } = setup();
      h.onOpenChange({ open: true });
      d.querySelector<HTMLElement>('#m a')!.focus();
      h.onOpenChange({ open: false });
      await new Promise((r) => setTimeout(r, 0));
      expect(d.activeElement).toBe(d.querySelector('#m a'));
    });
  });
});
