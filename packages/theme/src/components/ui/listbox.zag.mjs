// List on Zag listbox (C-250): APG listbox with an active descendant (the content is the one tab
// stop), arrows, Home/End, typeahead, single or multiple selection, a grid layout. SSR renders every
// row; this module only spreads the machine's props onto them. async-list.zag.mjs builds on it.
import { collection, connect, gridCollection, machine } from '@zag-js/listbox';
import { emit } from './zag-runtime.mjs';

export { connect, machine };

/**
 * One row of `List`'s `items`.
 * @typedef {object} ListItem
 * @property {string} value unique in the list
 * @property {string} label the row text, and what typeahead matches
 * @property {boolean} [disabled]
 * @property {string} [group] rows sharing a group render together under its label
 * @property {string} [description] second line of a card row
 * @property {string} [meta] right-aligned muted detail
 */

/**
 * The Zag collection over `items`, shared by SSR and the client; `columns` > 0 makes it a grid.
 * @param {ListItem[]} items
 * @param {number} [columns]
 */
export const toCollection = (items, columns = 0) =>
  columns > 0 ? gridCollection({ items, columnCount: columns }) : collection({ items });

/** @param {HTMLElement} root @param {string} name */
const part = (root, name) => /** @type {HTMLElement} */ (root.querySelector(`[data-part="${name}"]`));

/**
 * Spreads the api onto the SSR rows (and any a subclass appended), found by `data-value`.
 * @param {import('@zag-js/listbox').Api} api
 * @param {HTMLElement} root
 * @param {import('./zag.mjs').Spread} spread
 */
export function render(api, root, spread) {
  spread(root, api.getRootProps());
  spread(part(root, 'label'), api.getLabelProps());
  const content = part(root, 'content');
  spread(content, api.getContentProps());
  for (const group of root.querySelectorAll('[data-part="item-group"]')) {
    const id = /** @type {HTMLElement} */ (group).dataset['ocxGroup'] ?? '';
    spread(group, api.getItemGroupProps({ id }));
    if (group.firstElementChild) spread(group.firstElementChild, api.getItemGroupLabelProps({ htmlFor: id }));
  }
  const rows = new Map(
    [...content.querySelectorAll('[data-part="item"]')].map((el) => [el.getAttribute('data-value'), el]),
  );
  for (const item of /** @type {ListItem[]} */ (api.collection.items)) {
    const el = rows.get(item.value);
    if (!el) continue;
    spread(el, api.getItemProps({ item, highlightOnHover: true }));
    const text = el.querySelector('[data-part="item-text"]');
    if (text) spread(text, api.getItemTextProps({ item }));
  }
}

/** `{ [key]: text }` of `el`'s `selector` child, or nothing. @param {Element} el @param {string} key @param {string} selector */
const text = (el, key, selector) => {
  const found = el.querySelector(selector)?.textContent;
  return found ? { [key]: found } : {};
};

/**
 * The collection rebuilt from the SSR rows (no JSON copy in the page), and the change callback.
 * @param {HTMLElement} root
 * @param {(props: Record<string, unknown>) => void} _update
 */
export function readDom(root, _update) {
  const content = part(root, 'content');
  /** @type {ListItem[]} */
  const items = [...content.querySelectorAll('[data-part="item"]')].map((el) => ({
    value: el.getAttribute('data-value') ?? '',
    label: el.getAttribute('data-label') ?? el.querySelector('[data-part="item-text"]')?.textContent ?? '',
    ...(el.hasAttribute('data-disabled') && { disabled: true }),
    // Card-row text, so an async list's kept rows keep it (async-list.zag.mjs refreshes kept rows).
    ...text(el, 'description', '.ocx-list__desc'),
    ...text(el, 'meta', '.ocx-list__meta'),
  }));
  const columns = content.dataset['layout'] === 'grid' ? Number(content.style.getPropertyValue('--column-count')) : 0;
  return {
    collection: toCollection(items, columns),
    onValueChange: (/** @type {{ value: string[] }} */ { value }) => emit(root, 'list', 'change', { value }),
  };
}
