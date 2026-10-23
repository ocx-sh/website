// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The OCX Authors

import { readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CODE_INCLUDE = /^<<<\s+@\/(\S+?)(?:\{(\S+)\})?$/;
const MD_INCLUDE = /^<!--@include:\s*(\S+?)(?:\{(\d+),\})?\s*-->$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

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
 * A fenced block of `value`, its fence longer than any backtick run inside.
 * @param {string} value
 * @param {string | undefined} lang
 */
function fenced(value, lang) {
  const fence = '`'.repeat(Math.max(3, ...[...value.matchAll(/`+/g)].map((m) => m[0].length + 1)));
  return `${fence}${lang ?? ''}\n${value}\n${fence}`;
}

/**
 * The Markdown text an include names, its own includes expanded. Sätteri does not revisit
 * inserted nodes, so nested includes are expanded here, as text, skipping fenced code.
 * @param {string} srcDir
 * @param {string} line one trimmed source line
 * @param {string} dir directory of the including file
 * @param {string[]} stack absolute paths of the files being expanded, outermost first
 * @returns {string | null} null when the line is no include
 */
function expand(srcDir, line, dir, stack) {
  const code = CODE_INCLUDE.exec(line);
  if (code) return fenced(read(srcDir, resolve(srcDir, code[1] ?? '')).replace(/\n$/, ''), code[2]);
  const md = MD_INCLUDE.exec(line);
  if (!md) return null;
  const path = join(dir, md[1] ?? '');
  if (stack.includes(path)) throw new Error(`include cycle: ${[...stack, path].join(' -> ')}`);
  const lines = read(srcDir, path)
    .split('\n')
    .slice(md[2] ? Number(md[2]) - 1 : 0);
  /** @type {string | null} */
  let fence = null;
  return lines
    .map((text) => {
      const open = FENCE.exec(text)?.[1];
      if (open && (fence === null || (open[0] === fence[0] && open.length >= fence.length))) {
        fence = fence === null ? open : null;
        return text;
      }
      return fence === null ? (expand(srcDir, text.trim(), dirname(path), [...stack, path]) ?? text) : text;
    })
    .join('\n');
}

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
export function includes({ srcDir }) {
  /**
   * @param {import('satteri').MdastNode} node
   * @param {string} line
   * @param {import('satteri').MdastVisitorContext} ctx
   */
  const replace = (node, line, ctx) => {
    if (!ctx.fileURL) return;
    const file = fileURLToPath(ctx.fileURL);
    const text = expand(srcDir, line.trim(), dirname(file), [file]);
    if (text !== null) ctx.replaceNode(node, { raw: text, mdxExpressions: false });
  };
  return {
    name: '@ocx-sh/theme/includes',
    paragraph(node, ctx) {
      const [only] = node.children;
      if (node.children.length === 1 && only?.type === 'text' && only.value.startsWith('<<<'))
        replace(node, only.value, ctx);
    },
    html(node, ctx) {
      if (node.value.startsWith('<!--@include:')) replace(node, node.value, ctx);
    },
  };
}
