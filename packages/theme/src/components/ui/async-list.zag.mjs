// Async List (C-251): the listbox of listbox.zag.mjs, fed by a Zag async-list child machine. The
// page is the data source: each load dispatches `ocx:list:fetch` on the root, whose handler calls
// `detail.respond(promise of { items, cursor? })`. Commands `ocx:list:filter {text}`, `ocx:list:sort
// {column, direction}` and `ocx:list:reload` reload from the first page; "Load more" follows the
// cursor; a failed load shows Retry. SSR renders the first page and its cursor (`data-ocx-async`).
// A load in flight is aborted by a newer one and by destroy (the machine's exit, patched below).
import { connect as asyncConnect, machine as asyncBase } from '@zag-js/async-list';
import { readDom as listboxReadDom, render as listboxRender, toCollection } from './listbox.zag.mjs';
import { emit } from './zag-runtime.mjs';

export { connect, machine } from './listbox.zag.mjs';

/** @typedef {import('./listbox.zag.mjs').ListItem} ListItem */
/** @typedef {import('@zag-js/async-list').Api<ListItem, string>} AsyncApi */

/**
 * `ocx:list:fetch` detail. Call `respond` synchronously in the listener (respondWith-style) with the
 * page or a promise of it: resolve → rows, reject → the error state. No synchronous `respond`, or
 * an answer without `items: [{ value, label }]`, is the error state too. The first answer wins.
 * @typedef {object} ListFetchDetail
 * @property {string | null} cursor null for the first page
 * @property {string} filter
 * @property {{ column: string, direction: 'ascending' | 'descending' } | null} sort
 * @property {AbortSignal | undefined} signal aborted by a newer load and by destroy
 * @property {(answer: ListPage | Promise<ListPage>) => void} respond
 */
/** @typedef {{ items: ListItem[], cursor?: string | undefined }} ListPage */
/** `ocx:list:filter` detail. @typedef {{ text: string }} ListFilterDetail */
/** `ocx:list:sort` detail. @typedef {{ column: string, direction?: 'ascending' | 'descending' }} ListSortDetail */

// ponytail: small changes over Zag's config, not a machine of our own. Zag 1.44's async-list starts
// every list without a cursor (so an SSR first page could never "load more") and stop() runs no state
// exit (so destroy left the fetch running). The exit also runs our `onStop` (clears the loading UI).
// Drop when Zag takes an initial cursor and aborts on stop.
/** @type {typeof asyncBase} */
export const asyncMachine = {
  ...asyncBase,
  exit: ({ prop }) => {
    const onStop = /** @type {(() => void) | undefined} */ (prop(/** @type {never} */ ('onStop')));
    onStop?.();
    return ['cancelFetch'];
  },
  context(params) {
    const initial = /** @type {string | undefined} */ (params.prop(/** @type {never} */ ('initialCursor')));
    const context = /** @type {NonNullable<typeof asyncBase.context>} */ (asyncBase.context)(params);
    return { ...context, cursor: params.bindable(() => ({ defaultValue: initial ?? null })) };
  },
};

/** @typedef {{ api: AsyncApi | undefined, items: ListItem[], loading: boolean }} Session */
/** Per run(): the async child's latest api, keyed by that session's `spread`. @type {WeakMap<Function, Session>} */
const sessions = new WeakMap();
/** @type {WeakMap<HTMLElement, (props: Record<string, unknown>) => void>} */
const updates = new WeakMap();

/** @param {unknown} i @returns {i is ListItem} */
const isItem = (i) => {
  const { value, label } = /** @type {Partial<Record<string, unknown>>} */ (i ?? {});
  return typeof value === 'string' && typeof label === 'string';
};

/**
 * Asks the page for a page of items through `ocx:list:fetch` (C-251).
 * @param {HTMLElement} root
 * @returns {import('@zag-js/async-list').Props<ListItem, string>['load']}
 */
const load =
  (root) =>
  ({ signal, cursor, filterText, sortDescriptor }) =>
    new Promise((resolve, reject) => {
      let answered = false;
      let late = false;
      /** @param {unknown} answer */
      const respond = (answer) => {
        // respondWith-style: the first synchronous answer wins.
        if (answered || late) return;
        answered = true;
        Promise.resolve(answer)
          .then((r) => {
            const page = /** @type {{ items?: unknown, cursor?: unknown } | null} */ (r);
            const items = /** @type {unknown} */ (page?.items);
            // A row without a string value and label would throw inside the listbox's render; a
            // repeated value would collapse two rows into one in sync().
            if (!Array.isArray(items) || !items.every(isItem))
              throw new TypeError('ocx:list:fetch answer needs items [{ value, label }]');
            if (new Set(items.map((i) => i.value)).size !== items.length)
              throw new TypeError('ocx:list:fetch answer has a duplicate item value');
            resolve({ items, cursor: typeof page?.cursor === 'string' ? page.cursor : undefined });
          })
          .catch(reject);
      };
      signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      /** @type {ListFetchDetail} */
      const detail = {
        cursor: cursor ?? null,
        filter: filterText,
        sort: sortDescriptor ? { column: String(sortDescriptor.column), direction: sortDescriptor.direction } : null,
        signal,
        respond,
      };
      root.dispatchEvent(new CustomEvent('ocx:list:fetch', { detail, bubbles: true }));
      late = true;
      if (!answered) reject(new Error('no ocx:list:fetch listener called respond() synchronously'));
    }).catch((/** @type {unknown} */ error) => {
      throw error instanceof Error ? error : new Error(String(error));
    });

/** A row for a loaded item: the built-in card row (a function slot renders SSR rows only). @param {ListItem} item */
function row({ value, label, description, meta }) {
  const el = document.createElement('div');
  el.setAttribute('data-part', 'item');
  el.setAttribute('data-value', value);
  const add = (/** @type {string} */ cls, /** @type {string} */ text) =>
    el.appendChild(Object.assign(document.createElement('span'), { className: cls, textContent: text }));
  add('', label).setAttribute('data-part', 'item-text');
  if (description) add('ocx-list__desc', description);
  if (meta) add('ocx-list__meta', meta);
  return el;
}

/**
 * Refreshes a kept row's text from its reloaded item (a slot row keeps its markup, gets the label).
 * @param {Element} el
 * @param {ListItem} item
 */
function fill(el, { label, description, meta }) {
  if (el.hasAttribute('data-label')) {
    el.setAttribute('data-label', label);
    return;
  }
  const text = el.querySelector('[data-part="item-text"]');
  if (text) text.textContent = label;
  for (const [cls, value] of /** @type {const} */ ([
    ['ocx-list__desc', description],
    ['ocx-list__meta', meta],
  ])) {
    const span = el.querySelector(`.${cls}`);
    if (!value) span?.remove();
    else if (span) span.textContent = value;
    else el.appendChild(Object.assign(document.createElement('span'), { className: cls, textContent: value }));
  }
}

/**
 * Makes the content's rows match `items` in order: kept rows move, new rows are built, the rest go.
 * ponytail: flat only; groups apply to SSR lists (loaded items ignore `group`).
 * @param {HTMLElement} content
 * @param {ListItem[]} items
 */
function sync(content, items) {
  const rows = new Map(
    [...content.querySelectorAll('[data-part="item"]')].map((el) => [el.getAttribute('data-value'), el]),
  );
  const next = items.map((item) => {
    const el = rows.get(item.value);
    if (el) fill(el, item);
    return el ?? row(item);
  });
  for (const el of rows.values()) if (!next.includes(el)) el.remove();
  content.append(...next);
}

/**
 * @param {HTMLElement} root
 * @param {import('./zag.mjs').Spawn} spawn
 */
function start(root, spawn) {
  const content = /** @type {HTMLElement} */ (root.querySelector('[data-part="content"]'));
  const columns = content.dataset['layout'] === 'grid' ? Number(content.style.getPropertyValue('--column-count')) : 0;
  const status = /** @type {HTMLElement} */ (root.querySelector('.ocx-list__status'));
  const more = /** @type {HTMLElement} */ (root.querySelector('.ocx-list__more'));
  const retry = /** @type {HTMLElement} */ (root.querySelector('.ocx-list__retry'));
  const initialItems = /** @type {ListItem[]} */ ([...listboxReadDom(root, () => {}).collection.items]);
  /** @type {Session} */
  const session = { api: undefined, items: initialItems, loading: false };
  spawn(
    asyncMachine,
    {
      id: `${root.dataset['zagId']}-data`,
      initialItems,
      initialCursor: root.dataset['ocxAsync'] || undefined,
      load: load(root),
      onError: (/** @type {{ error: Error }} */ { error }) => emit(root, 'list', 'error', { message: error.message }),
      onStop: () => {
        content.removeAttribute('aria-busy');
        status.textContent = '';
      },
    },
    asyncConnect,
    (/** @type {AsyncApi} */ api, /** @type {import('./zag.mjs').Spread} */ put) => {
      session.api = api;
      const failed = api.error != null && !api.loading;
      // Direct, not spread: the listbox owns the content's spread (one owner per element).
      if (api.loading) content.setAttribute('aria-busy', 'true');
      else content.removeAttribute('aria-busy');
      if (api.items !== session.items) {
        session.items = api.items;
        sync(content, api.items);
        updates.get(root)?.({ collection: toCollection(api.items, columns) });
      }
      if (session.loading && !api.loading && !failed)
        emit(root, 'list', 'load', { count: api.items.length, hasMore: api.hasMore });
      session.loading = api.loading;
      status.textContent = api.loading ? 'Loading…' : failed ? 'Could not load items.' : '';
      put(retry, { hidden: !failed, onClick: () => (api.hasMore ? api.loadMore() : api.reload()) });
      put(more, { hidden: !api.hasMore || api.loading || failed, onClick: () => api.loadMore() });
    },
  );
  return session;
}

/**
 * @param {import('@zag-js/listbox').Api} api
 * @param {HTMLElement} root
 * @param {import('./zag.mjs').Spread} spread
 * @param {import('./zag.mjs').Spawn} spawn
 */
export function render(api, root, spread, spawn) {
  const session = sessions.get(spread) ?? start(root, spawn);
  sessions.set(spread, session);
  /** @param {Event} e @returns {Record<string, unknown> | null} */
  const detail = (e) => {
    /** @type {unknown} */
    const d = /** @type {CustomEvent} */ (e).detail;
    return typeof d === 'object' ? /** @type {Record<string, unknown> | null} */ (d) : null;
  };
  listboxRender(api, root, (el, attrs) =>
    // The commands ride on the root's own spread: one owner per element, torn down with the session.
    spread(
      el,
      el !== root
        ? attrs
        : {
            ...attrs,
            'onocx:list:filter': (/** @type {Event} */ e) => {
              const text = detail(e)?.['text'];
              session.api?.setFilterText(typeof text === 'string' ? text : '');
            },
            'onocx:list:sort': (/** @type {Event} */ e) => {
              const { column, direction } = detail(e) ?? {};
              if (typeof column !== 'string') return;
              // Zag's `loading` state drops SORT: end the load in flight first.
              if (session.api?.loading) session.api.abort();
              session.api?.sort({
                column: /** @type {keyof ListItem} */ (column),
                direction: direction === 'descending' ? 'descending' : 'ascending',
              });
            },
            'onocx:list:reload': () => session.api?.reload(),
          },
    ),
  );
}

/**
 * The listbox's props, and `update` kept for the loaded collection.
 * @param {HTMLElement} root
 * @param {(props: Record<string, unknown>) => void} update
 */
export function readDom(root, update) {
  updates.set(root, update);
  return listboxReadDom(root, update);
}
