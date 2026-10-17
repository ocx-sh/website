/**
 * Remark plugin for the two include forms the pages use.
 *
 * - A paragraph that is only `<<<` followed by an at-sign path, plus an optional language in braces, becomes a
 *   `code` node with that language and the file's text, one trailing newline removed. The at-sign names `srcDir`.
 * - An `html` node that is only an include comment naming PATH, with an optional first line N in braces
 *   followed by a comma, is replaced by the file's lines from N (1-based) to the end, parsed as markdown. PATH is
 *   relative to the including file.
 *
 * @this {import('unified').Processor}
 * @param {{ srcDir: string }} options `srcDir` is the absolute directory `@` names.
 * @returns {(tree: import('mdast').Root, file: import('vfile').VFile) => void}
 */
export function remarkIncludes(this: import("unified").Processor<undefined, undefined, undefined, undefined, undefined>, { srcDir }: {
    srcDir: string;
}): (tree: import("mdast").Root, file: import("vfile").VFile) => void;
export type Node = import("mdast").RootContent;
