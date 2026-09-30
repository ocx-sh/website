// Pagination on Zag `pagination` (C-202): prev/next plus numbered pages, as buttons or, with an
// `href` template on the wrapper, as links. Loaded by Pagination.astro through `mount` (D-Z17).
import { connect, machine } from '@zag-js/pagination';
import { emit } from './ui/zag-runtime.mjs';

export { connect, machine };

/**
 * `getPageUrl` for links mode: every `{page}` in the template becomes the page number.
 * @param {string} href e.g. `/releases/?page={page}`
 * @returns {(details: { page: number }) => string}
 */
export const pageUrl =
  (href) =>
  ({ page }) =>
    href.replaceAll('{page}', String(page));

/**
 * Prev/next trigger props. In links mode Zag leaves the disabled end as an `<a>` without `href`
 * (a generic element that may not carry `aria-label`), so it becomes a disabled link.
 * @param {Record<string, unknown>} attrs
 * @returns {Record<string, unknown>}
 */
export function trigger(attrs) {
  const disabledLink = attrs['type'] !== 'button' && attrs['href'] == null;
  return { ...attrs, role: disabledLink ? 'link' : undefined, 'aria-disabled': disabledLink ? 'true' : undefined };
}

/** @typedef {import('@zag-js/pagination').Api} Api */

/** @type {WeakMap<Element, Record<'item' | 'ellipsis', Element | undefined>>} each slot's two possible children */
const kinds = new WeakMap();

/**
 * Spreads the api onto the SSR markup: one visible `<li data-ocx-slot>` per `api.pages` entry.
 * A count change (`ocx:pagination:set`) resizes the window: missing slots are added after the
 * last one and surplus slots hidden, never removed, so elements are reused and the spreads the
 * glue keeps stay bounded at the 7-slot window. A slot swaps between a page and an ellipsis as the
 * window moves, reusing its two elements.
 * @param {Api} api
 * @param {HTMLElement} root
 * @param {(el: Element, attrs: Record<string, unknown>) => void} spread
 */
export function render(api, root, spread) {
  spread(root, api.getRootProps());
  const at = (/** @type {string} */ part) => root.querySelector(`[data-part="${part}"]`);
  const prev = at('prev-trigger');
  const next = at('next-trigger');
  if (prev) spread(prev, trigger(api.getPrevTriggerProps()));
  if (next) spread(next, trigger(api.getNextTriggerProps()));
  const link = root.dataset['ocxHref'] != null;
  const slots = /** @type {HTMLElement[]} */ ([...root.querySelectorAll('[data-ocx-slot]')]);
  while (slots.length < api.pages.length) {
    const slot = root.ownerDocument.createElement('li');
    slot.setAttribute('data-ocx-slot', '');
    (slots.at(-1) ?? prev?.parentElement)?.after(slot);
    slots.push(slot);
  }
  slots.forEach((slot, index) => {
    const hidden = index >= api.pages.length;
    if (slot.hidden !== hidden) slot.hidden = hidden;
  });
  api.pages.forEach((entry, index) => {
    const slot = slots[index];
    if (!slot) return;
    const kind = entry.type === 'page' ? 'item' : 'ellipsis';
    const own = kinds.get(slot) ?? { item: undefined, ellipsis: undefined };
    kinds.set(slot, own);
    const current = slot.firstElementChild;
    if (current?.getAttribute('data-part') === kind) own[kind] = current;
    let el = own[kind];
    if (!el) {
      el = root.ownerDocument.createElement(kind === 'ellipsis' ? 'span' : link ? 'a' : 'button');
      if (kind === 'ellipsis') el.textContent = '…';
      own[kind] = el;
    }
    if (el !== current) slot.replaceChildren(el);
    if (entry.type === 'page') {
      spread(el, api.getItemProps(entry));
      if (el.textContent !== String(entry.value)) el.textContent = String(entry.value);
    } else spread(el, api.getEllipsisProps({ index }));
  });
}

/**
 * Callbacks bound to this root, and the page URL builder of links mode. An owner that filters its
 * items (DataTable) resizes the page count with `ocx:pagination:set` `{ count }` on the root.
 * @param {HTMLElement} root
 * @param {(props: Record<string, unknown>) => void} [update]
 * @returns {Partial<import('@zag-js/pagination').Props>}
 */
export function readDom(root, update) {
  // ponytail: never removed; a restarted machine adds a second listener, harmless (same count twice).
  if (update)
    root.addEventListener('ocx:pagination:set', (event) => {
      const count = /** @type {CustomEvent<{ count?: unknown }>} */ (event).detail?.count;
      if (typeof count === 'number' && Number.isInteger(count) && count >= 0) update({ count });
    });
  const href = root.dataset['ocxHref'];
  return {
    onPageChange: (/** @type {{ page: number }} */ { page }) => emit(root, 'pagination', 'change', { page }),
    ...(href != null && { getPageUrl: pageUrl(href) }),
  };
}
