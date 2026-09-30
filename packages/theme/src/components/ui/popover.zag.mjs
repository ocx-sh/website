// Popover behaviour (C-170) on Zag `popover`: Esc and outside click close and return focus;
// Zag positions the panel (D-Z10). Loaded lazily by Popover.astro through `mount`.
import { connect, machine } from '@zag-js/popover';
import { emit } from './zag-runtime.mjs';

export { connect, machine };

/**
 * Every part's attributes, shared by SSR and `render` (C-130a). The panel has no title part,
 * so its trigger names it.
 * @param {import('@zag-js/popover').Api} api
 * @returns {Record<'trigger' | 'positioner' | 'content', Record<string, unknown>>}
 */
export function parts(api) {
  /** @type {Record<string, unknown>} */ const trigger = api.getTriggerProps();
  /** @type {Record<string, unknown>} */ const content = api.getContentProps();
  return {
    trigger,
    positioner: api.getPositionerProps(),
    content: { ...content, 'aria-labelledby': trigger['id'] },
  };
}

/**
 * Spreads every part's live attributes (ZagModule['render']).
 * @param {import('@zag-js/popover').Api} api
 * @param {HTMLElement} root
 * @param {import('./zag.mjs').Spread} spread
 */
export function render(api, root, spread) {
  for (const attrs of Object.values(parts(api))) {
    const el = root.ownerDocument.getElementById(String(attrs.id));
    if (el) spread(el, attrs);
  }
}

/** Callbacks surface as DOM events (C-105); the only per-root hook `mount` offers. @param {HTMLElement} root */
export const readDom = (root) => ({
  onOpenChange: (/** @type {{ open: boolean }} */ { open }) => emit(root, 'popover', 'change', { open }),
});
