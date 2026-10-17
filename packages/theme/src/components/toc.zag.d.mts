/**
 * Spreads the api onto the SSR items and links, the only parts that change: root, title and list
 * carry ids alone (the root's rect vars feed an indicator part this Toc does not render).
 * ponytail: spread root/title/list too if an indicator part is ever added.
 * @param {Api} api
 * @param {HTMLElement} root
 * @param {(el: Element, attrs: Record<string, unknown>) => void} spread
 */
export function render(api: Api, root: HTMLElement, spread: (el: Element, attrs: Record<string, unknown>) => void): void;
/**
 * The items as SSR wrote them (no JSON copy in the page). No `onActiveChange`: `watchTail` emits.
 * @param {HTMLElement} root
 * @returns {Partial<import('@zag-js/toc').Props>}
 */
export function readDom(root: HTMLElement): Partial<import("@zag-js/toc").Props>;
export type Api = import("@zag-js/toc").Api;
import { connect } from '@zag-js/toc';
import { machine } from '@zag-js/toc';
export { connect, machine };
