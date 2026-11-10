// A sidebar group's deferred links, fetched from its `frag/sidebar/<key>/` page (Sidebar.astro leaves the list empty).

/**
 * A sidebar group Sidebar.astro left empty (`data-defer`, the key of its fragment under the sidebar's `data-frag`)
 * gets its links when its fill runs (a touch of the group, or its opening), so they are there when it opens (groups inside
 * them are plain lists). Shared by the sidebar controller and the Zag collapsible; imports no Zag. A failed load leaves one "All pages" link
 * in the group and the next open fetches again.
 * @param {HTMLElement} root
 */
export function fillDeferred(root) {
  const list = /** @type {HTMLElement | null} */ (root.querySelector(':scope > [data-defer]'));
  const frag = root.closest('[data-frag]')?.getAttribute('data-frag');
  if (!list || !frag) return () => {};
  // Plain fetch, not fetch-html.mjs: its per-page cache would keep every group's markup for the page's life.
  const src = new URL(`${frag}${list.dataset['defer']}/`, location.href);
  if (src.origin !== location.origin) return () => {};
  return () => {
    // `data-defer` stays until the links are in, so a failed group is fetched again; one load at a time.
    if (!list.hasAttribute('data-defer') || list.hasAttribute('aria-busy')) return;
    list.setAttribute('aria-busy', 'true');
    void fetch(src, { credentials: 'same-origin', signal: AbortSignal.timeout(10_000) })
      .then((res) => (res.ok ? res.text() : Promise.reject(new Error(String(res.status)))))
      .then((html) => {
        // The fragment body is the group's one `<ul>`: its items go in as markup, so no node wrapper is created per link.
        const open = html.indexOf('>', html.indexOf('<ul'));
        list.replaceChildren();
        list.insertAdjacentHTML('beforeend', html.slice(open + 1, html.lastIndexOf('</ul>')));
        list.removeAttribute('data-defer');
        list.removeAttribute('data-failed');
      })
      .catch(() => {
        // One visible way on, never a blank open group: the list of every page.
        const a = list.ownerDocument.createElement('a');
        a.href = `${frag}_all/`;
        a.textContent = 'All pages';
        const item = list.ownerDocument.createElement('li');
        item.append(a);
        list.replaceChildren(item);
        list.setAttribute('data-failed', ''); // no reserved height for one link
      })
      .finally(() => list.removeAttribute('aria-busy'));
  };
}
