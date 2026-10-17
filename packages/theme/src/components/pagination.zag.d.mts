/**
 * Prev/next trigger props. In links mode Zag leaves the disabled end as an `<a>` without `href`
 * (a generic element that may not carry `aria-label`), so it becomes a disabled link.
 * @param {Record<string, unknown>} attrs
 * @returns {Record<string, unknown>}
 */
export function trigger(attrs: Record<string, unknown>): Record<string, unknown>;
/**
 * Spreads the api onto the SSR markup: one visible `<li data-ocx-slot>` per `api.pages` entry.
 * A count change (`ocx:pagination:set`) resizes the window: missing slots are added after the
 * last one and surplus slots hidden, never removed, so elements are reused and the spreads the
 * glue keeps stay bounded at the 7-slot window. A slot swaps between a page and an ellipsis as the
 * window moves, reusing its two elements.
 * @param {Api} api
 * @param {HTMLElement} root
 * @param {(el: Element, attrs: Record<string, unknown>) => void} spread
 */
export function render(api: Api, root: HTMLElement, spread: (el: Element, attrs: Record<string, unknown>) => void): void;
/**
 * Callbacks bound to this root, and the page URL builder of links mode. An owner that filters its
 * items (DataTable) resizes the page count with `ocx:pagination:set` `{ count }` on the root.
 * @param {HTMLElement} root
 * @param {(props: Record<string, unknown>) => void} [update]
 * @returns {Partial<import('@zag-js/pagination').Props>}
 */
export function readDom(root: HTMLElement, update?: (props: Record<string, unknown>) => void): Partial<import("@zag-js/pagination").Props>;
export function pageUrl(href: string): (details: {
    page: number;
}) => string;
export type Api = import("@zag-js/pagination").Api;
import { connect } from '@zag-js/pagination';
import { machine } from '@zag-js/pagination';
export { connect, machine };
