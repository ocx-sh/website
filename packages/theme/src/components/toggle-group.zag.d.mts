/**
 * Spreads the live api onto the root and items; a changed value emits
 * `ocx:<scope>:change {value}` (the pressed values, in order), scope = the root's `data-zag-root`
 * (`toggle-group`, `tag-group`). A toggle-group root also takes `ocx:toggle-group:set {value}`: the
 * value moves with no change event (the idle half is ui/value-set.mjs).
 * @param {import('@zag-js/toggle-group').Api} api
 * @param {HTMLElement} root
 * @param {import('./ui/zag.mjs').Spread} spread
 */
export function render(api: import("@zag-js/toggle-group").Api, root: HTMLElement, spread: import("./ui/zag.mjs").Spread): void;
export { connect, machine } from "@zag-js/toggle-group";
