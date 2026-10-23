/**
 * The pinned scheme in storage, else `undefined` (follow the OS). A 0.5.x visitor's choice was already moved
 * to `starlight-theme` by THEME_SCRIPT (D-132). A blocked storage reads as nothing pinned.
 * @param {Storage | undefined} storage
 * @returns {'light' | 'dark' | undefined}
 */
export function storedTheme(storage: Storage | undefined): "light" | "dark" | undefined;
/**
 * Sync every `[data-ocx-theme]` button in `doc` to the page theme and follow their cycle event:
 * set `html[data-theme]`, sync the buttons and persist; storage failures (private mode) are ignored
 * so the toggle still works for the current page.
 * @param {Document} [doc]
 * @returns {void}
 */
export function wireThemeToggles(doc?: Document): void;
