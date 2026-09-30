// Zag `accordion` for Accordion.astro + AccordionItem.astro (C-141). Loaded by `mount` on the
// root's first interaction; SSR renders the same parts through `ssrApi`.
import { connect, machine } from '@zag-js/accordion';
import { emit } from './ui/zag-runtime.mjs';

export { connect, machine };

/**
 * Spreads the root and each of its own items (trigger, content). An item's value is the tail of
 * its Zag id (`accordion:<id>:item:<value>`), so an accordion nested in a panel keeps its items.
 * @param {import('@zag-js/accordion').Api} api
 * @param {HTMLElement} root
 * @param {import('./ui/zag.mjs').Spread} spread
 */
export function render(api, root, spread) {
  spread(root, api.getRootProps());
  const keepOne = root.hasAttribute('data-keep-one');
  const prefix = `accordion:${root.dataset['zagId'] ?? ''}:item:`;
  const doc = root.ownerDocument;
  for (const item of root.querySelectorAll('[data-scope="accordion"][data-part="item"]')) {
    if (!item.id.startsWith(prefix)) continue;
    const value = { value: item.id.slice(prefix.length) };
    spread(item, api.getItemProps(value));
    const trigger = api.getItemTriggerProps(value);
    const content = api.getItemContentProps(value);
    const triggerEl = doc.getElementById(String(trigger['id']));
    const contentEl = doc.getElementById(String(content['id']));
    if (triggerEl) {
      spread(triggerEl, { ...trigger, ...focusFirst(api, trigger) });
      if (locked(api, keepOne, value)) triggerEl.setAttribute('aria-disabled', 'true');
      else triggerEl.removeAttribute('aria-disabled');
    }
    if (contentEl) spread(contentEl, content);
  }
}

/**
 * APG: the open item of an accordion that keeps one open (single mode, not collapsible: the root
 * carries `data-keep-one`) has its trigger marked aria-disabled — selecting it does nothing. Zag
 * leaves this to us. Shared by SSR.
 * @param {{ value: string[] }} api
 * @param {boolean} keepOne
 * @param {{ value: string }} item
 * @returns {boolean}
 */
export function locked(api, keepOne, item) {
  return keepOne && api.value.includes(item.value);
}

/**
 * The machine acts on clicks and keys only while an item is focused. A trigger focused before the
 * machine started (the hover/focus that loaded it, then the replayed click or key) never sent its
 * focus, so send it first. A no-op once any item is focused.
 * @param {import('@zag-js/accordion').Api} api
 * @param {Record<string, unknown>} trigger normalized trigger props (lower-case `on*` keys)
 */
function focusFirst(api, trigger) {
  const onFocus = /** @type {(e?: Event) => void} */ (trigger['onfocusin']);
  /** @param {unknown} handler */
  const wrap = (handler) => (/** @type {Event} */ event) => {
    if (api.focusedValue == null) onFocus(event);
    /** @type {(e: Event) => void} */ (handler)(event);
  };
  return { onclick: wrap(trigger['onclick']), onkeydown: wrap(trigger['onkeydown']) };
}

/**
 * Machine callbacks for this root (C-105): `ocx:accordion:change {value}`.
 * @param {HTMLElement} root
 * @returns {Record<string, unknown>}
 */
export function readDom(root) {
  return {
    /** @param {import('@zag-js/accordion').ValueChangeDetails} details */
    onValueChange: ({ value }) => emit(root, 'accordion', 'change', { value }),
  };
}
