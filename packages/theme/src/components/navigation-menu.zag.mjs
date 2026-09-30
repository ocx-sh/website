// Header section nav (C-190…C-192, D-Z1) on Zag `navigation-menu`: docs and catalog are Link
// items, ecosystem is an Item whose Content is the mega panel; its hub rail is a vertical Zag
// `tabs` (C-191), started here as a child machine. Header.astro renders every part from
// `ssrApi` + `parts` and loads this through `mount` on the first pointerenter/focusin on the nav.
// The Content stays a popover (top layer, JS-off fallback): the machine shows and hides it.
import { connect, machine } from '@zag-js/navigation-menu';
import * as tabs from './tabs.zag.mjs';
import { emit } from './ui/zag-runtime.mjs';

export { connect, machine };

/** Machine id of the header nav (one header per page). */
export const NAV_ID = 'ocx-nav';
/** Machine id of the ecosystem hub rail (`tabs`). */
export const RAIL_ID = 'ocx-hubs';
/** Content ids stay stable: the JS-off `popovertarget` and the mobile menu's trigger name them. */
export const ids = { content: (/** @type {string} */ value) => `ocx-${value}-menu` };

/** The nav's list: `ul`, one `li` item per section holding its link or trigger. */
const LIST = ':scope > nav > ul';
/** A section item's value is its `data-ocx-section` (on the link or trigger, as base.css reads it). */
const value = (/** @type {Element | null} */ el) => (el instanceof HTMLElement && el.dataset['ocxSection']) || '';

/** @param {Record<string, unknown>} props @param {string[]} keys */
const omit = (props, ...keys) => Object.fromEntries(Object.entries(props).filter(([k]) => !keys.includes(k)));

/**
 * Each part's attributes, shared by SSR and `render` (C-130a). Left out: the root's trigger
 * geometry style (no indicator or viewport part here), and the Content's `hidden` (the popover
 * shows it). SSR also leaves out the trigger's `aria-expanded`: until the machine owns the
 * trigger, its `popovertarget` does, and the browser reports that state (C-192).
 * @param {import('@zag-js/navigation-menu').Api} api
 */
export const parts = (api) => ({
  root: omit(api.getRootProps(), 'style'),
  list: api.getListProps(),
  item: (/** @type {string} */ value) => api.getItemProps({ value }),
  link: (/** @type {string} */ value, /** @type {boolean} */ current) => api.getLinkProps({ value, current }),
  trigger: (/** @type {string} */ value, { ssr = false } = {}) =>
    ssr ? omit(api.getTriggerProps({ value }), 'aria-expanded') : api.getTriggerProps({ value }),
  content: (/** @type {string} */ value) => omit(api.getContentProps({ value }), 'hidden'),
});

/**
 * SSR keeps what first paint, JS-off semantics and `render`'s own queries need (the rail's
 * `data-part`, `data-value`, `data-ownedby` for tabs.zag.mjs; the nav's parts are found by
 * structure); the machine spreads the rest on start. Every page pays for these bytes (htmlGz
 * budget), and each dropped one is a default (`dir`), unstyled, or read only by a live machine.
 * @param {Record<string, unknown>} attrs
 * @param {{ nav?: boolean }} [options] a nav part (not a rail part) also drops `data-part`, `data-value`,
 *   `data-ownedby`
 */
export const lean = (attrs, { nav = false } = {}) =>
  omit(
    attrs,
    'dir',
    'data-scope',
    'data-state',
    'data-orientation',
    'data-ssr',
    'data-uid',
    'data-trigger-proxy-id',
    'data-current',
    'style',
    ...(nav ? ['data-part', 'data-value', 'data-ownedby'] : []),
  );

/** @type {WeakMap<Element, boolean>} whether the machine had each Content open at its last paint */
const opened = new WeakMap();

/** Roots whose rail machine runs (reset by `readDom` when a new machine starts). */
const rails = new WeakSet();

/**
 * Spreads the live parts, shows or hides each Content popover with the machine's value, and
 * starts the rail on the first paint.
 * @param {import('@zag-js/navigation-menu').Api} api
 * @param {HTMLElement} root
 * @param {import('./ui/zag.mjs').Spread} spread
 * @param {import('./ui/zag.mjs').Spawn} spawn
 */
export function render(api, root, spread, spawn) {
  const p = parts(api);
  spread(root, p.root);
  const list = root.querySelector(LIST);
  if (list) spread(list, p.list);
  for (const item of root.querySelectorAll(`${LIST} > li`)) {
    const el = item.firstElementChild;
    const v = value(el);
    spread(item, p.item(v));
    if (!el) continue;
    if (el.localName === 'a') {
      spread(el, p.link(v, el.getAttribute('aria-current') === 'page'));
      continue;
    }
    spread(el, p.trigger(v));
    const content = root.ownerDocument.getElementById(ids.content(v));
    if (!content) continue;
    const open = api.value === v;
    spread(content, {
      ...p.content(v),
      // A native toggle (the mobile menu's own popovertarget) tells the machine.
      ontoggle: (/** @type {ToggleEvent} */ e) => {
        if ((e.newState === 'open') !== (api.value === v)) api.setValue(e.newState === 'open' ? v : '');
      },
    });
    // A panel the machine opens is `manual` (only the machine dismisses it: the popover's own light
    // dismiss would race its trigger click); at rest it is `auto` again, so a native open (the
    // mobile pane's trigger) nests it in the pane: clicks in it and the first Esc spare the pane.
    // It hides the panel only when its own value closes (a native open reaches it a task later).
    const was = opened.get(content);
    opened.set(content, open);
    if (open && !content.matches(':popover-open')) {
      content.popover = 'manual';
      content.showPopover();
    } else if (!open && was && content.matches(':popover-open')) content.hidePopover();
    if (!content.matches(':popover-open')) content.popover = 'auto';
  }

  if (rails.has(root)) return;
  rails.add(root);
  // The rail's tabs root inside the Content (the nav's own parts carry no data-part in SSR).
  const rail = root.querySelector(':scope > [popover] [data-part="root"]');
  if (rail instanceof HTMLElement)
    spawn(
      tabs.machine,
      { id: RAIL_ID, orientation: 'vertical', ...tabs.readDom(rail) },
      tabs.connect,
      (/** @type {import('@zag-js/tabs').Api} */ a, put) => tabs.render(a, rail, put),
    );
  // The hover that loaded the machine reached no Zag handler: hand it over once started.
  const hovered = root.querySelector(`${LIST} > li > button:hover`);
  if (hovered) queueMicrotask(() => hovered.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' })));
}

/**
 * Machine props only the page knows: the stable content ids, a panel the mobile menu opened
 * before start, and the change callback (C-105).
 * @param {HTMLElement} root
 * @returns {Record<string, unknown>}
 */
export function readDom(root) {
  rails.delete(root);
  const values = [...root.querySelectorAll(`${LIST} > li > button`)].map(value);
  const contents = values.map((v) => root.ownerDocument.getElementById(ids.content(v)));
  for (const content of contents) if (content) opened.delete(content);
  const open = values.find((_, i) => contents[i]?.matches(':popover-open'));
  return {
    ids,
    ...(open ? { defaultValue: open } : {}),
    onValueChange: (/** @type {{ value: string }} */ { value: v }) =>
      emit(root, 'navigation-menu', 'change', { value: v }),
  };
}
