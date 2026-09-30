// Hint behaviour (C-174) on Zag `tooltip`: hover (after `openDelay`) or keyboard focus shows the
// hint; the wrapped button keeps its own accessible name. Loaded lazily by Hint.astro through
// `mount`; Zag positions the hint (D-Z10). Not the term `Tooltip.astro` (D-Z9).
import { connect, machine } from '@zag-js/tooltip';
import { emit } from './zag-runtime.mjs';

export { connect, machine };

/**
 * Every part's attributes, shared by SSR and `render` (C-130a).
 * @param {import('@zag-js/tooltip').Api} api
 * @returns {Record<'trigger' | 'positioner' | 'content', Record<string, unknown>>}
 */
export function parts(api) {
  return {
    trigger: api.getTriggerProps(),
    positioner: api.getPositionerProps(),
    content: api.getContentProps(),
  };
}

/** @type {WeakSet<HTMLElement>} */
const started = new WeakSet();

/**
 * Spreads every part's live attributes (ZagModule['render']).
 * @param {import('@zag-js/tooltip').Api} api
 * @param {HTMLElement} root
 * @param {import('./zag.mjs').Spread} spread
 */
export function render(api, root, spread) {
  const all = parts(api);
  for (const attrs of Object.values(all)) {
    const el = root.ownerDocument.getElementById(String(attrs.id));
    if (el) spread(el, attrs);
  }
  // The hover or keyboard focus that started the machine came before Zag listened: replay it once
  // (a hover as the pointer move Zag's open delay starts from).
  if (started.has(root)) return;
  started.add(root);
  const trigger = root.ownerDocument.getElementById(String(all.trigger.id));
  setTimeout(() => {
    if (trigger?.matches(':focus-visible')) api.setOpen(true);
    else if (trigger?.matches(':hover'))
      trigger.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'mouse', bubbles: true }));
  });
}

/** Callbacks surface as DOM events (C-105); the only per-root hook `mount` offers. @param {HTMLElement} root */
export const readDom = (root) => ({
  onOpenChange: (/** @type {{ open: boolean }} */ { open }) => emit(root, 'hint', 'change', { open }),
});
