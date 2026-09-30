// Logic for DependencyExplorer.astro (WP13.4, C-220..C-222). Pure helpers are unit-tested;
// `mountExplorer` renders with DOM APIs + textContent only.
/// <reference path="../virtual.d.ts" />
import css from './dependency-explorer.css?inline';
import { mount } from './ui/zag.mjs';

/**
 * @typedef {{ cratesIo?: string, docsRs?: string, repository?: string, website?: string }} ComponentLinks
 * @typedef {{ name: string, version: string, license: string, description: string, author: string,
 *   scope: string, links: ComponentLinks }} DependencyComponent
 * @typedef {{ total: number, required: number, excluded: number, uniqueLicenses: number,
 *   licenses: Record<string, number> }} BinarySummary
 * @typedef {{ version: string, license: string, target: string, summary: BinarySummary,
 *   components: DependencyComponent[] }} BinaryData
 * @typedef {{ generated: string, binaries: Record<string, BinaryData> }} DependencyData
 */

/**
 * Row identity: `name@version` (two versions of one crate are two rows).
 * @param {DependencyComponent} c
 * @returns {string}
 */
export function componentKey(c) {
  return `${c.name}@${c.version}`;
}

/**
 * The first binary in the file (the page shows one binary, as the Vue original did).
 * @param {DependencyData} data
 * @returns {BinaryData | null}
 */
export function firstBinary(data) {
  return Object.values(data.binaries)[0] ?? null;
}

/**
 * Licence `<select>` options, most-used first.
 * @param {Record<string, number>} licenses
 * @returns {[string, number][]}
 */
export function licenseOptions(licenses) {
  return Object.entries(licenses).sort((a, b) => b[1] - a[1]);
}

/**
 * Case-insensitive substring search over name + description, AND an exact
 * licence match (empty query / licence = no constraint).
 * @param {DependencyComponent[]} components
 * @param {string} query
 * @param {string} license
 * @returns {DependencyComponent[]}
 */
export function filterComponents(components, query, license) {
  const q = query.toLowerCase();
  return components.filter(
    (c) =>
      (!q || c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q)) &&
      (!license || c.license === license),
  );
}

/**
 * Whether the row expands: it has a description or an author.
 * @param {DependencyComponent} c
 * @returns {boolean}
 */
export function hasDetail(c) {
  return Boolean(c.description || c.author);
}

/**
 * The URL if it is absolute http(s), else null (no `javascript:`, `data:`, relative).
 * @param {string | undefined} url
 * @returns {string | null}
 */
export function safeHref(url) {
  return url && /^https?:\/\//i.test(url) ? url : null;
}

/** Most placeholder rows the loading state reserves (C-221). */
export const RESERVE_MAX = 12;

/**
 * Placeholder rows for the loading state (C-221): the rows the SBOM will render, capped at
 * `RESERVE_MAX`. Only a `data:` source is readable at build time; any other source reserves the cap.
 * ponytail: a same-site file under `public/` could be read at build time too; add it when a consumer
 * ships an SBOM shorter than the cap.
 * @param {string} src
 * @returns {Promise<number>}
 */
export async function reserveRows(src) {
  if (!src.startsWith('data:')) return RESERVE_MAX;
  try {
    /** @type {unknown} */
    const json = await (await fetch(src)).json();
    return Math.min(firstBinary(/** @type {DependencyData} */ (json))?.components.length ?? 0, RESERVE_MAX);
  } catch {
    return 0;
  }
}

/**
 * The attributes Zag `collapsible` renders for a closed row with this id (what `ssrApi` gives; a
 * unit test holds them equal), so a runtime row paints final before its machine loads (C-130a).
 * @param {string} id
 * @returns {Record<'root' | 'trigger' | 'content', Record<string, string>>}
 */
export function collapsibleParts(id) {
  const base = `collapsible:${id}`;
  const part = (/** @type {string} */ name) => ({ 'data-scope': 'collapsible', 'data-part': name });
  return {
    root: { ...part('root'), 'data-state': 'closed', id: base },
    trigger: {
      ...part('trigger'),
      id: `${base}:trigger`,
      type: 'button',
      'data-state': 'closed',
      'aria-controls': `${base}:content`,
      'aria-expanded': 'false',
    },
    content: {
      ...part('content'),
      id: `${base}:content`,
      'data-collapsible': '',
      'data-state': 'closed',
      hidden: '',
      style: '--height:0px;--width:0px;',
    },
  };
}

/** @type {[keyof ComponentLinks, string][]} */
const LINKS = [
  ['cratesIo', 'crates.io'],
  ['docsRs', 'docs'],
  ['repository', 'repo'],
];

/**
 * `<tag class=…>text</tag>`, built with DOM APIs (never an HTML string).
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {string} [className]
 * @param {string} [text]
 * @returns {HTMLElementTagNameMap[K]}
 */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** @param {Element} node @param {Record<string, string>} attrs */
function set(node, attrs) {
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
}

/**
 * The component's safe links, or null when it has none.
 * @param {DependencyComponent} c
 * @param {string} className
 * @returns {HTMLElement | null}
 */
function links(c, className) {
  const box = el('span', className);
  for (const [key, label] of LINKS) {
    const href = safeHref(c.links[key]);
    if (!href) continue;
    const a = el('a', 'ocx-deps__link', label);
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    box.append(a);
  }
  return box.childElementCount ? box : null;
}

// Deterministic per-page ids (no Math.random()): one prefix per load of an explorer.
let loads = 0;
const loadCollapsible = () => import('./collapsible.zag.mjs');

/**
 * The row and, when it has detail, its (hidden) detail row: a Zag collapsible whose root is the
 * row, trigger the name button and content the detail row. The detail is filled on first open.
 * @param {DependencyComponent} c
 * @param {string} id collapsible id
 * @param {import('./ui/zag.mjs').MountHandle[]} handles collects every mount, for teardown on reload
 * @returns {HTMLTableRowElement[]}
 */
function renderRows(c, id, handles) {
  const tr = el('tr');
  tr.dataset['key'] = componentKey(c);
  const name = el('td', 'ocx-deps__name');
  const lic = el('td', 'ocx-deps__license ocx-deps__wide', c.license);
  const linkCell = el('td', 'ocx-deps__wide');
  const rowLinks = links(c, 'ocx-deps__links');
  if (rowLinks) linkCell.append(rowLinks);
  tr.append(name, el('td', 'ocx-deps__version', c.version), lic, linkCell);
  if (!hasDetail(c)) {
    name.append(el('span', 'ocx-deps__spacer'), el('span', '', c.name));
    return [tr];
  }

  const parts = collapsibleParts(id);
  tr.className = 'ocx-deps__expandable';
  set(tr, parts.root);
  Object.assign(tr.dataset, { zagRoot: 'collapsible', zagState: 'idle', zagId: id, zagProps: '{}' });
  const button = el('button', 'ocx-deps__toggle');
  set(button, parts.trigger);
  const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  chevron.setAttribute('viewBox', '0 0 12 12');
  chevron.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M4 2.5L7.5 6L4 9.5');
  chevron.append(path);
  button.append(chevron, el('span', '', c.name));
  name.append(button);

  const detail = el('tr', 'ocx-deps__detail');
  set(detail, parts.content);
  const td = el('td');
  td.colSpan = 4;
  detail.append(td);
  // Filled on the first open only: a closed detail costs two elements, not a dozen per row.
  tr.addEventListener(
    'ocx:collapsible:change',
    () => {
      if (c.description) td.append(el('div', 'ocx-deps__desc', c.description));
      if (c.author) td.append(el('div', 'ocx-deps__author', `By ${c.author}`));
      // Narrow screens hide the License/Links columns; the detail repeats them.
      const narrow = el('div', 'ocx-deps__narrow');
      if (c.license) narrow.append(el('div', 'ocx-deps__license', `License: ${c.license}`));
      const detailLinks = links(c, 'ocx-deps__links');
      if (detailLinks) narrow.append(detailLinks);
      td.append(narrow);
    },
    { once: true },
  );
  handles.push(mount(tr, { load: loadCollapsible }));
  return [tr, detail];
}

/**
 * Wires the explorer in `root` once and loads it: from `root.dataset.src` on mount, again on
 * `ocx:deps:load` (C-222), whose optional `detail.data` is the dependency JSON or a promise of it.
 * @param {HTMLElement} root
 * @returns {Promise<void>} the first load
 */
export function mountExplorer(root) {
  const q = /** @param {string} s */ (s) => /** @type {HTMLElement} */ (root.querySelector(s));
  const error = q('.ocx-deps__error');
  const body = q('.ocx-deps__body');
  const search = /** @type {HTMLInputElement} */ (q('input[type="search"]'));
  const select = /** @type {HTMLSelectElement} */ (q('select'));
  const count = q('.ocx-deps__count');
  const table = q('table');
  const tbody = q('tbody');
  const empty = q('.ocx-deps__empty');
  const values = [...root.querySelectorAll('.ocx-deps__stat-value')];
  const doc = root.ownerDocument;
  if (!doc.getElementById('ocx-deps-css')) {
    const style = doc.createElement('style');
    style.id = 'ocx-deps-css';
    style.textContent = css;
    doc.head.append(style);
  }

  // The server-rendered loading state, restored before every reload.
  const pristine = /** @type {[Element, Node[]][]} */ (
    [...values, count, tbody].map((node) => [node, [...node.childNodes].map((n) => n.cloneNode(true))])
  );
  const emptyReserved = !empty.hidden;
  /** @type {DependencyComponent[]} */
  let components = [];
  let total = 0;
  /** @type {Map<DependencyComponent, HTMLTableRowElement[]>} */
  let rows = new Map();
  /** @type {import('./ui/zag.mjs').MountHandle[]} */
  const handles = [];
  let latest = 0;

  // Filtering hides rows rather than detaching them: a row machine finds its parts by id in the
  // document (collapsible.zag.mjs), so a row detached while its machine loads would never wire up.
  const apply = () => {
    // While loading, the rows are stale and the count line is the Loader: the swap applies filters.
    if (table.hasAttribute('aria-busy')) return;
    const shown = new Set(filterComponents(components, search.value, select.value));
    for (const [c, [tr]] of rows) if (tr) tr.hidden = !shown.has(c);
    count.textContent = `Showing ${shown.size} of ${total} components`;
    empty.hidden = shown.size > 0;
  };
  search.addEventListener('input', apply);
  select.addEventListener('change', apply);

  // A click anywhere on an expandable row toggles it (the Vue row @click) through its trigger;
  // clicks on the trigger itself or a link are theirs.
  tbody.addEventListener('click', (e) => {
    const target = /** @type {Element} */ (e.target);
    if (target.closest('a, button')) return;
    /** @type {HTMLElement | null | undefined} */ (target.closest('tr')?.querySelector('.ocx-deps__toggle'))?.click();
  });

  /** @param {unknown} [source] the dependency JSON or a promise of it; default: fetch `data-src` */
  const load = async (source) => {
    // A newer load wins: an older one that settles later renders nothing.
    const run = ++latest;
    for (const handle of handles.splice(0)) handle.destroy();
    for (const [node, kids] of pristine) node.replaceChildren(...kids.map((n) => n.cloneNode(true)));
    table.setAttribute('aria-busy', 'true');
    empty.hidden = !emptyReserved;
    error.hidden = true;
    body.hidden = false;
    try {
      const json = await Promise.resolve(source ?? fetchData(root.dataset['src'] ?? ''));
      if (run !== latest) return;
      // ponytail: a shallow shape check on our own generated file; rendering is what is hardened.
      if (
        typeof json !== 'object' ||
        json === null ||
        typeof (/** @type {{ binaries?: unknown }} */ (json).binaries) !== 'object'
      )
        throw new Error('malformed dependency data');
      const data = /** @type {DependencyData} */ (json);
      const binary = firstBinary(data);
      if (!binary) throw new Error('no binary in the data');

      const [totalEl, licensesEl, generatedEl] = values;
      if (totalEl) totalEl.textContent = String(binary.summary.total);
      if (licensesEl) licensesEl.textContent = String(binary.summary.uniqueLicenses);
      if (generatedEl) generatedEl.textContent = data.generated;
      // Licences go into the Select's native <select>; its listbox follows (C-161, `data-meta` =
      // count). A reload adds only licences the select lacks: the list never drops a row.
      const known = new Set([...select.options].map((o) => o.value));
      for (const [lic, n] of licenseOptions(binary.summary.licenses)) {
        if (known.has(lic)) continue;
        const option = new Option(lic, lic);
        option.dataset['meta'] = String(n);
        select.append(option);
      }

      // Rows are built once per load and only hidden by a filter, so expanded state survives filtering.
      const prefix = `ocx-deps-${++loads}`;
      const built = new Map(binary.components.map((c, i) => [c, renderRows(c, `${prefix}-${i}`, handles)]));
      components = binary.components;
      total = binary.summary.total;
      rows = built;

      // Load the weights/families the table uses before showing it: a web-font swap
      // after it appears would resize rows and shift the page (CLS).
      // First family only: a failing local() fallback face (e.g. no Arial on Linux) rejects the whole load.
      const fonts = new Set(
        [...root.querySelectorAll('.ocx-deps__stat-value, .ocx-deps__stat-label, th, td')].map((node) => {
          const cs = getComputedStyle(node);
          return `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily.split(',')[0] ?? ''}`;
        }),
      );
      await Promise.allSettled([...fonts].map((font) => document.fonts.load(font)));
      if (run !== latest) return;
      // Swap in one step: the placeholder rows hold the room until the rows (or the empty state) replace them.
      tbody.replaceChildren(...[...rows.values()].flat());
      table.removeAttribute('aria-busy');
      apply();
    } catch (e) {
      if (run !== latest) return;
      // Anything above — fetch, shape check, or a render step tripped by a valid-but-misshapen
      // JSON (e.g. a binary missing summary.licenses/components) — surfaces as the error banner,
      // never a spinner stuck forever.
      q('.ocx-deps__error-msg').textContent =
        `Failed to load dependencies: ${e instanceof Error ? e.message : String(e)}`;
      body.hidden = true;
      error.hidden = false;
    }
  };
  root.addEventListener(
    'ocx:deps:load',
    (e) => void load(/** @type {CustomEvent<{ data?: unknown } | null>} */ (e).detail?.data),
  );
  return load();
}

/**
 * @param {string} src
 * @returns {Promise<unknown>}
 */
async function fetchData(src) {
  const res = await fetch(src, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
