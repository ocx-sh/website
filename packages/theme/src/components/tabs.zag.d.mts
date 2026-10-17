/**
 * Spreads the live api onto the parts; a changed value emits `ocx:tabs:change {value}` and,
 * under a `data-sync-key`, selects the same label in every group with that key (C-151).
 * @param {import('@zag-js/tabs').Api} api
 * @param {HTMLElement} root
 * @param {import('./ui/zag.mjs').Spread} spread
 */
export function render(api: import("@zag-js/tabs").Api, root: HTMLElement, spread: import("./ui/zag.mjs").Spread): void;
/**
 * The tab selected in the DOM before start (restored or synced while idle).
 * @param {HTMLElement} root
 * @returns {Record<string, unknown>}
 */
export function readDom(root: HTMLElement): Record<string, unknown>;
/**
 * Selects the tab labelled `label` by rewriting the SSR attributes. Self-contained, with no
 * comment in its body: the restore script inlines its source (C-151).
 * @param {HTMLElement} root
 * @param {string | null | undefined} label
 * @returns {boolean} whether the selection changed
 */
export function selectTab(root: HTMLElement, label: string | null | undefined): boolean;
export { connect, machine } from "@zag-js/tabs";
