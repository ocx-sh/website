// Z14 List: C-250 (listbox), C-251 (async data), and the parts of C-130 a unit test can hold:
// (a) SSR equals ssrApi, (b) root attributes, (f) styles, (g) events through a live machine (mount
// under jsdom). Keyboard, axe, first paint and leaks are in tests/e2e/zag-list.spec.ts.
// Node environment (the Container API does not render under vitest's jsdom environment); the live
// tests get a jsdom window installed as globals after the container exists.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
// @ts-expect-error jsdom ships no types and @types/jsdom is not a dependency
import * as jsdom from 'jsdom';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as asyncList from '../src/components/ui/async-list.zag.mjs';
import * as listbox from '../src/components/ui/listbox.zag.mjs';
import { ssrApi } from '../src/components/ui/zag-runtime.mjs';
import { mount } from '../src/components/ui/zag.mjs';
import type { ListFetchDetail, ListPage } from '../src/components/ui/async-list.zag.mjs';
import type { ZagModule } from '../src/components/ui/zag.mjs';
import { domAttrs } from './zag-helpers.ts';

type Component = Parameters<AstroContainer['renderToString']>[0];
// Template imports: tsc has no .astro module types (as in components-collections.test.ts).
const load = async (path: string) => ((await import(`${path}.astro`)) as { default: Component }).default;
const List = await load('../src/components/ui/List');
// A function slot needs an .astro caller (the Container API stringifies slot values).
const RichList = await load('./fixtures/RichList');

const { JSDOM } = jsdom as { JSDOM: new (html: string, o: object) => { window: Record<string, unknown> } };
let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
  const { window } = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/' });
  const g = globalThis as Record<string, unknown>;
  // Node's own Event/CustomEvent/AbortController cannot be used with jsdom nodes, so jsdom's win.
  const own = new Set(['Event', 'CustomEvent', 'EventTarget', 'KeyboardEvent', 'MouseEvent', 'FocusEvent']);
  for (const key of Object.getOwnPropertyNames(window)) if (!(key in g) || own.has(key)) g[key] = window[key];
  // jsdom without pretendToBeVisual has no frames; Zag schedules focus and scrolling on one.
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0));
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
});

interface Item {
  value: string;
  label: string;
  disabled?: boolean;
  group?: string;
  description?: string;
  meta?: string;
}
const tools: Item[] = [
  { value: 'cmake', label: 'cmake', description: 'Build system generator', meta: '3.31' },
  { value: 'ninja', label: 'ninja', meta: '1.12' },
  { value: 'meson', label: 'meson', disabled: true },
  { value: 'bazel', label: 'bazel <&>' },
];
const grouped: Item[] = [
  { value: 'gcc', label: 'gcc', group: 'Compilers' },
  { value: 'cmake', label: 'cmake', group: 'Build' },
  { value: 'clang', label: 'clang', group: 'Compilers' },
];

const html = (props: Record<string, unknown>, c: Component = List) => container.renderToString(c, { props });
/** Renders into a fresh body of this (jsdom) document; returns the Zag root. */
async function place(props: Record<string, unknown>): Promise<HTMLElement> {
  document.body.innerHTML = await html(props);
  const root = document.querySelector<HTMLElement>('[data-zag-root]');
  if (!root) throw new Error('no [data-zag-root] rendered');
  return root;
}
/** Zag's attributes of an element: wrapper-owned presentation and ours (data-label, data-ocx-*) dropped. */
const attrsOf = (el: Element | null) =>
  Object.fromEntries(
    [...(el?.attributes ?? [])]
      .filter((a) => !/^(?:class|data-astro-.*|data-label|data-ocx-.*|data-zag-.*)$/.test(a.name))
      .map((a) => [a.name, a.value]),
  );
const part = (root: Element, name: string) => root.querySelector(`[data-part="${name}"]`);
const style = () =>
  /<style[^>]*>([\s\S]*)<\/style>/.exec(
    readFileSync(join(import.meta.dirname, '../src/components/ui/List.astro'), 'utf8'),
  )?.[1] ?? '';
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
  root.addEventListener(type, (e) => seen.push(JSON.parse(JSON.stringify((e as CustomEvent).detail ?? null))));
  return seen;
}
const values = (root: Element) =>
  [...root.querySelectorAll('[data-part="item"]')].map((el) => el.getAttribute('data-value'));
const key = (el: Element, k: string) =>
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

describe('C-130 (b, f) List', () => {
  it('C-130b root: data-zag-root, idle, data-zag-props, interaction trigger, no data-focus', async () => {
    const root = await place({ label: 'Tools', items: tools });
    expect(root.dataset['zagRoot']).toBe('listbox');
    expect(root.dataset['zagState']).toBe('idle');
    expect(root.dataset['zagId']).toMatch(/^ocx-ui-/);
    expect(JSON.parse(root.dataset['zagProps'] ?? 'null')).toBeTypeOf('object');
    expect(root.hasAttribute('data-zag-trigger')).toBe(false);
    expect(document.body.innerHTML).not.toMatch(/data-focus/);
  });

  it('C-130f: @layer ocx, tokens only, keyed on data-part', () => {
    const s = style();
    expect(s).toMatch(/@layer ocx\s*\{/);
    expect(s).toMatch(/var\(--ocx-/);
    expect(s).toMatch(/\[data-part=/);
    expect(s).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(/i);
  });
});

describe('C-250 List', () => {
  const api = (id: string, items: Item[], props: Record<string, unknown> = {}, columns = 0) =>
    ssrApi(listbox.machine, listbox.connect, { id, collection: listbox.toCollection(items, columns), ...props });

  it.each([
    ['single', { items: tools }, {}, 0],
    ['single, value', { items: tools, value: 'ninja' }, { defaultValue: ['ninja'] }, 0],
    [
      'multiple, values',
      { items: tools, selectionMode: 'multiple', value: ['cmake', 'bazel'] },
      { selectionMode: 'multiple', defaultValue: ['cmake', 'bazel'] },
      0,
    ],
    ['horizontal', { items: tools, orientation: 'horizontal' }, { orientation: 'horizontal' }, 0],
    ['grid', { items: tools, columns: 2 }, {}, 2],
  ] as const)('C-130a %s: every part equals ssrApi for the same props', async (_, props, machineProps, columns) => {
    const root = await place({ label: 'Tools', ...props });
    const a = api(root.dataset['zagId'] ?? '', tools, machineProps, columns);
    expect(attrsOf(root)).toEqual(domAttrs(a.getRootProps()));
    expect(attrsOf(part(root, 'label'))).toEqual(domAttrs(a.getLabelProps()));
    expect(attrsOf(part(root, 'content'))).toEqual(domAttrs(a.getContentProps()));
    expect(values(root)).toEqual(tools.map((t) => t.value));
    for (const item of tools) {
      const el = root.querySelector(`[data-part="item"][data-value="${item.value}"]`);
      expect(attrsOf(el)).toEqual(domAttrs(a.getItemProps({ item })));
      expect(attrsOf(el?.querySelector('[data-part="item-text"]') ?? null)).toEqual(
        domAttrs(a.getItemTextProps({ item })),
      );
    }
  });

  it('C-250 groups: items of a group render together under a labelled role=group, in first-seen order', async () => {
    const root = await place({ label: 'Tools', items: grouped });
    expect(values(root)).toEqual(['gcc', 'clang', 'cmake']);
    const a = api(root.dataset['zagId'] ?? '', [grouped[0]!, grouped[2]!, grouped[1]!]);
    const groups = [...root.querySelectorAll('[data-part="item-group"]')];
    expect(groups.map((g) => g.querySelector('[data-part="item-group-label"]')?.textContent)).toEqual([
      'Compilers',
      'Build',
    ]);
    for (const [i, g] of groups.entries()) {
      expect(attrsOf(g)).toEqual(domAttrs(a.getItemGroupProps({ id: `g${i}` })));
      const lbl = g.querySelector('[data-part="item-group-label"]');
      expect(attrsOf(lbl)).toEqual(domAttrs(a.getItemGroupLabelProps({ htmlFor: `g${i}` })));
      expect(g.getAttribute('role')).toBe('group');
      expect(g.getAttribute('aria-labelledby')).toBe(lbl?.id);
    }
  });

  it('C-250 APG listbox: named by the label, one tab stop, multiselectable, disabled marked, text escaped', async () => {
    const root = await place({ label: 'Tools', items: tools, selectionMode: 'multiple' });
    const box = root.querySelector('[role="listbox"]');
    expect(document.getElementById(box?.getAttribute('aria-labelledby') ?? '')?.textContent).toBe('Tools');
    expect(box?.getAttribute('aria-multiselectable')).toBe('true');
    expect([...root.querySelectorAll('[tabindex="0"]')]).toEqual([box]);
    expect(root.querySelectorAll('[role="option"]')).toHaveLength(4);
    expect(root.querySelector('[data-value="meson"]')?.getAttribute('aria-disabled')).toBe('true');
    expect(root.textContent).toContain('bazel <&>');
  });

  it('C-250 card rows: description and meta render in the built-in row', async () => {
    const root = await place({ label: 'Tools', items: tools });
    const row = root.querySelector('[data-value="cmake"]');
    expect(row?.textContent).toContain('Build system generator');
    expect(row?.textContent).toContain('3.31');
  });

  it('C-250 rich rows: a function slot renders each row; the label stays the typeahead text', async () => {
    document.body.innerHTML = await html({ items: tools }, RichList);
    const root = document.querySelector<HTMLElement>('[data-zag-root]')!;
    expect(root.querySelectorAll('.card')).toHaveLength(4);
    expect(root.querySelector('[data-value="ninja"] .card')?.textContent).toBe('ninja!');
    expect(listbox.readDom(root, () => {}).collection).toMatchObject({
      items: tools.map(({ value, label, disabled }) => ({ value, label, ...(disabled && { disabled }) })),
    });
  });

  it('C-250 empty state: data-empty on the content and the empty text shown', async () => {
    const root = await place({ label: 'Tools', items: [], empty: 'No tools yet.' });
    expect(part(root, 'content')?.hasAttribute('data-empty')).toBe(true);
    expect(root.querySelector('.ocx-list__empty')?.textContent).toBe('No tools yet.');
  });

  it('C-250 readDom rebuilds the items from the SSR rows (no JSON copy in the page)', async () => {
    const root = await place({ label: 'Tools', items: tools, columns: 2 });
    expect(root.dataset['zagProps']).not.toMatch(/cmake/);
    const { collection } = listbox.readDom(root, () => {});
    expect(collection).toMatchObject({
      columnCount: 2,
      items: tools.map(({ value, label, disabled }) => ({ value, label, ...(disabled && { disabled }) })),
    });
  });

  it('C-250 ocx:list:change: a click selects, a disabled item does not, multiple toggles', async () => {
    const root = await place({ label: 'Tools', items: tools, selectionMode: 'multiple', value: ['cmake'] });
    const changes = events(root, 'ocx:list:change');
    const handle = await live(root, listbox);
    root.querySelector<HTMLElement>('[data-value="ninja"]')?.click();
    root.querySelector<HTMLElement>('[data-value="meson"]')?.click();
    root.querySelector<HTMLElement>('[data-value="cmake"]')?.click();
    await tick();
    expect(changes).toEqual([{ value: ['cmake', 'ninja'] }, { value: ['ninja'] }]);
    expect(root.querySelector('[data-value="ninja"]')?.getAttribute('aria-selected')).toBe('true');
    handle.destroy();
  });

  it('C-250 keys: arrows skip disabled items, Home/End, Enter selects, typeahead', async () => {
    const root = await place({ label: 'Tools', items: tools });
    const changes = events(root, 'ocx:list:change');
    const handle = await live(root, listbox);
    const box = part(root, 'content') as HTMLElement;
    const active = () => box.getAttribute('aria-activedescendant')?.replace(/^.*:/, '');
    // Focus with nothing selected highlights the first row (APG listbox).
    box.focus();
    await tick();
    expect(active()).toBe('cmake');
    key(box, 'ArrowDown');
    await tick();
    expect(active()).toBe('ninja');
    key(box, 'ArrowDown');
    await tick();
    expect(active()).toBe('bazel');
    key(box, 'Home');
    await tick();
    expect(active()).toBe('cmake');
    key(box, 'End');
    await tick();
    expect(active()).toBe('bazel');
    key(box, 'n');
    await tick();
    expect(active()).toBe('ninja');
    key(box, 'Enter');
    await tick();
    expect(changes).toEqual([{ value: ['ninja'] }]);
    handle.destroy();
  });
});

describe('C-251 async List', () => {
  type Fetch = ListFetchDetail;
  /** Answers `ocx:list:fetch` with `answer(detail)`; records each request. */
  function loader(root: Element, answer: (d: Fetch) => unknown) {
    const seen: Fetch[] = [];
    root.addEventListener('ocx:list:fetch', (e) => {
      const d = (e as CustomEvent<Fetch>).detail;
      seen.push(d);
      d.respond(answer(d) as ListPage);
    });
    return seen;
  }
  const page2: Item[] = [
    { value: 'gcc', label: 'gcc', description: 'GNU compiler' },
    { value: 'zig', label: 'zig' },
  ];
  const settle = async () => {
    for (let i = 0; i < 5; i++) await tick();
  };
  const more = (root: Element) => root.querySelector<HTMLButtonElement>('.ocx-list__more')!;
  const retry = (root: Element) => root.querySelector<HTMLButtonElement>('.ocx-list__retry')!;

  it('C-251 SSR: first page rendered, the cursor on the root, "Load more" shown only with a cursor', async () => {
    const root = await place({ label: 'Tools', items: tools, async: true, cursor: 'p2' });
    expect(root.getAttribute('data-ocx-async')).toBe('p2');
    expect(values(root)).toEqual(tools.map((t) => t.value));
    expect(more(root).hidden).toBe(false);
    expect(retry(root).hidden).toBe(true);
    expect(root.querySelector('[role="status"]')?.textContent).toBe('');
    const end = await place({ label: 'Tools', items: tools, async: true });
    expect(end.getAttribute('data-ocx-async')).toBe('');
    expect(more(end).hidden).toBe(true);
    const plain = await place({ label: 'Tools', items: tools });
    expect(plain.hasAttribute('data-ocx-async')).toBe(false);
    expect(plain.querySelector('.ocx-list__more')).toBeNull();
  });

  it('C-251 load more: fetches with the cursor, appends rows, emits ocx:list:load, hides at the end', async () => {
    const root = await place({ label: 'Tools', items: tools, async: true, cursor: 'p2' });
    const seen = loader(root, () => Promise.resolve({ items: page2 }));
    const loads = events(root, 'ocx:list:load');
    const handle = await live(root, asyncList);
    more(root).click();
    await settle();
    expect(seen.map((s) => s.cursor)).toEqual(['p2']);
    expect(values(root)).toEqual([...tools, ...page2].map((t) => t.value));
    expect(root.querySelector('[data-value="gcc"]')?.textContent).toContain('GNU compiler');
    // SSR rows keep their card text through the machine's first paint and the append.
    expect(root.querySelector('[data-value="cmake"]')?.textContent).toContain('Build system generator');
    expect(root.querySelector('[data-value="gcc"]')?.getAttribute('role')).toBe('option');
    expect(loads).toEqual([{ count: 6, hasMore: false }]);
    expect(more(root).hidden).toBe(true);
    expect(part(root, 'content')?.getAttribute('aria-busy')).not.toBe('true');
    // A loaded row is selectable like an SSR one.
    const changes = events(root, 'ocx:list:change');
    root.querySelector<HTMLElement>('[data-value="zig"]')?.click();
    await tick();
    expect(changes).toEqual([{ value: ['zig'] }]);
    handle.destroy();
  });

  it('C-251 error + retry: a failed load shows the error and Retry, which loads the same page again', async () => {
    const root = await place({ label: 'Tools', items: tools, async: true, cursor: 'p2' });
    let fail = true;
    const seen = loader(root, () => (fail ? Promise.reject(new Error('offline')) : Promise.resolve({ items: page2 })));
    const errors = events(root, 'ocx:list:error');
    const handle = await live(root, asyncList);
    more(root).click();
    await settle();
    expect(errors).toEqual([{ message: 'offline' }]);
    expect(root.querySelector('[role="status"]')?.textContent).toMatch(/could not load/i);
    expect(retry(root).hidden).toBe(false);
    expect(values(root)).toEqual(tools.map((t) => t.value));
    fail = false;
    retry(root).click();
    await settle();
    expect(seen.map((s) => s.cursor)).toEqual(['p2', 'p2']);
    expect(values(root)).toEqual([...tools, ...page2].map((t) => t.value));
    expect(retry(root).hidden).toBe(true);
    expect(root.querySelector('[role="status"]')?.textContent).toBe('');
    handle.destroy();
  });

  it('C-251 filter and sort: commands reload from the first page with the filter text and descriptor', async () => {
    const root = await place({ label: 'Tools', items: tools, async: true, cursor: 'p2' });
    const seen = loader(root, ({ filter }) =>
      Promise.resolve({ items: tools.filter((t) => t.label.startsWith(filter)), cursor: filter ? undefined : 'p2' }),
    );
    const handle = await live(root, asyncList);
    root.dispatchEvent(new CustomEvent('ocx:list:filter', { detail: { text: 'n' } }));
    await settle();
    expect(values(root)).toEqual(['ninja']);
    expect(more(root).hidden).toBe(true);
    root.dispatchEvent(new CustomEvent('ocx:list:sort', { detail: { column: 'label', direction: 'descending' } }));
    await settle();
    root.dispatchEvent(new CustomEvent('ocx:list:filter', { detail: { text: 'x' } }));
    await settle();
    expect(values(root)).toEqual([]);
    expect(part(root, 'content')?.hasAttribute('data-empty')).toBe(true);
    root.dispatchEvent(new CustomEvent('ocx:list:reload'));
    await settle();
    expect(seen.map(({ cursor, filter, sort }) => ({ cursor, filter, sort }))).toEqual([
      { cursor: null, filter: 'n', sort: null },
      { cursor: null, filter: 'n', sort: { column: 'label', direction: 'descending' } },
      { cursor: null, filter: 'x', sort: { column: 'label', direction: 'descending' } },
      { cursor: null, filter: 'x', sort: { column: 'label', direction: 'descending' } },
    ]);
    handle.destroy();
  });

  it('C-251 a newer command aborts the load in flight; its late answer is dropped', async () => {
    const root = await place({ label: 'Tools', items: tools, async: true, cursor: 'p2' });
    const late: ((v: unknown) => void)[] = [];
    const seen = loader(root, ({ filter }) =>
      filter === 'slow' ? new Promise((r) => late.push(r)) : Promise.resolve({ items: [tools[1]] }),
    );
    const handle = await live(root, asyncList);
    root.dispatchEvent(new CustomEvent('ocx:list:filter', { detail: { text: 'slow' } }));
    await tick();
    root.dispatchEvent(new CustomEvent('ocx:list:filter', { detail: { text: 'n' } }));
    await settle();
    expect(seen[0]?.signal?.aborted).toBe(true);
    late[0]?.({ items: page2 });
    await settle();
    expect(values(root)).toEqual(['ninja']);
    handle.destroy();
  });

  it('C-251 destroy aborts the load in flight and nothing renders afterwards', async () => {
    const root = await place({ label: 'Tools', items: tools, async: true, cursor: 'p2' });
    const late: ((v: unknown) => void)[] = [];
    const seen = loader(root, () => new Promise((r) => late.push(r)));
    const handle = await live(root, asyncList);
    more(root).click();
    await tick();
    expect(seen).toHaveLength(1);
    expect(part(root, 'content')?.getAttribute('aria-busy')).toBe('true');
    expect(root.querySelector('[role="status"]')?.textContent).toBe('Loading…');
    expect(more(root).hidden).toBe(true);
    handle.destroy();
    expect(seen[0]?.signal?.aborted).toBe(true);
    expect(part(root, 'content')?.hasAttribute('aria-busy')).toBe(false);
    expect(root.querySelector('[role="status"]')?.textContent).toBe('');
    late[0]?.({ items: page2 });
    await settle();
    expect(values(root)).toEqual(tools.map((t) => t.value));
  });

  it('C-251 no page handler, or a malformed answer: the error state, never a throw', async () => {
    const root = await place({ label: 'Tools', items: tools, async: true, cursor: 'p2' });
    const errors = events(root, 'ocx:list:error');
    const handle = await live(root, asyncList);
    more(root).click();
    await settle();
    const bad = [{ rows: [] }, { items: [{ value: 1, label: 'one' }] }];
    loader(root, () => Promise.resolve(bad.shift()));
    retry(root).click();
    await settle();
    retry(root).click();
    await settle();
    expect(errors).toHaveLength(3);
    expect(values(root)).toEqual(tools.map((t) => t.value));
    expect(retry(root).hidden).toBe(false);
    // Two listeners answer: the first answer (the exhausted, malformed one) wins over a valid second.
    loader(root, () => Promise.resolve({ items: page2 }));
    retry(root).click();
    await settle();
    expect(errors).toHaveLength(4);
    expect(values(root)).toEqual(tools.map((t) => t.value));
    handle.destroy();
  });

  it('C-251 a page with a duplicate value: the error state, no rows added', async () => {
    const root = await place({ label: 'Tools', items: tools, async: true, cursor: 'p2' });
    const errors = events(root, 'ocx:list:error');
    loader(root, () => Promise.resolve({ items: [page2[0], page2[0]] }));
    const handle = await live(root, asyncList);
    more(root).click();
    await settle();
    expect(errors).toHaveLength(1);
    expect(values(root)).toEqual(tools.map((t) => t.value));
    expect(retry(root).hidden).toBe(false);
    handle.destroy();
  });

  it('C-251 respondWith contract: a promise answered later loads; respond() after the listener returned is an error', async () => {
    const root = await place({ label: 'Tools', items: tools, async: true, cursor: 'p2' });
    const errors = events(root, 'ocx:list:error');
    let resolveLater: (page: ListPage) => void = () => {};
    let deferred = true;
    root.addEventListener('ocx:list:fetch', (e) => {
      const d = (e as CustomEvent<Fetch>).detail;
      if (deferred) d.respond(new Promise<ListPage>((r) => (resolveLater = r)));
      else setTimeout(() => d.respond({ items: page2 }), 0);
    });
    const handle = await live(root, asyncList);
    more(root).click();
    await settle();
    expect(part(root, 'content')?.getAttribute('aria-busy')).toBe('true');
    resolveLater({ items: page2, cursor: 'p3' });
    await settle();
    expect(values(root)).toEqual([...tools, ...page2].map((t) => t.value));
    deferred = false;
    more(root).click();
    await settle();
    await settle();
    expect(errors).toEqual([{ message: 'no ocx:list:fetch listener called respond() synchronously' }]);
    expect(values(root)).toEqual([...tools, ...page2].map((t) => t.value));
    handle.destroy();
  });

  it('C-251 sort during a load in flight aborts it and sorts', async () => {
    const root = await place({ label: 'Tools', items: tools, async: true, cursor: 'p2' });
    const pending: ((v: ListPage) => void)[] = [];
    const seen = loader(root, ({ sort }) =>
      sort ? Promise.resolve({ items: [...tools].reverse() }) : new Promise((r) => pending.push(r)),
    );
    const handle = await live(root, asyncList);
    more(root).click();
    await tick();
    root.dispatchEvent(new CustomEvent('ocx:list:sort', { detail: { column: 'label', direction: 'descending' } }));
    await settle();
    expect(seen[0]?.signal?.aborted).toBe(true);
    expect(seen[1]?.sort).toEqual({ column: 'label', direction: 'descending' });
    pending[0]?.({ items: page2 });
    await settle();
    expect(values(root)).toEqual([...tools].reverse().map((t) => t.value));
    handle.destroy();
  });

  it('C-251 a filter refreshes the text of rows it keeps', async () => {
    const root = await place({ label: 'Tools', items: tools, async: true });
    loader(root, () => Promise.resolve({ items: [{ value: 'cmake', label: 'CMake', meta: '4.0' }] }));
    const handle = await live(root, asyncList);
    const kept = root.querySelector('[data-value="cmake"]');
    root.dispatchEvent(new CustomEvent('ocx:list:filter', { detail: { text: 'c' } }));
    await settle();
    const now = root.querySelector('[data-value="cmake"]');
    expect(now).toBe(kept);
    expect(now?.querySelector('[data-part="item-text"]')?.textContent).toBe('CMake');
    expect(now?.querySelector('.ocx-list__meta')?.textContent).toBe('4.0');
    expect(now?.querySelector('.ocx-list__desc')).toBeNull();
    handle.destroy();
  });

  it('C-250 an async list ignores group (flat rows, no group wrapper to empty on reload)', async () => {
    const root = await place({ label: 'Tools', items: grouped, async: true });
    expect(root.querySelector('[role="group"]')).toBeNull();
    expect(values(root)).toEqual(['gcc', 'cmake', 'clang']);
  });
});
