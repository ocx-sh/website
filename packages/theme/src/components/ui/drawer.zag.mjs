// Drawer behaviour (C-173) on Zag `drawer`: the dialog contract plus swipe to close. Loaded
// lazily by Drawer.astro through `mount`; SSR renders the same `parts`. Self-contained so the
// mobile menu (Z12) can follow the same shape.
import { connect, machine } from '@zag-js/drawer';
import { emit } from './zag-runtime.mjs';

export { connect, machine };

/**
 * Every part's attributes, shared by SSR and `render` (C-130a). The content is always named by
 * its title: Zag only links the title once it has seen it live.
 * @param {import('@zag-js/drawer').Api} api
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
 * @param {import('@zag-js/drawer').Api} api
 * @param {HTMLElement} root
 * @param {import('./zag.mjs').Spread} spread
 */
export function render(api, root, spread) {
  const all = parts(api);
  for (const attrs of Object.values(all)) {
    const el = root.ownerDocument.getElementById(String(attrs.id));
    if (el) spread(el, attrs);
  }
  // Zag waits in `closing` for the framework adapters' presence `exitcomplete`; vanilla has no
  // presence and the content is already hidden, so finish the close ourselves. Deferred, so the
  // machine's exit tracker is listening before the event arrives.
  // ponytail: no exit animation; add one here by waiting for `animationend` before dispatching.
  if (!api.open && !all.positioner.hidden) {
    const content = root.ownerDocument.getElementById(String(all.content.id));
    setTimeout(() => content?.dispatchEvent(new Event('exitcomplete')));
  }
}

/** Callbacks surface as DOM events (C-105); the only per-root hook `mount` offers. @param {HTMLElement} root */
export const readDom = (root) => {
  // Rendered open; own content only (a nested component has its own `data-zag-root`). Inline: a lazy module may not import zag.mjs.
  let last = [...root.querySelectorAll('[data-part="content"]:not([hidden])')].some(
    (c) => c.closest('[data-zag-root]') === root,
  );
  return {
    // Zag's drawer reports a close twice on Escape (close, then again while closing): emit changes only.
    onOpenChange: (/** @type {{ open: boolean }} */ { open }) => {
      if (open !== last) emit(root, 'drawer', 'change', { open });
      last = open;
    },
  };
};
