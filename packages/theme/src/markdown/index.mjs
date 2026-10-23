// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The OCX Authors

// The theme's Markdown transforms, added to the consumer's Sätteri processor by the Starlight plugin.
import { includes } from './includes.mjs';
import { math } from './math.mjs';
import { mdLinks } from './md-links.mjs';
import { taskLabels, widgets } from './widgets.mjs';

/**
 * @typedef {{
 *   features: import('satteri').Features,
 *   mdastPlugins: import('satteri').MdastPluginEntry[],
 *   hastPlugins: object[],
 * }} SatteriOptions
 */

const ID_SUFFIX = /\s*\{#([^\s{}]+)\}\s*$/;

/**
 * Sätteri hast plugin: a heading ending in the escaped `\{#id\}` gets that id. MDX editors parse an
 * unescaped `{#id}` as a JS expression and flag it, so `.mdx` pages write the escaped form, which Sätteri
 * leaves as text.
 * @type {import('satteri').HastPluginDefinition}
 */
export const headingIds = {
  name: '@ocx-sh/theme/heading-ids',
  element: {
    filter: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'],
    visit(heading, ctx) {
      const last = heading.children.at(-1);
      if (last?.type !== 'text') return;
      const match = ID_SUFFIX.exec(last.value);
      if (!match) return;
      ctx.setProperty(heading, 'id', match[1]);
      const rest = last.value.slice(0, match.index);
      if (rest) ctx.setProperty(last, 'value', rest);
      else ctx.removeNode(last);
    },
  },
};

/**
 * Adds the theme's plugins to a Sätteri processor's options, in place: replacing the processor
 * would drop the consumer's own options and every plugin Starlight already added.
 * @param {SatteriOptions} options
 * @param {{ srcDir: string, docsDir: string, base: string, math: boolean, smartypants: boolean }} site
 *   `docsDir` is the docs collection's directory, `base` its site path; `math` parses `$…$` and
 *   `$$…$$`; `smartypants` is Astro's `markdown.smartypants`.
 */
export function addMarkdownPlugins(options, site) {
  options.features.headingAttributes ??= true;
  if (site.math) options.features.math ??= true;
  // Tool docs write `--flag` in prose far more often than a dash (187 to 12 in the consumers' docs): `--`
  // stays as written, quotes and ellipses still curl.
  if (site.smartypants) options.features.smartPunctuation ??= { dashes: false };
  // Starlight's asides plugin is already in the list and renders the directives `widgets` makes, so
  // these go first; includes ahead of widgets so included text gets the widgets too.
  options.mdastPlugins.unshift(includes({ srcDir: site.srcDir }), widgets);
  options.mdastPlugins.push(mdLinks({ root: site.docsDir, base: site.base }), math);
  // headingIds first: Starlight's heading anchors read the heading text.
  options.hastPlugins.unshift(headingIds);
  options.hastPlugins.push(taskLabels);
}
