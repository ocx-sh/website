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
export function currentHref(pathname, links, base = '/') {
  /** @type {string | undefined} */
  let best = undefined;
  for (const link of links) {
    const { href, match } = typeof link === 'string' ? { href: link, match: undefined } : link;
    const home = match === 'prefix' && (href === '/' || href === base) && pathname.startsWith(href);
    if ((home || isCurrent(pathname, href, base)) && href.length > (best?.length ?? -1)) best = href;
  }
  return best;
}

/**
 * Whether a link leaves the site (D-137): an absolute http(s) or protocol-relative URL. Such a link opens in a
 * new tab with `rel="noopener noreferrer"` and carries the external icon; `mailto:` and the like do not.
 * @param {string} href
 * @returns {boolean}
 */
export function isExternal(href) {
  return /^(?:https?:)?\/\//i.test(href);
}

/** The accessible label of the external-link icon, shared by the header, drawer and footer. */
export const EXTERNAL_LABEL = '(external, opens in a new tab)';

/**
 * How a header or footer link leaves the site (D-137): `out` for the external icon, `attrs` for the anchor
 * (a new tab, `noopener noreferrer`); an internal or `mailto:` link gets neither.
 * @param {string} href
 * @returns {{ out: boolean, attrs: { target?: string, rel?: string } }}
 */
export function externalLink(href) {
  const out = isExternal(href);
  return { out, attrs: out ? { target: '_blank', rel: 'noopener noreferrer' } : {} };
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
 * for the ecosystem menu followed by its hubs (`hint`: the rest of a hub's "all …" text when it extends the label, so a bare "more" is no link text),
 * then the install action.
 * @param {Nav} nav
 * @param {string} pathname
 * @returns {{ label: string, hint?: string, href?: string, current?: boolean }[]}
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
              .map((h) => ({
                label: h.label,
                hint: h.all.replace(/\s*→$/, '').startsWith(h.label)
                  ? h.all.replace(/\s*→$/, '').slice(h.label.length)
                  : undefined,
                href: h.href,
                current: s.id === active && pathname.startsWith(h.href),
              })),
          ],
    ),
    ...nav.actions
      .filter((a) => a.id === 'install')
      .map((a) => ({ label: a.label, href: a.href, current: active === a.id })),
  ];
}

/**
 * The install guide's root-relative URL on ocx.sh (the header's install action), for any link a caller writes.
 * @param {Nav} nav
 * @returns {string}
 */
export function installHref(nav) {
  const href = nav.actions.find((a) => a.id === 'install')?.href;
  if (!href) throw new Error('nav.json has no "install" action');
  return href;
}

/**
 * The catalog's root-relative URL on ocx.sh, or with `pkg` (`<namespace>/<name>`, the part after `ocx.sh/` in
 * `ocx install ocx.sh/nodejs/node:24`, no tag) that package's page: `catalogHref(nav, 'nodejs/node')` is
 * `/catalog/nodejs/node/`.
 * @param {Nav} nav
 * @param {string} [pkg]
 * @returns {string}
 */
export function catalogHref(nav, pkg) {
  const section = nav.sections.find((s) => s.id === 'catalog');
  if (!section || !('href' in section)) throw new Error('nav.json has no "catalog" link section');
  if (pkg === undefined) return section.href;
  const segments = pkg.split('/');
  if (segments.length < 2 || segments.some((s) => !s || s.includes(':')))
    throw new Error(`catalogHref: "${pkg}" is not <namespace>/<name> (no registry, no tag)`);
  return `${section.href}${segments.map(encodeURIComponent).join('/')}/`;
}
