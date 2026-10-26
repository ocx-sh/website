/**
 * Swaps the live nav into `header` when it fits and the nav is idle.
 * @param {Document} doc
 * @param {HTMLElement} nav the header's `navigation-menu` Zag root, `data-nav-rev` its baked rev
 * @param {unknown} rev the current rev from the pointer, untrusted
 * @returns {Promise<boolean>} whether the header now shows the live nav
 */
export function swapShell(doc: Document, nav: HTMLElement, rev: unknown): Promise<boolean>;
/**
 * Asks the root site which nav rev is current and swaps it in when it is not the baked one.
 * @param {Document} doc
 * @param {HTMLElement} nav the header's `navigation-menu` Zag root, `data-nav-rev` its baked rev
 */
export function syncLive(doc: Document, nav: HTMLElement): Promise<void>;
