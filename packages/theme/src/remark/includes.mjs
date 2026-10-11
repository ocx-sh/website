// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The OCX Authors

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/** @typedef {import('mdast').RootContent} Node */

const CODE_INCLUDE = /^<<<\s+@\/(\S+?)(?:\{(\S+)\})?$/;
const MD_INCLUDE = /^<!--@include:\s*(\S+?)(?:\{(\d+),\})?\s*-->$/;

/** @param {string} path */
function read(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch (cause) {
    throw new Error(`include: cannot read ${path}`, { cause });
  }
}

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
export function remarkIncludes({ srcDir }) {
  const processor = this;
  /**
   * A replacement list for the node, or null to keep it and descend.
   * @param {Node} node
   * @param {string} dir
   * @returns {Node[] | null}
   */
  const expand = (node, dir) => {
    if (node.type === 'paragraph') {
      const [only] = node.children;
      const code = node.children.length === 1 && only?.type === 'text' ? CODE_INCLUDE.exec(only.value.trim()) : null;
      if (code) {
        const value = read(resolve(srcDir, code[1] ?? '')).replace(/\n$/, '');
        return [{ type: 'code', lang: code[2] ?? null, meta: null, value }];
      }
    }
    if (node.type === 'html') {
      const md = MD_INCLUDE.exec(node.value.trim());
      if (md) {
        const path = join(dir, md[1] ?? '');
        const text = read(path)
          .split('\n')
          .slice(md[2] ? Number(md[2]) - 1 : 0)
          .join('\n');
        const included = /** @type {import('mdast').Root} */ (/** @type {unknown} */ (processor.parse(text)));
        walk(included, dirname(path));
        return included.children;
      }
    }
    return null;
  };
  /**
   * @param {{ children?: Node[] }} parent
   * @param {string} dir
   */
  const walk = (parent, dir) => {
    if (!parent.children) return;
    parent.children = parent.children.flatMap((child) => {
      const replacement = expand(child, dir);
      if (replacement) return replacement;
      walk(/** @type {{ children?: Node[] }} */ (child), dir);
      return [child];
    });
  };
  return (tree, file) => walk(tree, dirname(file.path));
}
