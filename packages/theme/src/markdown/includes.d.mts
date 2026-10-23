/**
 * Sätteri mdast plugin for the two include forms the pages use.
 *
 * - A paragraph that is only `<<<` followed by an at-sign path, plus an optional language in braces, becomes a
 *   fenced block with that language and the file's text, one trailing newline removed. The at-sign names `srcDir`.
 * - An HTML node that is only an include comment naming PATH, with an optional first line N in braces
 *   followed by a comma, is replaced by the file's lines from N (1-based) to the end, parsed as Markdown. PATH is
 *   relative to the including file.
 *
 * @param {{ srcDir: string }} options `srcDir` is the absolute directory `@` names.
 * @returns {import('satteri').MdastPluginDefinition}
 */
export function includes({ srcDir }: {
    srcDir: string;
}): import("satteri").MdastPluginDefinition;
