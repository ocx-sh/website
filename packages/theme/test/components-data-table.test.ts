// DataTable: arrange/summary logic, SSR first paint (sorted, filtered, paged, empty), the lazy
// client half (sort, filter, paging through the nested Zag Pagination), and Pagination's
// `ocx:pagination:set` count resize that paging a filtered table needs.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
// @ts-expect-error jsdom ships no types and @types/jsdom is not a dependency
import * as jsdom from 'jsdom';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as pagination from '../src/components/pagination.zag.mjs';
import { arrange, bind, summary } from '../src/components/ui/data-table.mjs';
import { onClick as clearOnClick } from '../src/components/ui/search-field.mjs';
import { mount } from '../src/components/ui/zag.mjs';
import type { ZagModule } from '../src/components/ui/zag.mjs';

type Component = Parameters<AstroContainer['renderToString']>[0];
// Template import: tsc has no .astro module types (as in chrome.test.ts).
const load = async (path: string) => ((await import(path)) as { default: Component }).default;
const DataTable = await load('../src/components/ui/DataTable.astro');
const Pagination = await load('../src/components/Pagination.astro');

const { JSDOM } = jsdom as { JSDOM: new (html: string, o: object) => { window: Record<string, unknown> } };
let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
  const { window } = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/' });
  const g = globalThis as Record<string, unknown>;
  // Node's own Event/CustomEvent cannot be dispatched on jsdom nodes, so jsdom's win.
  const own = new Set(['Event', 'CustomEvent', 'EventTarget']);
  for (const key of Object.getOwnPropertyNames(window)) if (!(key in g) || own.has(key)) g[key] = window[key];
});

const COLUMNS = [
  { key: 'name', label: 'Package', mono: true },
  { key: 'version', label: 'Version', mono: true },
  { key: 'size', label: 'Size (MB)', numeric: true },
  { key: 'note', label: 'Notes', sortable: false },
];
const ROWS = [
  { name: 'cmake', version: '3.31.6', size: 52, note: 'build' },
  { name: 'ninja', version: '1.12.1', size: 1, note: 'build' },
  { name: 'nodejs', version: '24.1.0', size: 9, note: 'runtime' },
  { name: 'python', version: '3.13.2', size: 110, note: 'runtime' },
  { name: 'uv', version: '0.7.3', size: 18, note: 'tool' },
];

async function place(props: Record<string, unknown>): Promise<HTMLElement> {
  document.body.innerHTML = await container.renderToString(DataTable, {
    props: { caption: 'Packages', columns: COLUMNS, rows: ROWS, ...props },
  });
  const root = document.querySelector<HTMLElement>('[data-ocx-data-table]');
  if (!root) throw new Error('no [data-ocx-data-table] rendered');
  return root;
}
/** Names of the visible rows, in DOM order. */
const visible = (root: Element) =>
  [...root.querySelectorAll<HTMLTableRowElement>('tr[data-ocx-row]:not([hidden])')].map(
    (tr) => tr.cells[0]?.textContent,
  );
const status = (root: Element) => root.querySelector('[data-ocx-status]')?.textContent;
const tick = () => new Promise((r) => setTimeout(r, 0));
const style = (file: string) =>
  /<style[^>]*>([\s\S]*)<\/style>/.exec(
    readFileSync(join(import.meta.dirname, '../src/components', file), 'utf8'),
  )?.[1] ?? '';

describe('DataTable arrange and summary', () => {
  const text = ROWS.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v)])));

  it('filters case-insensitively over every cell, keeping source order', () => {
    expect(arrange(text, { query: '  RUNtime ' }).order).toEqual([2, 3]);
    expect(arrange(text, { query: 'zzz' })).toMatchObject({ order: [], visible: [], page: 1, pages: 1 });
  });

  it('sorts numbers numerically, stable, in both directions', () => {
    expect(arrange(text, { key: 'size' }).order).toEqual([1, 2, 4, 0, 3]);
    expect(arrange(text, { key: 'size', direction: 'descending' }).order).toEqual([3, 0, 4, 2, 1]);
    // Ties keep source order in both directions.
    expect(arrange(text, { key: 'note' }).order).toEqual([0, 1, 2, 3, 4]);
    expect(arrange(text, { key: 'note', direction: 'descending' }).order).toEqual([4, 2, 3, 0, 1]);
  });

  it('slices pages and clamps the page into range', () => {
    expect(arrange(text, { pageSize: 2, page: 2 })).toMatchObject({ visible: [2, 3], page: 2, pages: 3 });
    expect(arrange(text, { pageSize: 2, page: 9 })).toMatchObject({ visible: [4], page: 3 });
    expect(arrange(text, { pageSize: 2, page: 0 })).toMatchObject({ visible: [0, 1], page: 1 });
    expect(arrange(text, {})).toMatchObject({ visible: [0, 1, 2, 3, 4], pages: 1 });
  });

  it('summary counts matches against the total', () => {
    expect(summary(5, 5)).toBe('5 rows');
    expect(summary(1, 5)).toBe('1 of 5 rows');
    expect(summary(1, 1)).toBe('1 row');
  });
});

describe('DataTable SSR: first paint is final', () => {
  it('renders every row, a caption, a named scroll region, sort buttons except on unsortable columns', async () => {
    const root = await place({});
    expect(visible(root)).toEqual(['cmake', 'ninja', 'nodejs', 'python', 'uv']);
    expect(root.querySelector('caption')?.textContent).toBe('Packages');
    const region = root.querySelector('[role="region"]');
    expect(region?.getAttribute('aria-label')).toBe('Packages');
    expect(region?.getAttribute('tabindex')).toBe('0');
    expect([...root.querySelectorAll('button[data-ocx-sort]')].map((b) => b.getAttribute('data-ocx-sort'))).toEqual([
      'name',
      'version',
      'size',
    ]);
    expect(root.querySelector('[aria-sort]')).toBeNull();
    expect(root.querySelector<HTMLElement>('tr[data-ocx-empty]')?.hidden).toBe(true);
    expect(root.querySelector('input[data-ocx-filter]')?.getAttribute('type')).toBe('search');
    expect(root.querySelector('[data-ocx-pager]')).toBeNull();
    expect(status(root)).toBe('5 rows');
    expect(root.classList.contains('not-content')).toBe(true);
  });

  it('each sortable header renders the three Lucide sort icons; CSS shows the one for aria-sort, no triangles', async () => {
    const root = await place({});
    const th = root.querySelector('th[data-ocx-key="size"]');
    expect([...(th?.querySelectorAll('svg') ?? [])].map((svg) => svg.getAttribute('data-icon'))).toEqual([
      'sort',
      'sort-asc',
      'sort-desc',
    ]);
    expect(root.querySelector('th[data-ocx-key="note"] svg')).toBeNull();
    expect(root.querySelector('[data-ocx-up], [data-ocx-down]')).toBeNull();
    const css = readFileSync(join(import.meta.dirname, '../src/components/ui/DataTable.astro'), 'utf8');
    expect(css).toContain("th[aria-sort='ascending'] svg[data-icon='sort-asc']");
    expect(css).toContain("th[aria-sort='descending'] svg[data-icon='sort-desc']");
    expect(css).not.toContain('data-ocx-up');
  });

  it('sorted: rows in order and aria-sort on that header only', async () => {
    const root = await place({ sort: { key: 'size', direction: 'descending' } });
    expect(visible(root)).toEqual(['python', 'cmake', 'uv', 'nodejs', 'ninja']);
    expect([...root.querySelectorAll('th[aria-sort]')].map((th) => th.getAttribute('aria-sort'))).toEqual([
      'descending',
    ]);
    expect(root.querySelector('th[aria-sort]')?.getAttribute('data-ocx-key')).toBe('size');
  });

  it('filtered: non-matches hidden, query in the field, status counts', async () => {
    const root = await place({ query: 'build' });
    expect(visible(root)).toEqual(['cmake', 'ninja']);
    expect(root.querySelector<HTMLInputElement>('input[data-ocx-filter]')?.value).toBe('build');
    expect(status(root)).toBe('2 of 5 rows');
  });

  it('empty: no rows or no match shows the empty row and hides the pager', async () => {
    let root = await place({ rows: [], empty: 'Nothing here.', pageSize: 2 });
    expect(root.querySelector<HTMLElement>('tr[data-ocx-empty]')?.hidden).toBe(false);
    expect(root.querySelector('tr[data-ocx-empty] td')?.getAttribute('colspan')).toBe('4');
    expect(root.querySelector('tr[data-ocx-empty]')?.textContent).toBe('Nothing here.');
    expect(root.querySelector<HTMLElement>('[data-ocx-pager]')?.hidden).toBe(true);
    root = await place({ query: 'zzz' });
    expect(visible(root)).toEqual([]);
    expect(root.querySelector<HTMLElement>('tr[data-ocx-empty]')?.hidden).toBe(false);
  });

  it('paged: one page visible, the Zag Pagination on the matching count and page', async () => {
    const root = await place({ pageSize: 2, page: 2 });
    expect(visible(root)).toEqual(['nodejs', 'python']);
    expect(root.dataset['ocxPage']).toBe('2');
    const nav = root.querySelector<HTMLElement>('[data-zag-root="pagination"]');
    expect(JSON.parse(nav?.dataset['zagProps'] ?? '{}')).toMatchObject({ count: 5, pageSize: 2, defaultPage: 2 });
    expect(nav?.querySelector('[aria-current="page"]')?.textContent).toBe('2');
    expect(root.querySelector<HTMLElement>('[data-ocx-pager]')?.hidden).toBe(false);
  });

  it('the filter is a SearchField: labelled, hooked, with a clear button, controlling the table', async () => {
    const root = await place({ query: 'uv' });
    const field = root.querySelector('.ocx-ui-search-field.ocx-data-table__filter');
    expect(field).not.toBeNull();
    const input = field?.querySelector<HTMLInputElement>('input[data-ocx-filter]');
    expect(input?.type).toBe('search');
    expect(input?.value).toBe('uv');
    expect(input?.placeholder).toBe('Filter rows…');
    expect(input?.getAttribute('aria-controls')).toBe(root.querySelector('table')?.id);
    expect(input?.getAttribute('autocomplete')).toBe('off');
    expect(input?.getAttribute('spellcheck')).toBe('false');
    expect(field?.querySelector('label')?.textContent?.trim()).toBe('Filter Packages');
    expect(field?.querySelector('label')?.hasAttribute('data-hidden')).toBe(true);
    expect(field?.querySelector('button.ocx-ui-search-field__clear')?.getAttribute('aria-label')).toBe(
      'Clear Filter Packages',
    );
    expect(root.querySelector('input.ocx-ui-input')).toBeNull();
  });

  it('styles: @layer ocx, tokens only', () => {
    const s = style('ui/DataTable.astro');
    expect(s).toMatch(/@layer ocx\s*\{/);
    expect(s).toMatch(/var\(--ocx-color-hover\)/);
    expect(s).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(/i);
    // Opacity only shows or hides (the glyph crossfade, the row fade-in), never dims a colour.
    expect(s).not.toMatch(/opacity:\s*0?\.\d/);
  });

  it('motion (C-302): glyphs share one grid cell; fades only under [data-live], on tokens', () => {
    const s = style('ui/DataTable.astro').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(s).toMatch(/\.ocx-data-table__sort \{\s*display: grid;/);
    expect(s).toMatch(/th svg \{\s*grid-area: 1 \/ 1;/);
    for (const rule of s.match(/[^{}]*\{[^{}]*transition[^{}]*\}/g) ?? []) {
      expect(rule).toMatch(/^\s*\.ocx-data-table\[data-live\]/);
      expect(rule).toMatch(/transition: opacity var\(--ocx-duration-(base|enter)\)/);
    }
    expect(s).toMatch(/\.ocx-data-table\[data-live\] tbody tr:not\(\[hidden\]\) \{\s*@starting-style/);
  });
});

describe('DataTable live', () => {
  it('a sort button sorts ascending, then toggles; aria-sort follows; pager restarts at page 1', async () => {
    const root = await place({});
    const pager = vi.fn();
    bind(root, pager);
    expect(root.hasAttribute('data-live')).toBe(false);
    const size = root.querySelector<HTMLButtonElement>('button[data-ocx-sort="size"]');
    size?.click();
    expect(root.hasAttribute('data-live')).toBe(true);
    expect(visible(root)).toEqual(['ninja', 'nodejs', 'uv', 'cmake', 'python']);
    expect(root.querySelector('th[data-ocx-key="size"]')?.getAttribute('aria-sort')).toBe('ascending');
    size?.click();
    expect(visible(root)).toEqual(['python', 'cmake', 'uv', 'nodejs', 'ninja']);
    expect(root.querySelector('th[data-ocx-key="size"]')?.getAttribute('aria-sort')).toBe('descending');
    root.querySelector<HTMLButtonElement>('button[data-ocx-sort="name"]')?.click();
    expect(root.querySelectorAll('th[aria-sort]')).toHaveLength(1);
    expect(root.querySelector('th[data-ocx-key="name"]')?.getAttribute('aria-sort')).toBe('ascending');
    expect(pager).toHaveBeenLastCalledWith(5);
  });

  it('the filter narrows rows, shows the empty row on no match, and reports the count to the pager', async () => {
    const root = await place({ pageSize: 2 });
    const pager = vi.fn();
    bind(root, pager);
    const input = root.querySelector<HTMLInputElement>('input[data-ocx-filter]');
    if (!input) throw new Error('no filter');
    expect(root.hasAttribute('data-live')).toBe(false);
    input.value = 'runtime';
    input.dispatchEvent(new Event('input'));
    expect(root.hasAttribute('data-live')).toBe(true);
    expect(visible(root)).toEqual(['nodejs', 'python']);
    expect(status(root)).toBe('2 of 5 rows');
    expect(pager).toHaveBeenLastCalledWith(2);
    expect(root.querySelector<HTMLElement>('[data-ocx-pager]')?.hidden).toBe(true);
    input.value = 'zzz';
    input.dispatchEvent(new Event('input'));
    expect(visible(root)).toEqual([]);
    expect(root.querySelector<HTMLElement>('tr[data-ocx-empty]')?.hidden).toBe(false);
    input.value = '';
    input.dispatchEvent(new Event('input'));
    expect(visible(root)).toEqual(['cmake', 'ninja']);
    expect(root.querySelector<HTMLElement>('[data-ocx-pager]')?.hidden).toBe(false);
  });

  it('the SearchField clear button re-filters: every row is back and the pager count resets', async () => {
    const root = await place({ pageSize: 2 });
    const pager = vi.fn();
    bind(root, pager);
    document.addEventListener('click', clearOnClick);
    try {
      const input = root.querySelector<HTMLInputElement>('input[data-ocx-filter]');
      if (!input) throw new Error('no filter');
      input.value = 'runtime';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      expect(visible(root)).toEqual(['nodejs', 'python']);
      expect(status(root)).toBe('2 of 5 rows');
      root.querySelector<HTMLButtonElement>('.ocx-ui-search-field__clear')?.click();
      expect(input.value).toBe('');
      expect(visible(root)).toEqual(['cmake', 'ninja']);
      expect(status(root)).toBe('5 rows');
      expect(pager).toHaveBeenLastCalledWith(5);
    } finally {
      document.removeEventListener('click', clearOnClick);
    }
  });

  it('a query typed before the module loaded is applied on bind', async () => {
    const root = await place({});
    const input = root.querySelector<HTMLInputElement>('input[data-ocx-filter]');
    if (input) input.value = 'uv';
    bind(root);
    expect(visible(root)).toEqual(['uv']);
    // Not an interaction: the rows arrange without the fade.
    expect(root.hasAttribute('data-live')).toBe(false);
  });

  it('pages follow ocx:pagination:change from the live Pagination', async () => {
    const root = await place({ pageSize: 2 });
    // The page script's job, registered before bind: keep the page on the root.
    root.addEventListener('ocx:pagination:change', (e) => {
      root.dataset['ocxPage'] = String((e as CustomEvent<{ page: number }>).detail.page);
    });
    bind(root);
    const nav = root.querySelector<HTMLElement>('[data-zag-root="pagination"]');
    if (!nav) throw new Error('no pagination');
    const handle = mount(nav, { load: () => Promise.resolve(pagination as unknown as ZagModule), trigger: 'manual' });
    await handle.start();
    expect(root.hasAttribute('data-live')).toBe(false);
    nav.querySelector<HTMLButtonElement>('[data-part="next-trigger"]')?.click();
    await tick();
    expect(visible(root)).toEqual(['nodejs', 'python']);
    expect(root.hasAttribute('data-live')).toBe(true);
    nav.querySelector<HTMLButtonElement>('[data-index="3"]')?.click();
    await tick();
    expect(visible(root)).toEqual(['uv']);
    handle.destroy();
  });
});

describe('DataTable page script: arms early on a restored filter', () => {
  // The script is inline in the .astro (no module to import): strip its imports, transpile the
  // TS, and run it against the jsdom document with `mount` and a recording `import()` injected.
  const source = /<script>([\s\S]*?)<\/script>/.exec(
    readFileSync(join(import.meta.dirname, '../src/components/ui/DataTable.astro'), 'utf8'),
  )?.[1];
  const run = async () => {
    const ts = await import('typescript');
    const code = (source ?? '').replace(/^\s*import .*;$/gm, '').replaceAll('import(', '__import(');
    const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    const loaded: string[] = [];
    const __import = (spec: string) => {
      loaded.push(spec);
      return Promise.resolve(spec.endsWith('data-table.mjs') ? { bind } : pagination);
    };
    // eslint-disable-next-line @typescript-eslint/no-implied-eval -- runs the transpiled inline script with injected globals
    const script = new Function('mount', '__import', 'document', 'window', 'CustomEvent', 'console', js) as (
      ...args: unknown[]
    ) => Promise<void>;
    await script(mount, __import, document, window, CustomEvent, console);
    return { table: () => loaded.filter((s) => s.endsWith('data-table.mjs')).length };
  };
  const filter = (root: Element) => {
    const input = root.querySelector<HTMLInputElement>('input[data-ocx-filter]');
    if (!input) throw new Error('no filter input');
    return input;
  };

  it('a filter value differing from its default starts the table at once, no interaction', async () => {
    const root = await place({});
    filter(root).value = 'uv';
    const { table } = await run();
    await tick();
    expect(table()).toBe(1);
    expect(visible(root)).toEqual(['uv']);
  });

  it('an untouched filter waits for the first pointer/focus/touch', async () => {
    const root = await place({});
    const { table } = await run();
    await tick();
    expect(table()).toBe(0);
    root.dispatchEvent(new Event('pointerenter'));
    await tick();
    expect(table()).toBe(1);
  });

  it('a value restored after the script ran arms on pageshow', async () => {
    const root = await place({});
    const { table } = await run();
    filter(root).value = 'uv';
    window.dispatchEvent(new Event('pageshow'));
    await tick();
    expect(table()).toBe(1);
    expect(visible(root)).toEqual(['uv']);
  });
});

describe('Pagination ocx:pagination:set', () => {
  it('resizes the page window: surplus slots hidden, missing ones added, elements reused', async () => {
    document.body.innerHTML = await container.renderToString(Pagination, { props: { count: 200, pageSize: 10 } });
    const root = document.querySelector<HTMLElement>('[data-zag-root="pagination"]');
    if (!root) throw new Error('no pagination');
    const handle = mount(root, { load: () => Promise.resolve(pagination as unknown as ZagModule), trigger: 'manual' });
    await handle.start();
    const pages = () =>
      [...root.querySelectorAll<HTMLElement>('[data-ocx-slot]:not([hidden]) > *')].map((e) =>
        e.getAttribute('data-part') === 'ellipsis' ? '…' : e.textContent,
      );
    const set = (count: unknown) => root.dispatchEvent(new CustomEvent('ocx:pagination:set', { detail: { count } }));
    expect(pages()).toEqual(['1', '2', '3', '4', '5', '…', '20']);
    set(25);
    await tick();
    expect(pages()).toEqual(['1', '2', '3']);
    expect(root.querySelectorAll('[data-ocx-slot]')).toHaveLength(7);
    set(-1);
    set('9');
    await tick();
    expect(pages()).toEqual(['1', '2', '3']);
    set(90);
    await tick();
    expect(pages()).toEqual(['1', '2', '3', '4', '5', '…', '9']);
    expect(root.querySelectorAll('[data-ocx-slot]')).toHaveLength(7);
    handle.destroy();
  });

  it('adds slots when the window grows past the rendered ones', async () => {
    document.body.innerHTML = await container.renderToString(Pagination, { props: { count: 20, pageSize: 10 } });
    const root = document.querySelector<HTMLElement>('[data-zag-root="pagination"]');
    if (!root) throw new Error('no pagination');
    const handle = mount(root, { load: () => Promise.resolve(pagination as unknown as ZagModule), trigger: 'manual' });
    await handle.start();
    expect(root.querySelectorAll('[data-ocx-slot]')).toHaveLength(2);
    root.dispatchEvent(new CustomEvent('ocx:pagination:set', { detail: { count: 50 } }));
    await tick();
    const slots = [...root.querySelectorAll('[data-ocx-slot]')];
    expect(slots.map((s) => s.textContent)).toEqual(['1', '2', '3', '4', '5']);
    // New slots sit between the prev and next triggers.
    expect(root.querySelector('li:last-child [data-part="next-trigger"]')).not.toBeNull();
    handle.destroy();
  });
});
