/**
 * `shell/Fragment.astro` as HTML, rendered once per process: every page's SiteHeader asks for its
 * rev, and the fragment depends on nav.json only.
 * ponytail: the memo outlives a nav.json edit in `astro dev`; restart the server (the live header is a prod feature).
 * @returns {Promise<string>}
 */
export function renderShell(): Promise<string>;
