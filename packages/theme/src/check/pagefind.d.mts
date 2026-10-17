/**
 * The C-070 problem for a claim's `pagefind/pagefind-entry.json` contents, or `undefined`
 * when it matches {@link PAGEFIND_VERSION}.
 * @param {string | undefined} entryJsonText raw file contents, or `undefined` if the file
 *   is missing
 * @returns {string | undefined}
 */
export function pagefindProblem(entryJsonText: string | undefined): string | undefined;
/** The Pagefind version the theme release was tested with. */
export const PAGEFIND_VERSION: "1.5.2";
