/**
 * Spreads the root and each of its own items (trigger, content). An item's value is the tail of
 * its Zag id (`accordion:<id>:item:<value>`), so an accordion nested in a panel keeps its items.
 * @param {import('@zag-js/accordion').Api} api
 * @param {HTMLElement} root
 * @param {import('./ui/zag.mjs').Spread} spread
 */
export function render(api: import("@zag-js/accordion").Api, root: HTMLElement, spread: import("./ui/zag.mjs").Spread): void;
/**
 * APG: the open item of an accordion that keeps one open (single mode, not collapsible: the root
 * carries `data-keep-one`) has its trigger marked aria-disabled — selecting it does nothing. Zag
 * leaves this to us. Shared by SSR.
 * @param {{ value: string[] }} api
 * @param {boolean} keepOne
 * @param {{ value: string }} item
 * @returns {boolean}
 */
export function locked(api: {
    value: string[];
}, keepOne: boolean, item: {
    value: string;
}): boolean;
/**
 * Machine callbacks for this root (C-105): `ocx:accordion:change {value}`.
 * @param {HTMLElement} root
 * @returns {Record<string, unknown>}
 */
export function readDom(root: HTMLElement): Record<string, unknown>;
import { connect } from '@zag-js/accordion';
import { machine } from '@zag-js/accordion';
export { connect, machine };
