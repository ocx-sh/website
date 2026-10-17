/**
 * Sync every `[data-ocx-theme]` button in `doc` to the page theme and follow their cycle event:
 * set `html[data-theme]`, sync the buttons and persist; storage failures (private mode) are ignored
 * so the toggle still works for the current page.
 * @param {Document} [doc]
 * @returns {void}
 */
export function wireThemeToggles(doc?: Document): void;
