// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The OCX Authors

import { relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { matcher } from '../glossary/matcher.mjs';

/**
 * @typedef {'page' | 'section' | 'all'} GlossaryFrequency
 * @typedef {{
 *   terms: readonly import('../glossary/types.mjs').GlossaryTerm[],
 *   page: string,
 *   exclude?: readonly string[],
 *   frequency?: GlossaryFrequency,
 * }} GlossaryOptions
 *   `terms`: the glossary rows; `page`: the glossary page's route under the docs base (`reference/glossary/`),
 *   whose `{#id}` anchors the links target and which never links its own terms; `exclude`: route prefixes whose
 *   pages link nothing (`changelog/`); `frequency`: which usages link, `page` (default) the first of each term
 *   per page, `section` the first per `##` section (text before the first `##` is a section of its own), `all`
 *   every one
 */

/** Ancestors whose text is a name, a label or a target, never prose. */
const SKIPPED = new Set([
  'heading',
  'link',
  'linkReference',
  'definition',
  'image',
  'imageReference',
  'inlineCode',
  'code',
  'html',
  'textDirective',
  'leafDirective',
]);
// Components whose children are the page's own prose; every other JSX element (`Tree`, `ShellSession`,
// `Terminal`, `Tooltip`, `InstallCommand`) holds names, commands or its own definition.
const PROSE_COMPONENTS = new Set(['Steps', 'Tabs', 'TabItem', 'Aside', 'details']);
const KEY = '@ocx-sh/theme/glossary';

/**
 * Whether an element built by a plugin (`data.hProperties`) is `aria-hidden`: Starlight moves an aside's title into one.
 * @param {object} data a paragraph's `data`
 */
const hiddenFromAt = (data) =>
  /** @type {{ hProperties?: Record<string, unknown> }} */ (data).hProperties?.['aria-hidden'] === 'true';

/** A route as a prefix to compare: no leading slash, one trailing slash, `''` for the root. @param {string} route */
const prefix = (route) => {
  const bare = route.replace(/^\/+|\/+$/g, '');
  return bare ? `${bare}/` : '';
};

/**
 * Sätteri mdast plugin: the first usage of each glossary term in a page's prose becomes
 * `<a class="ocx-term" href="<page>#<id>">text</a>`, the one element per term (frequency `page`; see
 * {@link GlossaryOptions}). Pages are not edited. Never linked: headings, link and image text, code,
 * raw HTML, directive labels (an aside's title: Starlight moves its text into an `aria-hidden` element, where a
 * link would be focusable but hidden), the props of components and the content of components other
 * than `Steps`, `Tabs`, `TabItem`, `Aside` and `details`. Matching rules: `matcher` in `../glossary/matcher.mjs`.
 * A row's `excludePages` (route prefixes, matched like `exclude`) drops that term's forms on those pages only:
 * its `except` phrases still match and every other term, longer forms containing the word included, links.
 *
 * @param {GlossaryOptions & { root: string, base: string }} options `root` is the absolute docs content root,
 *   `base` its site path (`/docs/`); a page outside the root (a story) links like any other
 * @returns {import('satteri').MdastPluginDefinition}
 */
export function glossary({ terms, root, base, page, exclude = [], frequency = 'page' }) {
  /** @type {Map<string, ReturnType<typeof matcher>>} one finder per set of terms a route excludes */
  const finders = new Map();
  /** @param {string} route */
  const finderFor = (route) => {
    const off = terms.filter((t) => t.excludePages?.some((p) => route.startsWith(prefix(p))));
    const id = off.map((t) => t.id).join('\0');
    let find = finders.get(id);
    if (!find) {
      // An excluded term keeps its `except` phrases but no variants, so it consumes nothing a longer form needs.
      find = matcher(terms.map((t) => (off.includes(t) ? { ...t, variants: [] } : t)));
      finders.set(id, find);
    }
    return find;
  };
  const target = `${base.endsWith('/') ? base : `${base}/`}${prefix(page)}#`;
  const own = prefix(page);
  const skipped = exclude.map(prefix);

  /**
   * @typedef {{ on: boolean, find: ReturnType<typeof matcher>, section: number, seen: Set<string> }} State
   * @param {import('satteri').MdastVisitorContext} ctx
   * @returns {State}
   */
  const stateOf = (ctx) => {
    const bag = /** @type {Record<string, State | undefined>} */ (/** @type {unknown} */ (ctx.data));
    const had = bag[KEY];
    if (had) return had;
    let on = true;
    let route = '';
    if (ctx.fileURL) {
      const rel = relative(root, fileURLToPath(ctx.fileURL)).split(sep).join('/');
      if (!rel.startsWith('..')) {
        route = prefix(rel.replace(/\.mdx?$/, '').replace(/(^|\/)index$/, ''));
        on = route !== own && !skipped.some((p) => route.startsWith(p));
      }
    }
    return (bag[KEY] = { on, find: finderFor(route), section: 0, seen: new Set() });
  };

  /**
   * @param {import('satteri').MdastNode} node
   * @param {import('satteri').MdastVisitorContext} ctx
   */
  const inSkipped = (node, ctx) => {
    for (let p = ctx.parent(node); p; p = ctx.parent(p)) {
      if (SKIPPED.has(p.type)) return true;
      if (p.type === 'paragraph' && p.data && ('directiveLabel' in p.data || hiddenFromAt(p.data))) return true;
      if ((p.type === 'mdxJsxFlowElement' || p.type === 'mdxJsxTextElement') && p.name && !PROSE_COMPONENTS.has(p.name))
        return true;
    }
    return false;
  };

  return {
    name: '@ocx-sh/theme/glossary',
    heading(node, ctx) {
      if (node.depth === 2) stateOf(ctx).section++;
    },
    text(node, ctx) {
      const state = stateOf(ctx);
      if (!state.on) return;
      const hits = state.find(node.value);
      if (!hits.length || inSkipped(node, ctx)) return;
      /** @type {import('satteri').MdastContent[]} */
      const parts = [];
      let at = 0;
      for (const hit of hits) {
        if (frequency !== 'all') {
          const key = frequency === 'page' ? hit.id : `${state.section}:${hit.id}`;
          if (state.seen.has(key)) continue;
          state.seen.add(key);
        }
        if (hit.start > at) parts.push({ type: 'text', value: node.value.slice(at, hit.start) });
        parts.push({
          type: 'link',
          url: `${target}${hit.id}`,
          title: null,
          data: { hProperties: { className: ['ocx-term'] } },
          children: [{ type: 'text', value: hit.text }],
        });
        at = hit.end;
      }
      if (!parts.length) return;
      if (at < node.value.length) parts.push({ type: 'text', value: node.value.slice(at) });
      ctx.replaceNode(node, parts);
    },
  };
}
