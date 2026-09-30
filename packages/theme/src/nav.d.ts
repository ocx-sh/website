/** @typedef {import('./registry.mjs').Nav} Nav */
/**
 * The header section a path belongs to: a link section's id, the id of the menu
 * section whose hub prefixes it, an internal action's id, else `''`.
 * @param {Nav} nav
 * @param {string} pathname
 * @returns {string}
 */
export function activeSection(nav: Nav, pathname: string): string;
export * from './registry.mjs';
export { PAGEFIND_VERSION } from './check/pagefind.mjs';
export type Nav = import('./registry.mjs').Nav;
