/**
 * @param {Document} doc
 * @param {HTMLElement} nav the header's navigation-menu root, `data-nav-rev` its baked rev (absent: no live header)
 */
export function syncShell(doc: Document, nav: HTMLElement): void;
/** Hosts that serve `/_shell/`; elsewhere (localhost, CI previews) the loader stays off, so no 404 reaches the console. Defined here, not in shell.mjs, so the lazy chunk's constants stay out of the every-page one. */
export const SHELL_HOST: RegExp;
