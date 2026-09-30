// Zag `collapsible` for Collapsible.astro (C-140) and Terminal's collapse (C-142). Loaded by
// `mount` on the root's first interaction; SSR renders the same parts through `ssrApi`.
import { connect, machine } from '@zag-js/collapsible';
import { emit } from './ui/zag-runtime.mjs';

export { connect, machine };

/**
 * Spreads root, trigger and content. Parts are found by their Zag ids, so a wrapper may nest the
 * trigger (a heading, a row) and a collapsible nested in the content keeps its own parts.
 * @param {import('@zag-js/collapsible').Api} api
 * @param {HTMLElement} root
 * @param {import('./ui/zag.mjs').Spread} spread
 */
export function render(api, root, spread) {
  spread(root, api.getRootProps());
  for (const part of [api.getTriggerProps(), api.getContentProps()]) {
    const el = root.ownerDocument.getElementById(String(part['id']));
    if (el) spread(el, part);
  }
}

/**
 * Machine callbacks for this root (C-105): `ocx:collapsible:change {open}`.
 * @param {HTMLElement} root
 * @returns {Record<string, unknown>}
 */
export function readDom(root) {
  return {
    /** @param {import('@zag-js/collapsible').OpenChangeDetails} details */
    onOpenChange: ({ open }) => emit(root, 'collapsible', 'change', { open }),
  };
}
