// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The OCX Authors

import { posix, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

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
 * Sätteri mdast plugin: rewrites `link` and `definition` URLs that name a `.md`/`.mdx` page inside the docs
 * tree to the page's route, `base` + directory + trailing slash, keeping the `#fragment`. `index` pages route
 * to their directory. External URLs, bare `#fragment` links and targets leaving the tree are left alone. Code
 * and inline code are never touched.
 *
 * @param {{ root: string, base: string }} options `root` is the absolute docs content root; `base` the site path
 *   of that root, for example `/docs/`. The page's own path is its file relative to `root`.
 * @returns {import('satteri').MdastPluginDefinition}
 */
export function mdLinks({ root, base }) {
  const prefix = base.endsWith('/') ? base : `${base}/`;
  /**
   * @param {import('mdast').Link | import('mdast').Definition} node
   * @param {import('satteri').MdastVisitorContext} ctx
   */
  const rewrite = (node, ctx) => {
    if (!ctx.fileURL) return;
    const page = relative(root, fileURLToPath(ctx.fileURL)).split(sep).join('/');
    if (page.startsWith('..')) return;
    const url = route(node.url, page, prefix);
    // Both node types carry `url`; setProperty's overloads take one type at a time.
    if (url !== node.url) ctx.setProperty(/** @type {import('mdast').Link} */ (node), 'url', url);
  };
  return { name: '@ocx-sh/theme/md-links', link: rewrite, definition: rewrite };
}
