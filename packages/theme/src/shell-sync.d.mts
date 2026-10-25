/**
 * @param {Document} doc
 * @param {HTMLElement} header the `.ocx-header[data-nav-rev]` root
 * @param {HTMLElement} nav the header's navigation-menu root
 * @param {import('./shell-swap.mjs').Mounts} mounts how to stop and re-arm the nav's lazy machine
 */
export function syncShell(doc: Document, header: HTMLElement, nav: HTMLElement, mounts: import("./shell-swap.mjs").Mounts): void;
