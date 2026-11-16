// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The OCX Authors

// Heading permalinks, one element each. Starlight's own (`markdown.headingLinks`) wraps every heading in a div beside
// an `<a>` holding a span, an svg with its paths and a screen-reader span: seven elements where the page needs one. The
// theme turns that option off (starlight/index.mjs) and wraps the heading's content in the link instead:
// `<h2 id="x"><a class="ocx-anchor" href="#x">Title</a></h2>`. The link is named by the heading's own text, the
// glyph is CSS (starlight.css), and the heading keeps its id, so `:target` and `scroll-margin` are unchanged.

const HEADINGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];

/**
 * Whether any node in `nodes` (or below) is an `<a>`: a link cannot hold a link.
 * @param {readonly import('satteri').HastNode[]} nodes
 * @returns {boolean}
 */
const hasLink = (nodes) => nodes.some((n) => n.type === 'element' && (n.tagName === 'a' || hasLink(n.children)));

/**
 * Sätteri hast plugin: a heading with an id and no link of its own becomes its own permalink. A heading that holds a
 * link keeps no permalink (its id still works from the table of contents and by hand). Runs after the heading ids exist.
 * @type {import('satteri').HastPluginDefinition}
 */
export const headingAnchors = {
  name: '@ocx-sh/theme/heading-anchors',
  element: {
    filter: HEADINGS,
    visit(heading) {
      const id = heading.properties?.['id'];
      if (typeof id !== 'string' || !id || heading.children.length === 0 || hasLink(heading.children)) return;
      // The new heading holds the link, so a second visit finds a link and stops.
      return {
        type: 'element',
        tagName: heading.tagName,
        properties: heading.properties,
        children: [
          {
            type: 'element',
            tagName: 'a',
            properties: { class: 'ocx-anchor', href: `#${id}` },
            children: heading.children,
          },
        ],
      };
    },
  },
};
