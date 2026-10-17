/**
 * Remark plugin: rewrites `link` and `definition` URLs that name a `.md`/`.mdx` page inside the docs tree to the
 * page's route, `base` + directory + trailing slash, keeping the `#fragment`. `index` pages route to their
 * directory. External URLs, bare `#fragment` links and targets leaving the tree are left alone. Code and inline
 * code are never touched.
 *
 * @param {{ root: string, base: string }} options `root` is the absolute docs content root; `base` the site path
 *   of that root, for example `/docs/`. The page's own path is `file.path` relative to `root`.
 * @returns {(tree: import('mdast').Root, file: import('vfile').VFile) => void}
 */
export function remarkMdLinks({ root, base }: {
    root: string;
    base: string;
}): (tree: import("mdast").Root, file: import("vfile").VFile) => void;
