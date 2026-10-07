// Public `@ocx-sh/theme/nav` entry: the registry plus header helpers.
export * from './registry.mjs';
export { PAGEFIND_VERSION } from './check/pagefind.mjs';

/** @typedef {import('./registry.mjs').Nav} Nav */

/**
 * Whether a neutral-mode link is current for a path: the home href (`/` or the base) matches exactly,
 * others by prefix; hrefs with a scheme (external) never match. Hrefs are used as given.
 * @param {string} pathname
 * @param {string} href
 * @param {string} [base]
 * @returns {boolean}
 */
export function isCurrent(pathname, href, base = '/') {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return false;
  return href === '/' || href === base ? pathname === href : pathname.startsWith(href);
}

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

/**
 * The header's section links as one flat list for the mobile menu: link sections, a label-only entry
 * for the ecosystem menu followed by its hubs, then the install action.
 * @param {Nav} nav
 * @param {string} pathname
 * @returns {{ label: string, href?: string, current?: boolean }[]}
 */
export function sectionLinks(nav, pathname) {
  const active = activeSection(nav, pathname);
  return [
    ...nav.sections.flatMap((s) =>
      'href' in s
        ? [{ label: s.label, href: s.href, current: s.id === active }]
        : [
            { label: s.label },
            ...nav.hubs
              .filter((h) => s.hubs.includes(h.id))
              .map((h) => ({ label: h.label, href: h.href, current: s.id === active && pathname.startsWith(h.href) })),
          ],
    ),
    ...nav.actions
      .filter((a) => a.id === 'install')
      .map((a) => ({ label: a.label, href: a.href, current: active === a.id })),
  ];
}
