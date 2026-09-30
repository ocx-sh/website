// WP13.4 DependencyExplorer: port of ocx DependencyExplorer.vue (7166c012d).
// Pure filter/summary logic from dependency-explorer.mjs + the server-rendered
// skeleton via the Astro Container API. Interaction lives in the e2e spec.
import { readFileSync } from 'node:fs';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
// @ts-expect-error jsdom ships no types and @types/jsdom is not a dependency
import * as jsdom from 'jsdom';
import { beforeAll, describe, expect, it } from 'vitest';
import * as collapsible from '@zag-js/collapsible';
import {
  RESERVE_MAX,
  collapsibleParts,
  componentKey,
  filterComponents,
  firstBinary,
  hasDetail,
  licenseOptions,
  reserveRows,
  safeHref,
} from '../src/components/dependency-explorer.mjs';
import { ssrApi, ssrAttrs } from '../src/components/ui/zag-runtime.mjs';

type Win = Window & typeof globalThis;
type Component = Parameters<AstroContainer['renderToString']>[0];
// Template import: tsc has no .astro module types (as in chrome.test.ts).
const DependencyExplorer = ((await import(`../src/components/${'DependencyExplorer'}.astro`)) as { default: Component })
  .default;
const { JSDOM } = jsdom as { JSDOM: new (html: string) => { window: Win } };
type Comp = Parameters<typeof componentKey>[0];
type Data = Parameters<typeof firstBinary>[0];

const comp = (name: string, version: string, license: string, description = '', author = ''): Comp => ({
  name,
  version,
  license,
  description,
  author,
  scope: 'required',
  links: {},
});

// Real rows from https://ocx.sh/data/dependencies.json.
const COMPONENTS: Comp[] = [
  comp(
    'aes',
    '0.8.4',
    'MIT OR Apache-2.0',
    'Pure Rust implementation of the Advanced Encryption Standard',
    'RustCrypto Developers',
  ),
  comp(
    'base16ct',
    '0.2.0',
    'Apache-2.0 OR MIT',
    'Pure Rust implementation of Base16 a.k.a hexadecimal',
    'RustCrypto Developers',
  ),
  comp('base64', '0.21.7', 'MIT OR Apache-2.0', 'encodes and decodes base64 as bytes or utf8', 'Alice Maz'),
  comp('base64', '0.22.1', 'MIT OR Apache-2.0', 'encodes and decodes base64 as bytes or utf8', 'Marshall Pierce'),
  comp('bytes', '1.12.1', 'MIT', 'Types and traits for working with bytes', 'Carl Lerche'),
  comp('ocx_config', '0.6.3', 'Apache-2.0'),
];
const names = (cs: Comp[]) => cs.map(componentKey);
/** A `data:` SBOM whose first binary lists `components` (the showcase feeds its demos this way). */
const sbom = (components: Comp[]) =>
  `data:application/json,${JSON.stringify({
    generated: '2026-09-27',
    binaries: { ocx: { summary: { total: components.length, uniqueLicenses: 0, licenses: {} }, components } },
  })}`;

describe('WP13.4 DependencyExplorer logic', () => {
  it('WP13.4 DependencyExplorer: rows are keyed name@version, so two versions of one crate are distinct (7166c012d)', () => {
    expect(componentKey(COMPONENTS[2]!)).toBe('base64@0.21.7');
    expect(new Set(names(COMPONENTS)).size).toBe(COMPONENTS.length);
  });

  it('WP13.4 DependencyExplorer: empty query and licence return every component (7166c012d)', () => {
    expect(filterComponents(COMPONENTS, '', '')).toEqual(COMPONENTS);
  });

  it('WP13.4 DependencyExplorer: search is a case-insensitive substring over name (7166c012d)', () => {
    expect(names(filterComponents(COMPONENTS, 'BASE64', ''))).toEqual(['base64@0.21.7', 'base64@0.22.1']);
  });

  it('WP13.4 DependencyExplorer: search also matches the description (7166c012d)', () => {
    expect(names(filterComponents(COMPONENTS, 'pure rust', ''))).toEqual(['aes@0.8.4', 'base16ct@0.2.0']);
  });

  it('WP13.4 DependencyExplorer: search does not match author, licence or version (7166c012d)', () => {
    expect(filterComponents(COMPONENTS, 'RustCrypto', '')).toEqual([]);
    expect(filterComponents(COMPONENTS, 'Apache', '')).toEqual([]);
    expect(filterComponents(COMPONENTS, '0.22.1', '')).toEqual([]);
  });

  it('WP13.4 DependencyExplorer: licence filter is an exact match, not a substring (7166c012d)', () => {
    expect(names(filterComponents(COMPONENTS, '', 'MIT'))).toEqual(['bytes@1.12.1']);
  });

  it('WP13.4 DependencyExplorer: search AND licence filter combine (7166c012d)', () => {
    expect(names(filterComponents(COMPONENTS, 'pure rust', 'Apache-2.0 OR MIT'))).toEqual(['base16ct@0.2.0']);
    expect(filterComponents(COMPONENTS, 'base64', 'MIT')).toEqual([]);
  });

  it('WP13.4 DependencyExplorer: licence options are sorted most-used first (7166c012d)', () => {
    expect(licenseOptions({ MIT: 2, 'MIT OR Apache-2.0': 9, ISC: 4 })).toEqual([
      ['MIT OR Apache-2.0', 9],
      ['ISC', 4],
      ['MIT', 2],
    ]);
  });

  it('WP13.4 DependencyExplorer: shows the first binary of a multi-binary file; none → null (7166c012d)', () => {
    const bin = (version: string) => ({
      version,
      license: 'Apache-2.0',
      target: 'x86_64-unknown-linux-gnu',
      summary: { total: 0, required: 0, excluded: 0, uniqueLicenses: 0, licenses: {} },
      components: [],
    });
    const data: Data = { generated: '2026-09-25', binaries: { ocx: bin('0.6.3'), other: bin('9.9.9') } };
    expect(firstBinary(data)?.version).toBe('0.6.3');
    expect(firstBinary({ generated: '2026-09-25', binaries: {} })).toBeNull();
  });

  it('WP13.4 DependencyExplorer: a row expands only when it has a description or an author (7166c012d)', () => {
    expect(hasDetail(COMPONENTS[0]!)).toBe(true);
    expect(hasDetail(comp('x', '1', 'MIT', '', 'Someone'))).toBe(true);
    expect(hasDetail(comp('x', '1', 'MIT', 'Some text'))).toBe(true);
    expect(hasDetail(COMPONENTS[5]!)).toBe(false);
  });

  it.each([
    ['https://crates.io/crates/aes', 'https://crates.io/crates/aes'],
    ['http://example.com/x', 'http://example.com/x'],
    ['javascript:alert(1)', null],
    [' JavaScript:alert(1)', null],
    ['data:text/html,<script>alert(1)</script>', null],
    ['//evil.example/x', null],
    ['/relative/path', null],
    ['', null],
    [undefined, null],
  ])('WP13.4 DependencyExplorer: safeHref(%j) → %j (only absolute http(s) links render)', (url, want) => {
    expect(safeHref(url)).toBe(want);
  });

  it('WP13.4 DependencyExplorer: no HTML-string sinks in the component or its script (textContent only)', () => {
    for (const file of ['DependencyExplorer.astro', 'dependency-explorer.mjs']) {
      const src = readFileSync(new URL(`../src/components/${file}`, import.meta.url), 'utf8');
      expect(src, file).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|set:html|document\.write/);
    }
  });
});

describe('WP13.4 DependencyExplorer markup', () => {
  let container: AstroContainer;
  beforeAll(async () => {
    container = await AstroContainer.create();
  });
  const render = async (props: { src?: string } = {}): Promise<Document> =>
    new JSDOM(await container.renderToString(DependencyExplorer, { props })).window.document;

  it('WP13.4 DependencyExplorer: src defaults to data/dependencies.json under the site base (base-aware; the e2e spec proves /docs/ in the example)', async () => {
    const root = (await render()).querySelector('.ocx-deps');
    expect(root?.getAttribute('data-src')).toBe('/docs/data/dependencies.json');
  });

  it('WP13.4 DependencyExplorer: an explicit src is passed through', async () => {
    expect((await render({ src: '/x/deps.json' })).querySelector('.ocx-deps')?.getAttribute('data-src')).toBe(
      '/x/deps.json',
    );
  });

  it('WP13.4 DependencyExplorer: server HTML shows the loading status; error and empty states start hidden (7166c012d)', async () => {
    const doc = await render();
    expect(doc.querySelector('.ocx-deps__count [role="status"]')?.textContent.trim()).toBe('Loading dependency data…');
    expect(doc.querySelector('.ocx-deps__loading')?.hasAttribute('hidden')).toBe(false);
    const error = doc.querySelector('.ocx-deps__error');
    expect(error?.getAttribute('role')).toBe('alert');
    expect(error?.hasAttribute('hidden')).toBe(true);
    expect(doc.querySelector('.ocx-deps__empty')?.hasAttribute('hidden')).toBe(true);
  });

  it('WP13.4 DependencyExplorer: labelled search box and licence select with an "All licenses" default (7166c012d)', async () => {
    const doc = await render();
    const labelOf = (el: Element | null) =>
      el?.getAttribute('aria-label') ??
      (el?.id ? doc.querySelector(`label[for="${el.id}"]`)?.textContent.trim() : undefined);
    const search = doc.querySelector('.ocx-deps input[type="search"]');
    expect(labelOf(search)).toBe('Search dependencies');
    const select = doc.querySelector('.ocx-deps select');
    expect(labelOf(select)).toBe('License');
    expect(select?.querySelector('option')?.getAttribute('value')).toBe('');
    expect(select?.querySelector('option')?.textContent.trim()).toBe('All licenses');
  });

  it('WP13.4 DependencyExplorer: table head is Name, Version, License, Links (7166c012d)', async () => {
    const heads = [...(await render()).querySelectorAll('.ocx-deps table thead th')].map((th) => th.textContent.trim());
    expect(heads).toEqual(['Name', 'Version', 'License', 'Links']);
  });

  it('C-274 DependencyExplorer: search is the SearchField primitive (type=search, hidden label, clear button)', async () => {
    const doc = await render();
    const input = doc.querySelector('.ocx-deps .ocx-deps__search.ocx-ui-search-field input[type="search"]');
    expect(input).not.toBeNull();
    expect(input?.getAttribute('autocomplete')).toBe('off');
    expect(input?.getAttribute('placeholder')).toBe('Search dependencies…');
    const label = doc.querySelector(`label[for="${input?.id}"]`);
    expect(label?.classList.contains('ocx-ui-field__label')).toBe(true);
    expect(label?.hasAttribute('data-hidden')).toBe(true);
    expect(doc.querySelector('.ocx-deps__search .ocx-ui-search-field__clear')?.getAttribute('aria-label')).toBe(
      'Clear Search dependencies',
    );
    // The script finds the one search input by type; the clear button must not be a second one.
    expect(doc.querySelectorAll('.ocx-deps input[type="search"]')).toHaveLength(1);
  });

  it('C-161 DependencyExplorer: the licence filter is the Zag Select; its native <select> starts with "All licenses"', async () => {
    const doc = await render();
    const root = doc.querySelector('.ocx-deps [data-zag-root="select"]');
    expect(root?.getAttribute('data-zag-state')).toBe('idle');
    expect(root?.querySelector('button[role="combobox"]')?.textContent.trim()).toBe('All licenses');
    const first = root?.querySelector('select option');
    expect(first?.getAttribute('value')).toBe('');
    expect(first?.textContent.trim()).toBe('All licenses');
  });
  it('C-161 DependencyExplorer: runtime licences are appended to the native select as <option data-meta> (the Select list follows)', () => {
    const src = readFileSync(new URL('../src/components/dependency-explorer.mjs', import.meta.url), 'utf8');
    expect(src).toMatch(/new Option\(lic, lic\)/);
    expect(src).toMatch(/dataset\['meta'\] = String\(n\)/);
    expect(src).not.toMatch(/ocx-ui-select__option/);
  });

  it('WP14c DependencyExplorer: loading is the Loader primitive (count line) over a Skeleton reserve (no viewport-high min-height)', async () => {
    const doc = await render();
    expect(doc.querySelector('.ocx-deps__count .ocx-ui-loader[role="status"]')).not.toBeNull();
    expect(doc.querySelector('.ocx-deps__loading .ocx-ui-skeleton[aria-hidden="true"]')).not.toBeNull();
    const src = readFileSync(new URL('../src/components/DependencyExplorer.astro', import.meta.url), 'utf8');
    expect(src).not.toMatch(/100vh|ocx-deps__spinner|ocx-deps-spin/);
  });

  it('WP14c DependencyExplorer: error and noscript notices are Starlight danger asides', async () => {
    const doc = await render();
    const error = doc.querySelector('.ocx-deps__error');
    expect(error?.classList.contains('starlight-aside')).toBe(true);
    expect(error?.classList.contains('starlight-aside--danger')).toBe(true);
    expect(error?.querySelector('.starlight-aside__content')).not.toBeNull();
    const html = await container.renderToString(DependencyExplorer, { props: {} });
    expect(/<noscript>([\s\S]*?)<\/noscript>/.exec(html)?.[1]).toMatch(/starlight-aside starlight-aside--danger/);
  });
});

describe('Z11 DependencyExplorer on Zag (C-220, C-221)', () => {
  let container: AstroContainer;
  beforeAll(async () => {
    container = await AstroContainer.create();
  });
  const render = async (src?: string): Promise<Document> =>
    new JSDOM(await container.renderToString(DependencyExplorer, { props: src ? { src } : {} })).window.document;
  const bare = (i: number) => comp(`crate${i}`, '1.0.0', 'MIT');

  it.each(['root', 'trigger', 'content'] as const)(
    'C-220 a runtime row paints the %s part exactly as Zag collapsible SSR does (C-130a)',
    (part) => {
      const api = ssrApi(collapsible.machine, collapsible.connect, {
        id: 'ocx-deps-1-0',
        defaultOpen: false,
        disabled: false,
      });
      const want = { root: api.getRootProps(), trigger: api.getTriggerProps(), content: api.getContentProps() }[part];
      expect(collapsibleParts('ocx-deps-1-0')[part]).toEqual(ssrAttrs(want));
    },
  );

  it.each([
    ['three rows', sbom(COMPONENTS.slice(0, 3)), 3],
    ['exactly the cap', sbom(Array.from({ length: RESERVE_MAX }, (_, i) => bare(i))), RESERVE_MAX],
    ['more than the cap', sbom(Array.from({ length: RESERVE_MAX + 8 }, (_, i) => bare(i))), RESERVE_MAX],
    ['no rows', sbom([]), 0],
    ['no binary', `data:application/json,${JSON.stringify({ generated: 'x', binaries: {} })}`, 0],
    ['unreadable data', 'data:application/json,{', 0],
    [
      'a percent-encoded data: URL',
      `data:application/json,${encodeURIComponent(sbom(COMPONENTS.slice(0, 2)).slice('data:application/json,'.length))}`,
      2,
    ],
    ['a same-site file (not readable at build time)', '/docs/data/dependencies.json', RESERVE_MAX],
  ])('C-221 reserveRows: %s → %i placeholder rows', async (_, src, want) => {
    expect(await reserveRows(src)).toBe(want);
  });

  it('C-221 the server renders one placeholder row per row the SBOM will render, the empty state hidden', async () => {
    const doc = await render(sbom(COMPONENTS.slice(0, 3)));
    const rows = doc.querySelectorAll('.ocx-deps tbody tr.ocx-deps__loading');
    expect(rows).toHaveLength(3);
    for (const tr of rows) {
      // Name + Version, then the wide cell narrow screens hide (no column re-layout when data lands).
      expect([...tr.querySelectorAll('td')].map((td) => [td.getAttribute('colspan'), td.className])).toEqual([
        ['2', ''],
        ['2', 'ocx-deps__wide'],
      ]);
      expect(tr.querySelector('.ocx-ui-skeleton[aria-hidden="true"]')).not.toBeNull();
    }
    expect(doc.querySelector('.ocx-deps__empty')?.hasAttribute('hidden')).toBe(true);
    expect(doc.querySelector('.ocx-deps table')?.getAttribute('aria-busy')).toBe('true');
    expect((await render()).querySelectorAll('.ocx-deps tbody tr.ocx-deps__loading')).toHaveLength(RESERVE_MAX);
  });

  it('C-221 an SBOM with no rows reserves the empty state instead (in flow, shown once loaded)', async () => {
    const doc = await render(sbom([]));
    expect(doc.querySelectorAll('.ocx-deps tbody tr')).toHaveLength(0);
    expect(doc.querySelector('.ocx-deps__empty')?.hasAttribute('hidden')).toBe(false);
  });

  it('C-220 row styles ride with the runtime module, not in the page (htmlGz, C-110)', () => {
    const astro = readFileSync(new URL('../src/components/DependencyExplorer.astro', import.meta.url), 'utf8');
    const mjs = readFileSync(new URL('../src/components/dependency-explorer.mjs', import.meta.url), 'utf8');
    const css = readFileSync(new URL('../src/components/dependency-explorer.css', import.meta.url), 'utf8');
    expect(astro).not.toMatch(/ocx-deps__(toggle|detail|link)\b/);
    expect(css).toMatch(/@layer ocx \{[\s\S]*\.ocx-deps__toggle/);
    expect(mjs).toMatch(/import css from '\.\/dependency-explorer\.css\?inline'/);
    // Rows mount the Collapsible's machine module through the shared glue (D-Z17), never @zag-js directly.
    expect(mjs).toMatch(/import\('\.\/collapsible\.zag\.mjs'\)/);
    expect(mjs).not.toMatch(/@zag-js\//);
  });

  it('R5 rows a filter shows fade in, never the load (busy at first paint, no focus in the explorer)', () => {
    const css = readFileSync(new URL('../src/components/dependency-explorer.css', import.meta.url), 'utf8');
    expect(css).toMatch(
      /\.ocx-deps:focus-within \.ocx-deps__table:not\(\[aria-busy\]\) tr:not\(\[hidden\]\) \{\s*transition: opacity var\(--ocx-duration-base\) var\(--ocx-ease-out\);\s*@starting-style \{\s*opacity: 0;/,
    );
  });
});
