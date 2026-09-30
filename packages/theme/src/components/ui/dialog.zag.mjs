// Dialog behaviour (C-172) on Zag `dialog`: focus trap, scroll lock, Esc, outside click,
// return focus. Loaded lazily by Dialog.astro through `mount`; SSR renders the same `parts`.
import { connect, machine } from '@zag-js/dialog';
import { emit } from './zag-runtime.mjs';

export { connect, machine };

/**
 * Every part's attributes, shared by SSR and `render` so the first paint is final (C-130a).
 * The content is always named by its title: Zag only links the title once it has seen it live.
 * @param {import('@zag-js/dialog').Api} api
 * @returns {Record<'trigger' | 'backdrop' | 'positioner' | 'content' | 'title' | 'description' | 'closeTrigger', Record<string, unknown>>}
 */
export function parts(api) {
  /** @type {Record<string, unknown>} */ const title = api.getTitleProps();
  /** @type {Record<string, unknown>} */ const content = api.getContentProps();
  return {
    trigger: api.getTriggerProps(),
    backdrop: api.getBackdropProps(),
    positioner: api.getPositionerProps(),
    content: { ...content, 'aria-labelledby': title['id'] },
    title,
    description: api.getDescriptionProps(),
    closeTrigger: { ...api.getCloseTriggerProps(), 'aria-label': 'Close' },
  };
}

/**
 * Spreads every part's live attributes (ZagModule['render']).
 * @param {import('@zag-js/dialog').Api} api
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
  onOpenChange: (/** @type {{ open: boolean }} */ { open }) => emit(root, 'dialog', 'change', { open }),
});
