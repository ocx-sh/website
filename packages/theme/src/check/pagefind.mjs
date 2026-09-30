// Node-free: no imports. Loaded in the browser by the catalog (C-070) and by check/index.mjs.

/** The Pagefind version the theme release was tested with. */
export const PAGEFIND_VERSION = '1.5.2';

/**
 * The C-070 problem for a claim's `pagefind/pagefind-entry.json` contents, or `undefined`
 * when it matches {@link PAGEFIND_VERSION}.
 * @param {string | undefined} entryJsonText raw file contents, or `undefined` if the file
 *   is missing
 * @returns {string | undefined}
 */
export function pagefindProblem(entryJsonText) {
  if (entryJsonText === undefined)
    return 'C-070: pagefind-entry.json missing; a search claim must ship a Pagefind index';
  /** @type {unknown} */
  let entry;
  try {
    entry = JSON.parse(entryJsonText);
  } catch {
    return 'C-070: not valid JSON';
  }
  const version = typeof entry === 'object' && entry !== null && 'version' in entry ? entry.version : undefined;
  if (typeof version !== 'string') return 'C-070: no string "version"';
  if (version !== PAGEFIND_VERSION)
    return `C-070: Pagefind ${version} does not match the theme's tested Pagefind ${PAGEFIND_VERSION}`;
  return undefined;
}
