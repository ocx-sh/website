// ActionMenu behaviour (C-171) on Zag `menu`: APG menu (arrow keys over an active descendant,
// Home/End, typeahead, Esc), optional context mode; Zag positions the panel (D-Z10). Loaded
// lazily by ActionMenu.astro through `mount`. Not the nav `Menu.astro` (D-Z8).
import { connect, machine } from '@zag-js/menu';
import { emit } from './zag-runtime.mjs';

export { connect, machine };

/** @typedef {{ value: string, disabled?: boolean | undefined }} Item */

/**
 * Every part's attributes, shared by SSR and `render` (C-130a). Only one of `trigger` and
 * `contextTrigger` is rendered.
 * @param {import('@zag-js/menu').Api} api
 * @param {readonly Item[]} items
 * @returns {Record<string, Record<string, unknown>>}
 */
export function parts(api, items) {
  const content = api.getContentProps();
  return {
    trigger: api.getTriggerProps(),
    contextTrigger: api.getContextTriggerProps(),
    positioner: api.getPositionerProps(),
    // A context menu is named by its `aria-label`, not by the region that opened it.
    content: content['aria-label'] ? { ...content, 'aria-labelledby': undefined } : content,
    ...Object.fromEntries(items.map((item) => [`item:${item.value}`, api.getItemProps(item)])),
  };
}

/** @type {WeakSet<HTMLElement>} */
const started = new WeakSet();

/**
 * Spreads every part's live attributes (ZagModule['render']).
 * @param {import('@zag-js/menu').Api} api
 * @param {HTMLElement} root
 * @param {import('./zag.mjs').Spread} spread
 */
export function render(api, root, spread) {
  const items = [...root.querySelectorAll('[data-part="item"]')].map((el) => ({
    value: el.getAttribute('data-value') ?? '',
    disabled: el.hasAttribute('data-disabled'),
  }));
  for (const attrs of Object.values(parts(api, items))) {
    const el = root.ownerDocument.getElementById(String(attrs.id));
    if (el) spread(el, attrs);
  }
  // The focus that started the machine came before Zag listened, and Zag's menu takes arrow keys
  // only on a trigger it saw focused. Tell it at the first key, which may be the early one `mount`
  // replays right after start (a capture listener on the target runs before Zag's own).
  if (started.has(root)) return;
  started.add(root);
  const trigger = root.ownerDocument.getElementById(String(api.getTriggerProps().id));
  const doc = root.ownerDocument;
  if (trigger === doc.activeElement)
    trigger?.addEventListener(
      'keydown',
      () => trigger === doc.activeElement && trigger.dispatchEvent(new FocusEvent('focusin')),
      { capture: true, once: true },
    );
}

/** Callbacks surface as DOM events (C-105); the only per-root hook `mount` offers. @param {HTMLElement} root */
export const readDom = (root) => ({
  onSelect: (/** @type {{ value: string }} */ { value }) => emit(root, 'menu', 'select', { value }),
  onOpenChange: (/** @type {{ open: boolean }} */ { open }) => emit(root, 'menu', 'change', { open }),
});
