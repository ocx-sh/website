// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The OCX Authors

// TeX as MathML at build time (Temml): browsers lay it out natively, so a page with math ships no
// script, stylesheet or font for it.
import temml from 'temml';
import { raw } from './widgets.mjs';

/**
 * MathML for `tex`. A formula that does not parse fails the build, naming the page.
 * @param {string} tex
 * @param {boolean} displayMode
 * @param {import('satteri').MdastVisitorContext} ctx
 */
function render(tex, displayMode, ctx) {
  try {
    return temml.renderToString(tex, { displayMode, throwOnError: true });
  } catch (cause) {
    throw new Error(`math: ${cause instanceof Error ? cause.message : String(cause)} in ${ctx.fileURL ?? 'a page'}`, {
      cause,
    });
  }
}

/**
 * Sätteri mdast plugin: ```` ```math ```` fences always; `$…$` and `$$…$$` only reach it when the
 * processor's `math` feature parses them.
 * @type {import('satteri').MdastPluginDefinition}
 */
export const math = {
  name: '@ocx-sh/theme/math',
  code(node, ctx) {
    if (node.lang === 'math') return raw(render(node.value, true, ctx), ctx, 'flow');
  },
  math(node, ctx) {
    return raw(render(node.value, true, ctx), ctx, 'flow');
  },
  inlineMath(node, ctx) {
    return raw(render(node.value, false, ctx), ctx, 'text');
  },
};
