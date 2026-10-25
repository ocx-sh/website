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
/**
 * The header's section links as one flat list for the mobile menu: link sections, a label-only entry
 * for the ecosystem menu followed by its hubs, then the install action.
 */
export function sectionLinks(
  nav: Nav,
  pathname: string,
): { label: string; hint?: string; href?: string; current?: boolean }[];
/**
 * The one current link among a neutral-mode header's hrefs: the longest matching prefix, else `undefined`.
 */
export function currentHref(
  pathname: string,
  links: readonly (string | { href: string; match?: 'prefix' })[],
  base?: string,
): string | undefined;
/** Whether a link leaves the site: an absolute http(s) or protocol-relative URL. */
export function isExternal(href: string): boolean;
/** The install guide's root-relative URL on ocx.sh (the header's install action). */
export function installHref(nav: Nav): string;
/** The catalog's root-relative URL, or with `pkg` (`<namespace>/<name>`, no registry, no tag) that package's page. */
export function catalogHref(nav: Nav, pkg?: string): string;
