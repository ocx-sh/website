/** @typedef {import('./registry.mjs').Nav} Nav */
/**
 * Whether a neutral-mode link is current for a path: the home href (`/` or the base) matches exactly,
 * others by prefix; hrefs with a scheme (external) never match. Hrefs are used as given.
 * @param {string} pathname
 * @param {string} href
 * @param {string} [base]
 * @returns {boolean}
 */
export function isCurrent(pathname: string, href: string, base?: string): boolean;
/**
 * The header section a path belongs to: a link section's id, the id of the menu
 * section whose hub prefixes it, an internal action's id, else `''`.
 * @param {Nav} nav
 * @param {string} pathname
 * @returns {string}
 */
export function activeSection(nav: Nav, pathname: string): string;
/**
 * The header's section links as one flat list for the mobile menu: link sections, a label-only entry
 * for the ecosystem menu followed by its hubs, then the install action.
 * @param {Nav} nav
 * @param {string} pathname
 * @returns {{ label: string, href?: string, current?: boolean }[]}
 */
export function sectionLinks(nav: Nav, pathname: string): {
    label: string;
    href?: string;
    current?: boolean;
}[];
export * from "./registry.mjs";
export { PAGEFIND_VERSION } from "./check/pagefind.mjs";
export type Nav = import("./registry.mjs").Nav;
