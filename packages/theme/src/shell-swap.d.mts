/**
 * Swaps the live nav into `header` when it fits and the nav is idle.
 * @param {Document} doc
 * @param {HTMLElement} header the `.ocx-header` root, `data-nav-rev` its baked rev
 * @param {HTMLElement} nav the header's `navigation-menu` Zag root
 * @param {string} rev the current rev, `SHELL_REV`-shaped
 * @param {Mounts} mounts
 * @returns {Promise<boolean>} whether the header now shows the live nav
 */
export function swapShell(doc: Document, header: HTMLElement, nav: HTMLElement, rev: string, { release, rearm }: Mounts): Promise<boolean>;
/**
 * How the swap stops and re-arms the nav's lazy Zag machine (chrome.mjs owns its `mount`).
 */
export type Mounts = {
    release: () => void;
    rearm: () => void;
};
