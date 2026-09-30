// Public `@ocx-sh/theme/nav` entry: the registry plus header helpers.
export * from './registry.mjs';
export { PAGEFIND_VERSION } from './check/pagefind.mjs';

/** @typedef {import('./registry.mjs').Nav} Nav */

/**
 * The header section a path belongs to: a link section's id, the id of the menu
 * section whose hub prefixes it, an internal action's id, else `''`.
 * @param {Nav} nav
 * @param {string} pathname
 * @returns {string}
 */
export function activeSection(nav, pathname) {
  const under = (/** @type {string} */ href) =>
    href.startsWith('/') && (pathname.startsWith(href) || pathname === href.slice(0, -1));
  for (const s of nav.sections) {
    if ('href' in s ? under(s.href) : nav.hubs.some((h) => s.hubs.includes(h.id) && under(h.href))) return s.id;
  }
  return nav.actions.find((a) => under(a.href))?.id ?? '';
}
