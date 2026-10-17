/**
 * Spreads root, trigger and content. Parts are found by their Zag ids, so a wrapper may nest the
 * trigger (a heading, a row) and a collapsible nested in the content keeps its own parts.
 * @param {import('@zag-js/collapsible').Api} api
 * @param {HTMLElement} root
 * @param {import('./ui/zag.mjs').Spread} spread
 */
export function render(api: import("@zag-js/collapsible").Api, root: HTMLElement, spread: import("./ui/zag.mjs").Spread): void;
/**
 * Machine callbacks for this root (C-105): `ocx:collapsible:change {open}`.
 * @param {HTMLElement} root
 * @returns {Record<string, unknown>}
 */
export function readDom(root: HTMLElement): Record<string, unknown>;
import { connect } from '@zag-js/collapsible';
import { machine } from '@zag-js/collapsible';
export { connect, machine };
