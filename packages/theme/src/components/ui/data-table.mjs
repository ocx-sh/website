// DataTable logic: `arrange` and `summary` are shared by the SSR (DataTable.astro renders the
// final first paint with them) and the client half, `bind`, which DataTable.astro's page script
// imports on first interaction. Sort and filter are plain DOM work, no Zag machine; paging drives
// the nested Zag Pagination through the `pager` the page script hands over (it owns `mount`).

/** @typedef {'ascending' | 'descending'} Direction */
/**
 * @typedef {object} View
 * @property {string} [key] column to sort by; none keeps the source order
 * @property {Direction} [direction] default `ascending`
 * @property {string} [query] case-insensitive substring over every cell
 * @property {number} [page] from 1, clamped into range
 * @property {number} [pageSize] rows per page; none shows every match
 */
/**
 * @typedef {object} Arranged
 * @property {number[]} order indices of the matching rows, in display order
 * @property {number[]} visible the slice of `order` on the current page
 * @property {number} page the clamped current page
 * @property {number} pages page count, at least 1
 */

// ponytail: one collator for text and numbers ("10" after "9"); signed or unit-suffixed numbers
// sort as text. Add a per-column sort value when a table needs them.
const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/**
 * Row order and page slice for a view. Sorting is stable, so ties keep the source order.
 * @param {Record<string, string>[]} rows cell text per column key
 * @param {View} view
 * @returns {Arranged}
 */
export function arrange(rows, { key, direction = 'ascending', query = '', page = 1, pageSize }) {
  const q = query.trim().toLocaleLowerCase();
  const order = rows
    .map((_, index) => index)
    .filter((index) => !q || Object.values(rows[index] ?? {}).some((text) => text.toLocaleLowerCase().includes(q)));
  if (key) {
    const sign = direction === 'descending' ? -1 : 1;
    order.sort((a, b) => sign * collator.compare(rows[a]?.[key] ?? '', rows[b]?.[key] ?? ''));
  }
  const size = pageSize && pageSize > 0 ? pageSize : Math.max(order.length, 1);
  const pages = Math.max(1, Math.ceil(order.length / size));
  const current = Math.min(Math.max(1, Math.trunc(page) || 1), pages);
  return { order, visible: order.slice((current - 1) * size, current * size), page: current, pages };
}

/**
 * The status line under the table.
 * @param {number} count matching rows
 * @param {number} total all rows
 * @returns {string}
 */
export function summary(count, total) {
  const rows = (/** @type {number} */ n) => `${n} ${n === 1 ? 'row' : 'rows'}`;
  return count === total ? rows(total) : `${count} of ${rows(total)}`;
}

/**
 * Paging hook from the page script: moves the nested Pagination to page 1 of `count` items.
 * @typedef {(count: number) => void} Pager
 */

/**
 * Makes the SSR table live: sort buttons, the filter field and pagination changes re-arrange the
 * existing rows in place. State lives on the root's `data-ocx-*` attributes, which the page script
 * also writes (`data-ocx-page`, from `ocx:pagination:change`) before this module loads.
 * @param {HTMLElement} root `[data-ocx-data-table]`
 * @param {Pager} [pager] absent when the table does not page
 */
export function bind(root, pager) {
  const d = root.dataset;
  const tbody = root.querySelector('tbody');
  if (!tbody) return;
  const trs = [...tbody.querySelectorAll('tr[data-ocx-row]')];
  const empty = tbody.querySelector('tr[data-ocx-empty]');
  const heads = [...root.querySelectorAll('th[data-ocx-key]')];
  const keys = heads.map((th) => th.getAttribute('data-ocx-key') ?? '');
  /** @type {Record<string, string>[]} */
  const rows = trs.map((tr) =>
    Object.fromEntries(
      keys.map((key, i) => [key, /** @type {HTMLTableRowElement} */ (tr).cells[i]?.textContent ?? '']),
    ),
  );
  const input = root.querySelector('input[data-ocx-filter]');
  const status = root.querySelector('[data-ocx-status]');
  const pagerBox = root.querySelector('[data-ocx-pager]');

  const apply = () => {
    const pageSize = Number(d['ocxPageSize']) || undefined;
    const view = arrange(rows, {
      ...(d['ocxSort'] && { key: d['ocxSort'] }),
      direction: d['ocxDirection'] === 'descending' ? 'descending' : 'ascending',
      query: input instanceof HTMLInputElement ? input.value : '',
      page: Number(d['ocxPage']) || 1,
      ...(pageSize && { pageSize }),
    });
    // Matches in display order, then the rest; only the page slice is visible. Moves only the
    // rows that are out of place.
    const shown = new Set(view.visible);
    const matched = new Set(view.order);
    [...view.order, ...[...trs.keys()].filter((i) => !matched.has(i))].forEach((index, at) => {
      const tr = /** @type {HTMLTableRowElement} */ (trs[index]);
      tr.hidden = !shown.has(index);
      if (tbody.children[at] !== tr) tbody.insertBefore(tr, tbody.children[at] ?? empty);
    });
    if (empty instanceof HTMLElement) empty.hidden = view.order.length > 0;
    for (const th of heads) {
      if (th.getAttribute('data-ocx-key') === d['ocxSort'])
        th.setAttribute('aria-sort', d['ocxDirection'] ?? 'ascending');
      else th.removeAttribute('aria-sort');
    }
    if (status) status.textContent = summary(view.order.length, trs.length);
    if (pagerBox instanceof HTMLElement) pagerBox.hidden = view.pages <= 1;
    return view.order.length;
  };

  /** Re-arranges from page 1 and moves the pagination there, with the new match count. */
  const restart = () => {
    d['ocxPage'] = '1';
    const count = apply();
    pager?.(count);
  };

  root.addEventListener('click', (event) => {
    const button = /** @type {Element | null} */ (event.target)?.closest?.('button[data-ocx-sort]');
    if (!button) return;
    const key = button.getAttribute('data-ocx-sort') ?? '';
    d['ocxDirection'] = d['ocxSort'] === key && d['ocxDirection'] !== 'descending' ? 'descending' : 'ascending';
    d['ocxSort'] = key;
    restart();
  });
  input?.addEventListener('input', restart);
  root.addEventListener('ocx:pagination:change', () => void apply());
  // A query typed before this module loaded: arrange for it now.
  if (input instanceof HTMLInputElement && input.value !== input.defaultValue) restart();
}
