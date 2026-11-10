// Sitemap filter: `frag/` pages (HTML fragments a Deferred fetches) are not pages anyone should land on.

/**
 * @param {string} base the site's base path, ending in "/"
 * @returns {(page: string) => boolean} true keeps the URL in the sitemap
 */
export const withoutFragments = (base) => (page) => !new URL(page).pathname.startsWith(`${base}frag/`);
