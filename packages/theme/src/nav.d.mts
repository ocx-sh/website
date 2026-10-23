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
 * The one current link among a neutral-mode header's (or footer's) links: the longest matching prefix, so
 * `/` and `/docs/` are not both current on `/docs/x/` and `/docs/` beside `/docs/reference/` yields the
 * deeper one on `/docs/reference/y/`. `undefined` when none match. Matching is `isCurrent`'s, except a home
 * link (`/` or the base) with `match: 'prefix'` also matches every path under it (D-138: a home link
 * stays current on the pages below it), and any longer link still wins.
 * @param {string} pathname
 * @param {readonly (string | { href: string, match?: 'prefix' })[]} links hrefs, or links with their `match`
 * @param {string} [base]
 * @returns {string | undefined}
 */
export function currentHref(pathname: string, links: readonly (string | {
    href: string;
    match?: "prefix";
})[], base?: string): string | undefined;
/**
 * Whether a link leaves the site (D-137): an absolute http(s) or protocol-relative URL. Such a link opens in a
 * new tab with `rel="noopener noreferrer"` and carries the external icon; `mailto:` and the like do not.
 * @param {string} href
 * @returns {boolean}
 */
export function isExternal(href: string): boolean;
/**
 * How a header or footer link leaves the site (D-137): `out` for the external icon, `attrs` for the anchor
 * (a new tab, `noopener noreferrer`); an internal or `mailto:` link gets neither.
 * @param {string} href
 * @returns {{ out: boolean, attrs: { target?: string, rel?: string } }}
 */
export function externalLink(href: string): {
    out: boolean;
    attrs: {
        target?: string;
        rel?: string;
    };
};
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
/** The accessible label of the external-link icon, shared by the header, drawer and footer. */
export const EXTERNAL_LABEL: "(external, opens in a new tab)";
export type Nav = import("./registry.mjs").Nav;
