// Z8 collections: C-200 TreeView, C-201 Toc, C-202 Pagination, and the parts of C-130 a unit test
// can hold: (a) SSR equals ssrApi, (b) root attributes, (f) styles, (g) events through a live
// machine (mount under jsdom). Keyboard, axe, first paint and leaks are in zag-collections.spec.ts.
// Node environment (the Container API does not render under vitest's jsdom environment); the live
// tests get a jsdom window installed as globals after the container exists.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
// @ts-expect-error jsdom ships no types and @types/jsdom is not a dependency
import * as jsdom from 'jsdom';
import { beforeAll, describe, expect, it } from 'vitest';
import * as pagination from '../src/components/pagination.zag.mjs';
import * as toc from '../src/components/toc.zag.mjs';
import * as treeView from '../src/components/tree-view.zag.mjs';
import type { TreeViewItem } from '../src/components/tree-view.zag.mjs';
import { ssrApi } from '../src/components/ui/zag-runtime.mjs';
import { mount } from '../src/components/ui/zag.mjs';
import type { ZagModule } from '../src/components/ui/zag.mjs';
import { domAttrs, expectSsrMatchesConnect } from './zag-helpers.ts';

type Component = Parameters<AstroContainer['renderToString']>[0];
// Template import: tsc has no .astro module types (as in chrome.test.ts).
const load = async (name: string) =>
  ((await import(`../src/components/${name}.astro`)) as { default: Component }).default;
const TreeView = await load('TreeView');
const Toc = await load('Toc');
const Pagination = await load('Pagination');

const { JSDOM } = jsdom as { JSDOM: new (html: string, o: object) => { window: Record<string, unknown> } };
let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
  const { window } = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/' });
  const g = globalThis as Record<string, unknown>;
  // Node's own Event/CustomEvent cannot be dispatched on jsdom nodes, so jsdom's win.
  const own = new Set(['Event', 'CustomEvent', 'EventTarget']);
  for (const key of Object.getOwnPropertyNames(window)) if (!(key in g) || own.has(key)) g[key] = window[key];
  // jsdom has no IntersectionObserver; the Toc machine's observer is not what these tests cover.
  window['IntersectionObserver'] = g['IntersectionObserver'] ??= class {
    observe() {}
    disconnect() {}
  };
});

const html = (c: Component, props: Record<string, unknown>) => container.renderToString(c, { props });
/** Renders into a fresh body of this (jsdom) document; returns the Zag root. */
async function place(c: Component, props: Record<string, unknown>): Promise<HTMLElement> {
  document.body.innerHTML = await html(c, props);
  const root = document.querySelector<HTMLElement>('[data-zag-root]');
  if (!root) throw new Error('no [data-zag-root] rendered');
  return root;
}
const attrsOf = (el: Element | null) =>
  Object.fromEntries(
    [...(el?.attributes ?? [])]
      .filter((a) => a.name !== 'class' && !a.name.startsWith('data-astro-'))
      .map((a) => [a.name, a.value]),
  );
const style = (name: string) =>
  /<style[^>]*>([\s\S]*)<\/style>/.exec(
    readFileSync(join(import.meta.dirname, `../src/components/${name}.astro`), 'utf8'),
  )?.[1] ?? '';
/** Live machine on `root` under jsdom (manual start: jsdom has no pointer or IntersectionObserver). */
async function live(root: HTMLElement, mod: object) {
  const handle = mount(root, { load: () => Promise.resolve(mod as ZagModule), trigger: 'manual' });
  await handle.start();
  expect(root.dataset['zagState']).toBe('live');
  return handle;
}
/** Zag applies a transition after the current task. */
const tick = () => new Promise((r) => setTimeout(r, 0));
function events(root: Element, type: string): unknown[] {
  const seen: unknown[] = [];
  // Round-tripped: jsdom hands the detail over from its own realm; the contract is JSON anyway.
  root.addEventListener(type, (e) => seen.push(JSON.parse(JSON.stringify((e as CustomEvent).detail))));
  return seen;
}

const store: TreeViewItem[] = [
  {
    value: 'packages',
    label: 'packages/',
    children: [
      { value: 'cmake', label: 'cmake/', children: [{ value: 'cmake-3.31', label: '3.31.6' }] },
      { value: 'ninja', label: 'ninja/', children: [{ value: 'ninja-1.12', label: '1.12.1' }] },
    ],
  },
  { value: 'locks', label: 'locks/ <&>', disabled: true, children: [{ value: 'lock', label: 'lock' }] },
  { value: 'config', label: 'config.toml' },
];

describe('C-130 (b, f) every collection wrapper', () => {
  it.each([
    ['TreeView', TreeView, { label: 'store', items: store }, 'tree-view', null],
    ['Toc', Toc, { items: [{ id: 'a', label: 'A', depth: 2 }] }, 'toc', 'visible'],
    ['Pagination', Pagination, { count: 50, pageSize: 10 }, 'pagination', null],
  ] as const)('C-130b %s root: data-zag-root, idle, data-zag-props, trigger', async (_, c, props, machine, trigger) => {
    const root = await place(c, props);
    expect(root.dataset['zagRoot']).toBe(machine);
    expect(root.dataset['zagState']).toBe('idle');
    expect(root.dataset['zagId']).toMatch(/^ocx-ui-/);
    expect(JSON.parse(root.dataset['zagProps'] ?? 'null')).toBeTypeOf('object');
    expect(root.getAttribute('data-zag-trigger')).toBe(trigger);
    expect(document.body.innerHTML).not.toMatch(/data-focus/);
  });

  it.each(['TreeView', 'Toc', 'Pagination'])('C-130f %s: @layer ocx, tokens only, keyed on data-part', (name) => {
    const s = style(name);
    expect(s).toMatch(/@layer ocx\s*\{/);
    expect(s).toMatch(/var\(--ocx-/);
    expect(s).toMatch(/\[data-part=/);
    expect(s).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(/i);
  });
});

describe('C-200 TreeView', () => {
  const api = (id: string, props: Record<string, unknown>) =>
    ssrApi(treeView.machine, treeView.connect, { id, collection: treeView.toCollection(store), ...props });

  it.each([
    ['collapsed', {}, {}],
    [
      'expanded + selected',
      { expanded: ['packages', 'cmake'], value: 'cmake-3.31' },
      { defaultExpandedValue: ['packages', 'cmake'], defaultSelectedValue: ['cmake-3.31'] },
    ],
  ])('C-130a %s: every part equals ssrApi for the same props', async (_, props, machineProps) => {
    const root = await place(TreeView, { label: 'store', items: store, ...props });
    const out = document.body.innerHTML;
    const a = api(root.dataset['zagId'] ?? '', machineProps);
    expectSsrMatchesConnect(out, 'label', a.getLabelProps());
    expectSsrMatchesConnect(out, 'tree', a.getTreeProps());
    const nodes = [...root.querySelectorAll('[data-part="branch"], [data-part="item"]')];
    expect(nodes.map((n) => n.getAttribute('data-value'))).toEqual([
      'packages',
      'cmake',
      'cmake-3.31',
      'ninja',
      'ninja-1.12',
      'locks',
      'lock',
      'config',
    ]);
    for (const el of nodes) {
      const indexPath = (el.getAttribute('data-path') ?? '').split('/').map(Number);
      const p = { node: a.collection.at(indexPath) as TreeViewItem, indexPath };
      if (el.getAttribute('data-part') === 'item') {
        expect(attrsOf(el)).toEqual(domAttrs(a.getItemProps(p)));
        expect(attrsOf(el.firstElementChild)).toEqual(domAttrs(a.getItemTextProps(p)));
        continue;
      }
      const [control, content] = el.children;
      expect(attrsOf(el)).toEqual(domAttrs(a.getBranchProps(p)));
      expect(attrsOf(control ?? null)).toEqual(domAttrs(a.getBranchControlProps(p)));
      expect(attrsOf(control?.children[0] ?? null)).toEqual(domAttrs(a.getBranchIndicatorProps(p)));
      expect(attrsOf(control?.children[1] ?? null)).toEqual(domAttrs(a.getBranchTextProps(p)));
      expect(attrsOf(content ?? null)).toEqual(domAttrs(a.getBranchContentProps(p)));
    }
  });

  it('C-200 APG tree: role=tree named by the label; closed branches hidden; one tab stop; labels escaped', async () => {
    const root = await place(TreeView, { label: 'store', items: store, expanded: ['packages'] });
    const tree = root.querySelector('[role="tree"]');
    expect(document.getElementById(tree?.getAttribute('aria-labelledby') ?? '')?.textContent).toBe('store');
    expect(root.querySelector('[data-value="packages"] > [role="group"]')?.hasAttribute('hidden')).toBe(false);
    expect(root.querySelector('[data-value="cmake"] > [role="group"]')?.hasAttribute('hidden')).toBe(true);
    expect([...root.querySelectorAll('[tabindex="0"]')].map((e) => e.getAttribute('data-value'))).toEqual(['packages']);
    expect(root.querySelector('[data-value="locks"]')?.getAttribute('aria-disabled')).toBe('true');
    expect(root.textContent).toContain('locks/ <&>');
  });

  it('C-200 readDom rebuilds the items from the SSR tree (no JSON copy in the page)', async () => {
    const root = await place(TreeView, { label: 'store', items: store });
    expect(root.dataset['zagProps']).not.toMatch(/cmake/);
    const rootNode: unknown = treeView.readDom(root, () => {}).collection?.rootNode;
    expect(rootNode).toEqual({ value: '', label: '', children: store });
  });

  it('C-200 value and expanded seed the live machine too (via data-zag-props)', async () => {
    const root = await place(TreeView, {
      label: 'store',
      items: store,
      expanded: ['packages', 'cmake'],
      value: 'cmake-3.31',
    });
    const handle = await live(root, treeView);
    await tick();
    for (const v of ['packages', 'cmake'])
      expect(root.querySelector(`[role="treeitem"][data-value="${v}"]`)?.getAttribute('aria-expanded')).toBe('true');
    expect(root.querySelector('[data-value="cmake-3.31"]')?.getAttribute('aria-selected')).toBe('true');
    handle.destroy();
  });

  it('C-200 ocx:tree-view:select and :expand fire from a live tree', async () => {
    const root = await place(TreeView, { label: 'store', items: store, selectable: true });
    const selected = events(root, 'ocx:tree-view:select');
    const expanded = events(root, 'ocx:tree-view:expand');
    const handle = await live(root, treeView);
    const control = root.querySelector<HTMLElement>('[data-value="packages"] > [data-part="branch-control"]');
    control?.click();
    await tick();
    expect(selected).toEqual([{ value: ['packages'] }]);
    expect(expanded).toEqual([{ value: ['packages'] }]);
    expect(root.querySelector('[data-value="packages"]')?.getAttribute('aria-expanded')).toBe('true');
    expect(root.querySelector('[data-value="packages"] > [role="group"]')?.hasAttribute('hidden')).toBe(false);
    root.querySelector<HTMLElement>('[data-value="config"]')?.click();
    await tick();
    expect(selected.at(-1)).toEqual({ value: ['config'] });
    expect(root.querySelector('[data-value="config"]')?.getAttribute('aria-selected')).toBe('true');
    handle.destroy();
  });

  it('C-200 selectable is opt-in: a default tree expands on click but selects nothing', async () => {
    const root = await place(TreeView, { label: 'store', items: store });
    const selected = events(root, 'ocx:tree-view:select');
    const handle = await live(root, treeView);
    root.querySelector<HTMLElement>('[data-value="packages"] > [data-part="branch-control"]')?.click();
    root.querySelector<HTMLElement>('[data-value="config"]')?.click();
    await tick();
    expect(selected).toEqual([]);
    expect(root.querySelector('[data-value="packages"]')?.getAttribute('aria-expanded')).toBe('true');
    expect(root.querySelector('[aria-selected="true"]')).toBeNull();
    handle.destroy();
  });

  it("C-200 an item's selectable wins; a non-selectable click keeps the selection; Escape clears it", async () => {
    const items: TreeViewItem[] = [
      { value: 'dir', label: 'dir/', selectable: false, children: [{ value: 'a', label: 'a' }] },
      { value: 'b', label: 'b' },
    ];
    const root = await place(TreeView, { label: 'sel', items, selectable: true, expanded: ['dir'] });
    const selected = events(root, 'ocx:tree-view:select');
    const handle = await live(root, treeView);
    root.querySelector<HTMLElement>('[data-value="b"]')?.click();
    await tick();
    root.querySelector<HTMLElement>('[data-value="dir"] > [data-part="branch-control"]')?.click();
    await tick();
    expect(selected).toEqual([{ value: ['b'] }]);
    expect(root.querySelector('[data-value="b"]')?.getAttribute('aria-selected')).toBe('true');
    root
      .querySelector<HTMLElement>('[data-part="tree"]')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await tick();
    expect(selected.at(-1)).toEqual({ value: [] });
    expect(root.querySelector('[aria-selected="true"]')).toBeNull();
    handle.destroy();
  });

  it('C-200 icons, open icons and descriptions match Tree (tree.mjs iconsFor), outside the label', async () => {
    const items: TreeViewItem[] = [
      {
        value: 'home',
        label: '~/.ocx/',
        icon: '🏠',
        description: 'the root',
        children: [{ value: 'm', label: 'metadata.json' }],
      },
      { value: 'src', label: 'src/', children: [{ value: 'r', label: 'README.md' }] },
    ];
    const root = await place(TreeView, { label: 'icons', items });
    const icon = (v: string) => root.querySelector(`[data-value="${v}"] .ocx-tree-view__icon`)?.textContent;
    expect([icon('home'), icon('m'), icon('src'), icon('r')]).toEqual(['🏠', '📋', '📁📂', '📄']);
    expect(root.querySelector('[data-value="home"] .ocx-tree-view__desc')?.textContent).toBe('the root');
    expect(root.querySelector('[data-value="home"] .ocx-tree-view__icon')?.getAttribute('aria-hidden')).toBe('true');
    expect(root.querySelectorAll('[data-part="branch-indicator"] svg').length).toBe(2);
    // The machine's data stays value/label only: typeahead matches the label, not the icon.
    const rootNode: unknown = treeView.readDom(root, () => {}).collection?.rootNode;
    expect(rootNode).toEqual({
      value: '',
      label: '',
      children: [
        { value: 'home', label: '~/.ocx/', children: [{ value: 'm', label: 'metadata.json' }] },
        { value: 'src', label: 'src/', children: [{ value: 'r', label: 'README.md' }] },
      ],
    });
  });
});

describe('C-201 Toc', () => {
  const items = [
    { id: 'install', label: 'Install', depth: 2 },
    { id: 'pin', label: 'Pin <it>', depth: 3 },
  ];

  it('C-130a every part equals ssrApi; links are plain anchors to the headings', async () => {
    const root = await place(Toc, { items });
    const out = document.body.innerHTML;
    const zagItems = items.map((i) => ({ value: i.id, depth: i.depth }));
    const a = ssrApi(toc.machine, toc.connect, { id: root.dataset['zagId'], autoScroll: false, items: zagItems });
    expectSsrMatchesConnect(out, 'root', {
      ...a.getRootProps(),
      'data-zag-root': 'toc',
      'data-zag-id': root.dataset['zagId'],
      'data-zag-trigger': 'visible',
      'data-zag-state': 'idle',
      'data-zag-props': root.dataset['zagProps'],
    });
    expectSsrMatchesConnect(out, 'title', a.getTitleProps());
    expectSsrMatchesConnect(out, 'list', a.getListProps());
    const lis = root.querySelectorAll('[data-part="item"]');
    zagItems.forEach((item, i) => {
      expect(attrsOf(lis[i] ?? null)).toEqual(domAttrs(a.getItemProps({ item })));
      const link = lis[i]?.querySelector('a');
      expect(attrsOf(link ?? null)).toEqual({ ...domAttrs(a.getLinkProps({ item })), href: `#${item.value}` });
    });
    expect(root.querySelector('[data-value="pin"] a')?.textContent?.trim()).toBe('Pin <it>');
  });

  it('C-201 labelled nav; label defaults to "On this page"; autoScroll off unless the zag prop turns it on', async () => {
    let root = await place(Toc, { items });
    expect(root.tagName).toBe('NAV');
    expect(document.getElementById(root.getAttribute('aria-labelledby') ?? '')?.textContent).toBe('On this page');
    expect(JSON.parse(root.dataset['zagProps'] ?? '{}')).toEqual({ autoScroll: false });
    root = await place(Toc, { items, label: 'Sections', zag: { autoScroll: true, rootMargin: '0px' } });
    expect(document.getElementById(root.getAttribute('aria-labelledby') ?? '')?.textContent).toBe('Sections');
    expect(JSON.parse(root.dataset['zagProps'] ?? '{}')).toEqual({ autoScroll: true, rootMargin: '0px' });
  });

  it('C-201 readDom reads the items back from the list', async () => {
    const root = await place(Toc, { items });
    expect(toc.readDom(root)['items']).toEqual([
      { value: 'install', depth: 2 },
      { value: 'pin', depth: 3 },
    ]);
  });

  it("C-201 a live Toc lights the probe's heading (toc-probe.mjs) and fires ocx:toc:change once per change", async () => {
    const root = await place(Toc, { items });
    // jsdom lays nothing out: 'install' sits below the probe (viewport bottom), 'pin' above it.
    const top = { install: 5000, pin: 0 };
    for (const [id, y] of Object.entries(top)) {
      const h = document.body.appendChild(document.createElement('h2'));
      h.id = id;
      h.getBoundingClientRect = () => ({ top: y }) as DOMRect;
    }
    const seen = events(root, 'ocx:toc:change');
    const handle = await live(root, toc);
    await tick();
    expect(seen).toEqual([{ value: ['pin'] }]);
    const link = root.querySelector('[data-value="pin"] a');
    expect(link?.hasAttribute('data-active')).toBe(true);
    expect(link?.getAttribute('aria-current')).toBe('location');
    // The probe is authoritative: a state change that disagrees (an IO callback) is corrected, and
    // listeners never see the transient value nor a repeat of the unchanged pick.
    (handle.api as { setActiveIds(v: string[]): void }).setActiveIds(['install']);
    await tick();
    expect(link?.hasAttribute('data-active')).toBe(true);
    expect(seen).toEqual([{ value: ['pin'] }]);
    handle.destroy();
  });

  it('C-201 the hash target wins while the view sits where the jump left it', async () => {
    const root = await place(Toc, { items });
    // A page 2000px taller than the viewport at scroll 0: 'install' at the jump line (no
    // scroll-padding in jsdom: 0), 'pin' 4px lower, still above the band top, so the probe alone picks 'pin'.
    const top = { install: 0, pin: 4 };
    for (const [id, y] of Object.entries(top)) {
      const h = document.body.appendChild(document.createElement('h2'));
      h.id = id;
      h.getBoundingClientRect = () => ({ top: y }) as DOMRect;
    }
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: innerHeight + 2000 });
    const seen = events(root, 'ocx:toc:change');
    try {
      location.hash = '#install';
      const handle = await live(root, toc);
      await tick();
      expect(seen).toEqual([{ value: ['install'] }]);
      // The view moved off the jump (here: the hash cleared); the next check hands back to the probe.
      location.hash = '';
      (handle.api as { setActiveIds(v: string[]): void }).setActiveIds([]);
      await tick();
      expect(seen).toEqual([{ value: ['install'] }, { value: ['pin'] }]);
      handle.destroy();
    } finally {
      location.hash = '';
      delete (document.documentElement as { scrollHeight?: number }).scrollHeight;
    }
  });
});

describe('C-202 Pagination', () => {
  const api = (id: string, props: Record<string, unknown>) =>
    ssrApi(pagination.machine, pagination.connect, { id, ...props });

  it.each([
    ['buttons, first page', { count: 200, pageSize: 10 }],
    ['buttons, middle', { count: 200, pageSize: 10, page: 10 }],
    ['links, middle', { count: 200, pageSize: 10, page: 3, href: '#p-{page}' }],
    ['links, first page', { count: 200, pageSize: 10, href: '/r/?page={page}' }],
  ])('C-130a %s: every part equals ssrApi for the same props', async (_, props) => {
    const root = await place(Pagination, props);
    const { page = 1, href, ...rest } = props as { page?: number; href?: string; count: number; pageSize: number };
    const a = api(root.dataset['zagId'] ?? '', {
      ...rest,
      defaultPage: page,
      type: href ? 'link' : 'button',
      ...(href && { getPageUrl: pagination.pageUrl(href) }),
    });
    expect(attrsOf(root.querySelector('[data-part="prev-trigger"]'))).toEqual(
      domAttrs(pagination.trigger(a.getPrevTriggerProps())),
    );
    expect(attrsOf(root.querySelector('[data-part="next-trigger"]'))).toEqual(
      domAttrs(pagination.trigger(a.getNextTriggerProps())),
    );
    const slots = [...root.querySelectorAll('[data-ocx-slot]')];
    expect(slots).toHaveLength(a.pages.length);
    a.pages.forEach((entry, index) => {
      const el = slots[index]?.firstElementChild ?? null;
      if (entry.type === 'page') {
        expect(attrsOf(el)).toEqual(domAttrs(a.getItemProps(entry)));
        expect(el?.textContent).toBe(String(entry.value));
      } else expect(attrsOf(el)).toEqual(domAttrs(a.getEllipsisProps({ index })));
    });
  });

  it('C-202 buttons mode: type=button, prev disabled on page 1, current page aria-current', async () => {
    const root = await place(Pagination, { count: 200, pageSize: 10 });
    expect(root.tagName).toBe('NAV');
    expect(root.getAttribute('aria-label')).toBe('pagination');
    const prev = root.querySelector('[data-part="prev-trigger"]');
    expect(prev?.tagName).toBe('BUTTON');
    expect(prev?.hasAttribute('disabled')).toBe(true);
    expect(root.querySelector('[aria-current="page"]')?.textContent).toBe('1');
    expect(root.querySelectorAll('[data-part="item"][type="button"]')).toHaveLength(6);
  });

  it('C-202 links mode: href from the template; a disabled end is a disabled link', async () => {
    const root = await place(Pagination, { count: 200, pageSize: 10, href: '/r/?page={page}' });
    expect(root.dataset['ocxHref']).toBe('/r/?page={page}');
    expect(root.querySelector('[data-index="2"]')?.getAttribute('href')).toBe('/r/?page=2');
    expect(root.querySelector('[data-part="next-trigger"]')?.getAttribute('href')).toBe('/r/?page=2');
    const prev = root.querySelector('[data-part="prev-trigger"]');
    expect(prev?.tagName).toBe('A');
    expect(prev?.hasAttribute('href')).toBe(false);
    expect(prev?.getAttribute('role')).toBe('link');
    expect(prev?.getAttribute('aria-disabled')).toBe('true');
    expect(pagination.pageUrl('/x/{page}/{page}')({ page: 7 })).toBe('/x/7/7');
    expect(pagination.trigger({ type: 'button', disabled: true })).toMatchObject({
      role: undefined,
      'aria-disabled': undefined,
    });
  });

  it('C-202 a live pagination moves its window, fires ocx:pagination:change and reuses its slot elements', async () => {
    const root = await place(Pagination, { count: 200, pageSize: 10 });
    const seen = events(root, 'ocx:pagination:change');
    const handle = await live(root, pagination);
    const next = root.querySelector<HTMLButtonElement>('[data-part="next-trigger"]');
    const pages = () =>
      [...root.querySelectorAll('[data-ocx-slot] > *')].map((e) =>
        e.getAttribute('data-part') === 'ellipsis' ? '…' : e.textContent,
      );
    expect(pages()).toEqual(['1', '2', '3', '4', '5', '…', '20']);
    for (let i = 0; i < 5; i++) {
      next?.click();
      await tick();
    }
    expect(seen).toEqual([2, 3, 4, 5, 6].map((page) => ({ page })));
    expect(pages()).toEqual(['1', '…', '5', '6', '7', '…', '20']);
    expect(root.querySelector('[aria-current="page"]')?.textContent).toBe('6');
    const kinds = new Set<Element>();
    for (let i = 0; i < 30; i++) {
      next?.click();
      await tick();
      root.querySelectorAll('[data-ocx-slot] > *').forEach((e) => kinds.add(e));
    }
    expect(pages()).toEqual(['1', '…', '16', '17', '18', '19', '20']);
    expect(next?.disabled).toBe(true);
    // Seven slots, each at most one page element and one ellipsis over the whole run.
    expect(kinds.size).toBeLessThanOrEqual(14);
    root.querySelector<HTMLButtonElement>('[data-index="1"]')?.click();
    await tick();
    expect(pages()).toEqual(['1', '2', '3', '4', '5', '…', '20']);
    handle.destroy();
  });

  it('C-202 readDom: the change callback, and getPageUrl only in links mode', async () => {
    let root = await place(Pagination, { count: 20, pageSize: 10 });
    expect(pagination.readDom(root)).not.toHaveProperty('getPageUrl');
    root = await place(Pagination, { count: 20, pageSize: 10, href: '#{page}' });
    const props = pagination.readDom(root) as { getPageUrl: (d: { page: number }) => string };
    expect(props.getPageUrl({ page: 2 })).toBe('#2');
  });
});
