// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The OCX Authors

import { visit } from 'unist-util-visit';

/**
 * Remark plugin: a heading whose last text ends in ` {#id}` (markdown) or the escaped ` \{#id\}` (MDX, where the
 * parser already decoded the escapes) gets `data.hProperties.id = id`, and the suffix leaves the heading text.
 * A last text node that is only the suffix is dropped. Headings without a suffix are left untouched.
 *
 * @returns {(tree: import('mdast').Root) => void}
 */
export function remarkHeadingIds() {
  return (tree) => {
    visit(tree, 'heading', (heading) => {
      const last = heading.children.at(-1);
      if (last?.type !== 'text') return;
      const match = /\s*\{#([^\s{}]+)\}\s*$/.exec(last.value);
      if (!match) return;
      const id = match[1] ?? '';
      last.value = last.value.slice(0, match.index);
      if (last.value === '') heading.children.pop();
      const data = /** @type {{ hProperties?: Record<string, unknown> }} */ (heading.data ?? {});
      heading.data = { ...heading.data, id, hProperties: { ...data.hProperties, id } };
    });
  };
}
