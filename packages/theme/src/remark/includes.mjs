// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The OCX Authors

import { readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

/** @typedef {import('mdast').RootContent} Node */

const CODE_INCLUDE = /^<<<\s+@\/(\S+?)(?:\{(\S+)\})?$/;
const MD_INCLUDE = /^<!--@include:\s*(\S+?)(?:\{(\d+),\})?\s*-->$/;

/**
 * @param {string} root
 * @param {string} path
 */
function inside(root, path) {
  const rel = relative(root, path);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

/**
 * Reads PATH, refusing anything outside `srcDir`, symlinks included.
 * @param {string} srcDir
 * @param {string} path
 */
function read(srcDir, path) {
  if (!inside(srcDir, path)) throw new Error(`include: ${path} is outside ${srcDir}`);
  try {
    const real = realpathSync(path);
    if (!inside(realpathSync(srcDir), real)) throw new Error(`include: ${path} resolves outside ${srcDir}`);
    return readFileSync(real, 'utf8');
  } catch (cause) {
    if (cause instanceof Error && cause.message.startsWith('include: ')) throw cause;
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
   * @param {string[]} stack absolute paths of the files being expanded, outermost first
   * @returns {Node[] | null}
   */
  const expand = (node, dir, stack) => {
    if (node.type === 'paragraph') {
      const [only] = node.children;
      const code = node.children.length === 1 && only?.type === 'text' ? CODE_INCLUDE.exec(only.value.trim()) : null;
      if (code) {
        const value = read(srcDir, resolve(srcDir, code[1] ?? '')).replace(/\n$/, '');
        return [{ type: 'code', lang: code[2] ?? null, meta: null, value }];
      }
    }
    if (node.type === 'html') {
      const md = MD_INCLUDE.exec(node.value.trim());
      if (md) {
        const path = join(dir, md[1] ?? '');
        if (stack.includes(path)) throw new Error(`include cycle: ${[...stack, path].join(' -> ')}`);
        const text = read(srcDir, path)
          .split('\n')
          .slice(md[2] ? Number(md[2]) - 1 : 0)
          .join('\n');
        const included = /** @type {import('mdast').Root} */ (/** @type {unknown} */ (processor.parse(text)));
        walk(included, dirname(path), [...stack, path]);
        return included.children;
      }
    }
    return null;
  };
  /**
   * @param {{ children?: Node[] }} parent
   * @param {string} dir
   * @param {string[]} stack
   */
  const walk = (parent, dir, stack) => {
    if (!parent.children) return;
    parent.children = parent.children.flatMap((child) => {
      const replacement = expand(child, dir, stack);
      if (replacement) return replacement;
      walk(/** @type {{ children?: Node[] }} */ (child), dir, stack);
      return [child];
    });
  };
  return (tree, file) => walk(tree, dirname(file.path), [file.path]);
}
