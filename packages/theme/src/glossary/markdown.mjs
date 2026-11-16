// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The OCX Authors

import './types.mjs';

/** @param {string} slug */
const humanise = (slug) => {
  const text = slug.replace(/[-_]+/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/**
 * The Markdown body of the glossary page: one `## Category {#category}` section per category, each holding one
 * `### Term {#id}` entry (the definition, then a `See [Page](href).` line to its learn-more target). The
 * consumer writes the frontmatter and commits the file; the term links point at those `{#id}` anchors.
 *
 * Categories come in the order of `categories` (its values are the headings), then any others by slug; terms sort by their display name inside a category. Output is deterministic, so a drift check can
 * compare it with the committed file.
 * @param {readonly import('./types.mjs').GlossaryTerm[]} terms
 * @param {{
 *   categories?: Record<string, string>,
 *   base?: string,
 *   titles?: Record<string, string>,
 * }} [options] `categories`: slug to heading (default: the slug, capitalised); `base`: the site path docs
 *   routes live under (default `/`), put before a route `learnMore`; `titles`: route (without fragment) to
 *   the page title the See line shows (default: the route's last segment, capitalised)
 * @returns {string}
 */
export function glossaryMarkdown(terms, { categories = {}, base = '/', titles = {} } = {}) {
  const prefix = base.endsWith('/') ? base : `${base}/`;
  const used = new Set(terms.map((t) => t.category));
  const slugs = [
    ...Object.keys(categories).filter((c) => used.has(c)),
    ...[...used].filter((c) => !(c in categories)).toSorted(),
  ];
  /** @param {string} learnMore @returns {string} */
  const see = (learnMore) => {
    if (/^https?:\/\//.test(learnMore)) return `See [${new URL(learnMore).hostname}](${learnMore}).`;
    const route = learnMore.replace(/#.*$/, '');
    const last = route.split('/').filter(Boolean).at(-1) ?? route;
    return `See [${titles[route] ?? humanise(last)}](${prefix}${learnMore}).`;
  };
  return (
    slugs
      .map((slug) => {
        const entries = terms
          .filter((t) => t.category === slug)
          .toSorted((a, b) => a.term.localeCompare(b.term, 'en'))
          .map((t) => `### ${t.term} {#${t.id}}\n\n${t.definition}\n\n${see(t.learnMore)}\n`);
        return `## ${categories[slug] ?? humanise(slug)} {#${slug}}\n\n${entries.join('\n')}`;
      })
      .join('\n')
      .trimEnd() + '\n'
  );
}
