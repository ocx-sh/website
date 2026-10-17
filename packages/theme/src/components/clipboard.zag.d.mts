/**
 * Trigger props, named after the label when there is one: a page with several buttons would
 * otherwise read "Copy to clipboard" for each. Shared by SSR and `render` (C-130a).
 * @param {clipboard.Api} api
 * @param {string | undefined} label
 */
export function triggerProps(api: clipboard.Api, label: string | undefined): {
    [x: string]: any;
};
/**
 * @param {clipboard.Api} api
 * @param {HTMLElement} root
 * @param {import('./ui/zag.mjs').Spread} spread
 */
export function render(api: clipboard.Api, root: HTMLElement, spread: import("./ui/zag.mjs").Spread): void;
/** @type {clipboard.Machine} */
export const machine: clipboard.Machine;
/** @type {typeof clipboard.connect} */
export const connect: typeof clipboard.connect;
import * as clipboard from '@zag-js/clipboard';
