/**
 * @param {import('@zag-js/checkbox').Api | import('@zag-js/switch').Api} api
 * @param {HTMLElement} root
 * @param {import('./zag.mjs').Spread} spread
 */
export function render(api: import("@zag-js/checkbox").Api | import("@zag-js/switch").Api, root: HTMLElement, spread: import("./zag.mjs").Spread): void;
export function readDom(scope: "checkbox" | "switch"): NonNullable<import("./zag.mjs").ZagModule["readDom"]>;
