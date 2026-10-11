// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The OCX Authors

import { posix, relative, sep } from 'node:path';

import { visit } from 'unist-util-visit';

const PAGE_LINK = /^([^#?]+)\.mdx?([#?].*)?$/;
const EXTERNAL = /^[a-z][a-z0-9+.-]*:|^\/\//i;

/**
 * The route a `.md` link target names, keeping its `#fragment`/`?query`; the target itself when it is not one.
 * @param {string} target
 * @param {string} page the linking page, relative to the docs root
 * @param {string} base
 */
function route(target, page, base) {
  const match = PAGE_LINK.exec(target);
  if (!match || EXTERNAL.test(target)) return target;
  const file = match[1] ?? '';
  const path = file.startsWith('/') ? posix.normalize(file.slice(1)) : posix.join(posix.dirname(page), file);
  if (path.startsWith('..')) return target;
  const dir = path.replace(/(^|\/)index$/, '');
  return `${base}${dir ? `${dir}/` : ''}${match[2] ?? ''}`;
}

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
export function remarkMdLinks({ root, base }) {
  const prefix = base.endsWith('/') ? base : `${base}/`;
  return (tree, file) => {
    const page = relative(root, file.path).split(sep).join('/');
    if (page.startsWith('..')) return;
    visit(tree, ['link', 'definition'], (node) => {
      const ref = /** @type {import('mdast').Link | import('mdast').Definition} */ (node);
      ref.url = route(ref.url, page, prefix);
    });
  };
}
