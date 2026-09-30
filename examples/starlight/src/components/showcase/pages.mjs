// C-120: the component pages the index lists, from the Starlight `docs` collection.

/**
 * Entries under `components/` except the index itself, sorted by title.
 * @template {{ id: string, data: { title: string } }} E
 * @param {readonly E[]} entries
 * @returns {E[]}
 */
export function componentPages(entries) {
  return entries
    .filter((e) => e.id.startsWith('components/'))
    .toSorted((a, b) => a.data.title.localeCompare(b.data.title, 'en'));
}

/**
 * @typedef {{ type: 'link', href: string } | { type: 'group', label: string, entries: readonly SidebarEntry[] }} SidebarEntry
 */

/**
 * The gallery's groups (D-SB9): every group nested in a top-level sidebar group (the example's
 * "Components" group), holding the pages it links (deeper groups flatten into it). Pages in no
 * group go to a final `rest` group. The sidebar config stays the one source of categories.
 * @template {{ id: string }} E
 * @param {readonly E[]} pages `componentPages()` output, order kept inside each group
 * @param {readonly SidebarEntry[]} sidebar `Astro.locals.starlightRoute.sidebar`
 * @param {(page: E) => string} href the page's link, as the sidebar writes it
 * @param {string} [rest]
 * @returns {{ label: string, pages: E[] }[]}
 */
export function groupPages(pages, sidebar, href, rest = 'Other') {
  /** @type {(entries: readonly SidebarEntry[]) => string[]} */
  const links = (entries) => entries.flatMap((e) => (e.type === 'link' ? [e.href] : links(e.entries)));
  const groups = sidebar
    .flatMap((top) => (top.type === 'group' ? top.entries : []))
    .flatMap((g) => (g.type === 'group' ? [{ label: g.label, hrefs: new Set(links(g.entries)) }] : []))
    .map(({ label, hrefs }) => ({ label, pages: pages.filter((p) => hrefs.has(href(p))) }))
    .filter((g) => g.pages.length);
  const placed = new Set(groups.flatMap((g) => g.pages));
  const left = pages.filter((p) => !placed.has(p));
  return left.length ? [...groups, { label: rest, pages: left }] : groups;
}
