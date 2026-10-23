// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 The OCX Authors

// GitHub and GitLab Markdown widgets as one Sätteri mdast plugin: alerts, aside aliases, collapsibles,
// emoji shortcodes, inline diff, TOC markers and HTML comments; plus task-list checkbox labels (hast).
import { nameToEmoji } from 'gemoji';
import { ICONS } from '../icons/icons.mjs';

/** @typedef {import('satteri').MdastVisitorContext} Ctx */
/** @typedef {import('satteri').MdastNode} Node */
/** @typedef {import('satteri').Custom} Custom */
/** @typedef {import('mdast').PhrasingContent} Phrasing */

// GitHub's five alert types onto Starlight's four aside variants, titled with GitHub's own word.
/** @type {Record<string, [string, string]>} */
const ALERTS = {
  note: ['note', 'Note'],
  tip: ['tip', 'Tip'],
  important: ['note', 'Important'],
  warning: ['caution', 'Warning'],
  caution: ['danger', 'Caution'],
};
// VitePress and GitHub names Starlight's asides lack.
/** @type {Record<string, [string, string]>} */
const ASIDE_ALIASES = { warning: ['caution', 'Warning'], info: ['note', 'Info'], important: ['note', 'Important'] };
// `[!TYPE]` alone on the first line (GitHub), or followed by a title (GitLab).
const ALERT = /^\[!(note|tip|important|warning|caution)\][ \t]*([^\n]*)(?:\n|$)/i;
// A shortcode touching a letter or digit stays text: `index:package:1.0` is not 📦.
const SHORTCODE = /(?<![\p{L}\p{N}_]):([a-z0-9_+-]+):(?![\p{L}\p{N}_])/gu;
const INLINE_DIFF = /\{\+ ?(.+?) ?\+\}|\{- ?(.+?) ?-\}/g;
const COMMENT = /^<!--[\s\S]*?-->\s*$/;
const TOC_MARKER = /^\[\[?TOC\]\]?$/;
const SUMMARY_CLOSE = /<\/summary>/gi;

// The chevron Collapsible renders through Icon.astro, attribute for attribute, so summary and trigger match.
const CHEVRON = (() => {
  const { viewBox, body } = ICONS['chevron-down'];
  return `<svg class="ocx-icon ocx-collapsible__chevron" data-icon="chevron-down" data-size="md" viewBox="${viewBox}" fill="none" stroke="currentColor" aria-hidden="true" focusable="false">${body}</svg>`;
})();

/**
 * Raw HTML as a node: an `html` node in Markdown, a `Fragment set:html` in MDX, where raw HTML
 * would be parsed as JSX.
 * @param {string} html
 * @param {Ctx} ctx
 * @param {'flow' | 'text'} [kind] block or inline position, MDX only
 * @returns {Phrasing}
 */
export function raw(html, ctx, kind = 'text') {
  if (ctx.sourceFormat !== 'mdx') return { type: 'html', value: html };
  const attr = { type: 'mdxJsxAttribute', name: 'set:html', value: html };
  const type = kind === 'flow' ? 'mdxJsxFlowElement' : 'mdxJsxTextElement';
  return /** @type {Phrasing} */ (
    /** @type {unknown} */ ({ type, name: 'Fragment', attributes: [attr], children: [] })
  );
}

/**
 * A paragraph rendered as another element, the way Starlight builds its asides.
 * @param {string} hName
 * @param {Record<string, unknown>} hProperties
 * @param {(Node | Custom)[]} children
 * @returns {Custom}
 */
const element = (hName, hProperties, children) => ({ type: 'paragraph', data: { hName, hProperties }, children });

/** @param {string} value @returns {string} */
const emojify = (value) =>
  value.replace(SHORTCODE, (/** @type {string} */ match, /** @type {string} */ name) => nameToEmoji[name] ?? match);

/**
 * Text with `{+ added +}` and `{- removed -}` split into `<ins>` and `<del>`; null when there is none.
 * @param {string} value
 * @returns {(Node | Custom)[] | null}
 */
function inlineDiff(value) {
  /** @type {(Node | Custom)[]} */
  const out = [];
  let at = 0;
  for (const m of value.matchAll(INLINE_DIFF)) {
    if (m.index > at) out.push({ type: 'text', value: value.slice(at, m.index) });
    const text = { type: 'text', value: m[1] ?? m[2] ?? '' };
    out.push(m[1] === undefined ? { type: 'delete', children: [text] } : element('ins', {}, [text]));
    at = m.index + m[0].length;
  }
  if (at === 0) return null;
  if (at < value.length) out.push({ type: 'text', value: value.slice(at) });
  return out;
}

/**
 * The directive Starlight renders as an aside, with `label` as its title unless the author gave one.
 * @param {string} name
 * @param {string} label
 * @param {readonly (Node | Custom)[]} children
 */
function aside(name, label, children) {
  const [first] = children;
  const titled = first?.type === 'paragraph' && first.data && 'directiveLabel' in first.data;
  const title = { type: 'paragraph', data: { directiveLabel: true }, children: [{ type: 'text', value: label }] };
  return /** @type {Node} */ (
    /** @type {unknown} */ ({
      type: 'containerDirective',
      name,
      attributes: {},
      children: titled ? children : [title, ...children],
    })
  );
}

/**
 * The Sätteri mdast plugin. It must run before Starlight's asides plugin, which renders the
 * `containerDirective`s it produces, and before Starlight's directive restoration.
 * @type {import('satteri').MdastPluginDefinition}
 */
export const widgets = {
  name: '@ocx-sh/theme/widgets',
  blockquote(node) {
    const [first, ...rest] = node.children;
    const head = first?.type === 'paragraph' ? first.children[0] : undefined;
    const match = head?.type === 'text' ? ALERT.exec(head.value) : null;
    if (!first || first.type !== 'paragraph' || !head || head.type !== 'text' || !match) return;
    const [name, word] = ALERTS[(match[1] ?? '').toLowerCase()] ?? ['note', 'Note'];
    const body = head.value.slice(match[0].length);
    const tail = [...(body ? [{ type: 'text', value: body }] : []), ...first.children.slice(1)];
    const paragraphs = tail.length ? [{ type: 'paragraph', children: tail }] : [];
    return aside(name, match[2]?.trim() || word, /** @type {Node[]} */ ([...paragraphs, ...rest]));
  },
  containerDirective(node, ctx) {
    const alias = ASIDE_ALIASES[node.name];
    if (alias) return aside(alias[0], alias[1], node.children);
    if (node.name !== 'details') return;
    const [first, ...rest] = node.children;
    const labelled = first?.type === 'paragraph' && first.data && 'directiveLabel' in first.data;
    const label = labelled ? first.children : [{ type: 'text', value: 'Details' }];
    const open = node.attributes && 'open' in node.attributes ? { open: true } : {};
    const summary = element('summary', {}, [...label, raw(CHEVRON, ctx)]);
    return /** @type {Node} */ (
      /** @type {unknown} */ (element('details', open, [summary, ...(labelled ? rest : node.children)]))
    );
  },
  html(node, ctx) {
    if (COMMENT.test(node.value)) return ctx.removeNode(node);
    const value = node.value.replace(SUMMARY_CLOSE, `${CHEVRON}</summary>`);
    if (value !== node.value) ctx.setProperty(node, 'value', value);
  },
  mdxJsxFlowElement(node, ctx) {
    if (node.name === 'summary') ctx.appendChild(node, raw(CHEVRON, ctx));
  },
  mdxJsxTextElement(node, ctx) {
    if (node.name === 'summary') ctx.appendChild(node, raw(CHEVRON, ctx));
  },
  paragraph(node, ctx) {
    if (TOC_MARKER.test(ctx.textContent(node).trim())) ctx.removeNode(node);
  },
  text(node, ctx) {
    if (!node.value.includes(':') && !node.value.includes('{')) return;
    const value = emojify(node.value);
    const parts = inlineDiff(value);
    if (parts) ctx.replaceNode(node, parts);
    else if (value !== node.value) ctx.setProperty(node, 'value', value);
  },
};

// Starlight's four aside variants, the directives `widgets` turns alerts into.
const ASIDE_VARIANTS = new Set(['note', 'tip', 'caution', 'danger']);

/**
 * Sätteri mdast plugin for pages outside Starlight: renders the aside directives `widgets` produces as
 * Starlight's own Aside markup (minus the icon, which the theme hides), so one stylesheet serves both.
 * Never add it to a Starlight processor: Starlight's asides plugin renders them there.
 * @type {import('satteri').MdastPluginDefinition}
 */
export const asides = {
  name: '@ocx-sh/theme/asides',
  containerDirective(node, ctx) {
    if (!ASIDE_VARIANTS.has(node.name)) return;
    const [first, ...rest] = node.children;
    const labelled = first?.type === 'paragraph' && first.data && 'directiveLabel' in first.data;
    const title = labelled ? ctx.textContent(first) : node.name;
    const heading = element('p', { className: ['starlight-aside__title'], ariaHidden: 'true' }, [
      { type: 'text', value: title },
    ]);
    const content = element('div', { className: ['starlight-aside__content'] }, labelled ? rest : node.children);
    const props = { ariaLabel: title, className: ['starlight-aside', `starlight-aside--${node.name}`] };
    return /** @type {Node} */ (/** @type {unknown} */ (element('aside', props, [heading, content])));
  },
};

/** @typedef {import('satteri').HastNode} HastChild */

/** @param {HastChild} node @returns {string} */
const label = (node) =>
  node.type === 'text'
    ? node.value
    : node.type === 'element' && node.tagName !== 'sup' // a footnote reference is no part of the task
      ? node.children.map(label).join('')
      : '';

/** @param {HastChild | undefined} node @param {string} tag */
const is = (node, tag) => node?.type === 'element' && node.tagName === tag;

/**
 * Sätteri hast plugin: a task-list checkbox is named by its item's text (an unlabelled form field fails
 * Lighthouse accessibility). The box sits in the item, or in its first paragraph when the item is loose.
 * @type {import('satteri').HastPluginDefinition}
 */
export const taskLabels = {
  name: '@ocx-sh/theme/task-labels',
  element: {
    filter: ['li'],
    visit(li, ctx) {
      if (!String(li.properties.className ?? '').includes('task-list-item')) return;
      const host = li.children.some((c) => is(c, 'input')) ? li : li.children.find((c) => is(c, 'p'));
      if (host?.type !== 'element') return;
      const box = host.children.find((c) => is(c, 'input'));
      if (!box) return;
      const end = host.children.findIndex((c) => is(c, 'ul') || is(c, 'ol')); // a nested list is not the label
      const text = host.children
        .slice(0, end < 0 ? undefined : end)
        .map(label)
        .join('')
        .trim();
      ctx.setProperty(box, 'ariaLabel', text);
    },
  },
};
