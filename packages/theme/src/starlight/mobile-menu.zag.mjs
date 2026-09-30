// Mobile menu (C-231, D-Z6) on Zag `drawer`: MobileMenuToggle.astro's button is the trigger and
// Starlight's sidebar pane `#starlight__sidebar` (PageFrame, unchanged) is the content. Loaded by
// the toggle's first tap (manual trigger; Search.astro's every-page script mounts it). The machine
// is drawer.zag.mjs's, so the two share one chunk.
//
// The pane stays a popover: JS off or a load error, the toggle's `popovertarget` opens it natively
// (Starlight's path). Live, the machine shows it as a `manual` popover while it holds it open (its
// own dismissal only) and returns it to `auto` at rest, so everything keyed on `:popover-open` holds
// in both paths: Starlight's `inert` main frame (PageFrame's `toggle` listener), the scroll lock and
// the toggle's icon (starlight.css). Non-modal on purpose (Spec Delta C-231): Zag's modal traps focus
// in the pane, blocks pointer events outside it and aria-hides the rest, but the ecosystem menu
// (C-232), opened from inside the pane, lives in the header.
import { connect, machine } from '../components/ui/drawer.zag.mjs';
import { emit } from '../components/ui/zag-runtime.mjs';

export { connect, machine };

/** Starlight's pane (PageFrame): the drawer's content, id kept (D-Z4). */
export const PANE = 'starlight__sidebar';

/** @param {Record<string, unknown>} props @param {string[]} keys */
const pick = (props, ...keys) => Object.fromEntries(Object.entries(props).filter(([k]) => keys.includes(k)));

/**
 * Every part's attributes, shared by SSR and `render` (C-130a). The pane never gets `hidden` (the
 * popover shows and hides it, and at ≥ 50em it is the static column) and is a dialog, named by the
 * toggle, only while open.
 * @param {import('@zag-js/drawer').Api} api
 * @returns {Record<'trigger' | 'backdrop' | 'content', Record<string, unknown>>}
 */
export function parts(api) {
  /** @type {Record<string, unknown>} */ const trigger = api.getTriggerProps();
  /** @type {Record<string, unknown>} */ const all = api.getContentProps();
  const { hidden, role, 'aria-modal': modal, ...content } = all;
  void hidden;
  void modal;
  return {
    trigger,
    backdrop: api.getBackdropProps(),
    content: api.open ? { ...content, role, 'aria-labelledby': trigger['id'] } : content,
  };
}

/**
 * Attributes SSR keeps of a part: what JS off and first paint read; the machine spreads the rest on
 * start. Every page pays for these bytes (htmlGz). The trigger's expanded state is left to its
 * `popovertarget` invoker until the machine owns it (as the header's, C-192).
 * @param {'trigger' | 'backdrop'} part
 * @param {Record<string, unknown>} attrs
 * @returns {Record<string, unknown>}
 */
export function lean(part, attrs) {
  return part === 'trigger' ? pick(attrs, 'type', 'aria-controls') : pick(attrs, 'id', 'hidden');
}

/**
 * Spreads the live parts and shows or hides the pane with the machine's state (ZagModule['render']).
 * @param {import('@zag-js/drawer').Api} api
 * @param {HTMLElement} root
 * @param {import('../components/ui/zag.mjs').Spread} spread
 */
export function render(api, root, spread) {
  const doc = root.ownerDocument;
  const p = parts(api);
  const button = root.querySelector('button');
  if (button) spread(button, p.trigger);
  const backdrop = doc.getElementById(String(p.backdrop['id']));
  if (backdrop) spread(backdrop, p.backdrop);
  const pane = doc.getElementById(PANE);
  if (!pane) return;
  spread(pane, {
    ...p.content,
    // A native close (Starlight drops `popover` at ≥ 50em, which hides it) tells the machine.
    ontoggle: (/** @type {ToggleEvent} */ e) => {
      if (e.newState === 'closed' && api.open) api.setOpen(false);
    },
  });
  const shown = pane.matches(':popover-open');
  // At ≥ 50em Starlight's element has dropped `popover` (the static column): never re-show it there;
  // its `toggle` closes the machine.
  if (api.open && !shown && pane.popover !== null) {
    pane.popover = 'manual';
    pane.showPopover();
  } else if (!api.open) {
    if (shown) pane.hidePopover();
    if (pane.popover === 'manual') pane.popover = 'auto';
  }
  // Zag waits in `closing` for an adapter's presence `exitcomplete`; vanilla has none (as drawer.zag.mjs).
  if (!api.open && !api.getPositionerProps().hidden) setTimeout(() => pane.dispatchEvent(new Event('exitcomplete')));
}

/**
 * Machine props only the page knows (ZagModule['readDom']): the pane's id, the guards that keep a
 * native popover opened over the pane (the ecosystem menu) usable, focus return, and the change
 * callback `ocx:mobile-menu:change {open}` (C-105).
 * @param {HTMLElement} root
 * @returns {Record<string, unknown>}
 */
export function readDom(root) {
  const doc = root.ownerDocument;
  /** The topmost popover open over the pane, if any: a native (`auto`) one or a nav panel the header
   * machine opened on hover (`manual`). */
  const over = () => [...doc.querySelectorAll('[popover]:popover-open')].filter((el) => el.id !== PANE).pop();
  let last = false; // Zag reports a close twice on Escape (close, then again while closing)
  return {
    ids: { content: PANE },
    // Esc closes that popover first and spares the pane (as when both were native popovers).
    onEscapeKeyDown: (/** @type {KeyboardEvent} */ event) => {
      const el = over();
      if (!(el instanceof HTMLElement)) return;
      event.preventDefault();
      el.hidePopover();
    },
    // Clicks and focus inside that popover are not outside the drawer (Zag fires on the pane and
    // names the real target in `detail`).
    onInteractOutside: (/** @type {CustomEvent<{ target?: unknown }>} */ event) => {
      const target = event.detail?.target;
      if (target instanceof Element && target.closest(`[popover]:popover-open:not(#${PANE})`)) event.preventDefault();
    },
    onOpenChange: (/** @type {{ open: boolean }} */ { open }) => {
      if (open === last) return;
      last = open;
      emit(root, 'mobile-menu', 'change', { open });
      if (open) return;
      // Non-modal Zag restores no focus: return it to the toggle unless the reader moved it elsewhere.
      setTimeout(() => {
        const active = doc.activeElement;
        if (!active || active === doc.body || doc.getElementById(PANE)?.contains(active))
          root.querySelector('button')?.focus();
      });
    },
  };
}
