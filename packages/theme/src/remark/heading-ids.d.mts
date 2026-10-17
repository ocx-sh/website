/**
 * Remark plugin: a heading whose last text ends in ` {#id}` (markdown) or the escaped ` \{#id\}` (MDX, where the
 * parser already decoded the escapes) gets `data.hProperties.id = id`, and the suffix leaves the heading text.
 * A last text node that is only the suffix is dropped. Headings without a suffix are left untouched.
 *
 * @returns {(tree: import('mdast').Root) => void}
 */
export function remarkHeadingIds(): (tree: import("mdast").Root) => void;
