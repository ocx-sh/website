/**
 * @param {import('@zag-js/radio-group').Api} api
 * @param {HTMLElement} root
 * @param {import('./zag.mjs').Spread} spread
 */
export function render(api: import("@zag-js/radio-group").Api, root: HTMLElement, spread: import("./zag.mjs").Spread): void;
/**
 * Machine props from the native radios, the source of truth (D-Z7): the one checked before
 * start (no replay) wins over the SSR value (S-110).
 * @type {NonNullable<import('./zag.mjs').ZagModule['readDom']>}
 */
export const readDom: NonNullable<import("./zag.mjs").ZagModule["readDom"]>;
import { connect } from '@zag-js/radio-group';
import { machine } from '@zag-js/radio-group';
export { connect, machine };
