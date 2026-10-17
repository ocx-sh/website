/**
 * Spreads the live parts, shows or hides each Content popover with the machine's value, and
 * starts the rail on the first paint.
 * @param {import('@zag-js/navigation-menu').Api} api
 * @param {HTMLElement} root
 * @param {import('./ui/zag.mjs').Spread} spread
 * @param {import('./ui/zag.mjs').Spawn} spawn
 */
export function render(api: import("@zag-js/navigation-menu").Api, root: HTMLElement, spread: import("./ui/zag.mjs").Spread, spawn: import("./ui/zag.mjs").Spawn): void;
/**
 * Machine props only the page knows: the stable content ids, a panel the mobile menu opened
 * before start, and the change callback (C-105).
 * @param {HTMLElement} root
 * @returns {Record<string, unknown>}
 */
export function readDom(root: HTMLElement): Record<string, unknown>;
/** Machine id of the header nav (one header per page). */
export const NAV_ID: "ocx-nav";
/** Machine id of the ecosystem hub rail (`tabs`). */
export const RAIL_ID: "ocx-hubs";
export namespace ids {
    function content(value: string): string;
}
export function parts(api: import("@zag-js/navigation-menu").Api): {
    root: {
        [k: string]: unknown;
    };
    list: {
        [x: string]: any;
    };
    item: (value: string) => {
        [x: string]: any;
    };
    link: (value: string, current: boolean) => {
        [x: string]: any;
    };
    trigger: (value: string, { ssr }?: {
        ssr?: boolean | undefined;
    }) => {
        [x: string]: any;
    };
    content: (value: string) => {
        [k: string]: unknown;
    };
};
export function lean(attrs: Record<string, unknown>, { nav }?: {
    nav?: boolean;
}): {
    [k: string]: unknown;
};
import { connect } from '@zag-js/navigation-menu';
import { machine } from '@zag-js/navigation-menu';
export { connect, machine };
