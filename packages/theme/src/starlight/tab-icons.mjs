// SSR rewrites of rendered HTML: the <Tabs> panels (Tabs.astro), and for the
// MarkdownContent override a scroll region around each markdown table and
// stylesheet links hoisted to the top.

// ponytail: a tokenizer, not a parser. It knows comments, <script>/<style> raw
// text, end tags and start tags whose quoted attribute values may hold `<` or `>`
// (Expressive Code's data-code does); everything else is text. It does not know
// CDATA, <textarea>/<title> RCDATA or malformed markup — an HTML parser if the
// rendered pages ever carry those.
const TOKEN =
  /<!--[\s\S]*?-->|<(script|style)\b(?:"[^"]*"|'[^']*'|[^>"'])*>[\s\S]*?<\/\1\s*>|<\/[a-zA-Z][^\s>]*\s*>|<[a-zA-Z][^\s/>]*(?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*\s*\/?>|<|[^<]+/g;

/**
 * The HTML split into tokens that concatenate back to it byte for byte.
 * @param {string} html
 * @returns {string[]}
 */
const tokenize = (html) => html.match(TOKEN) ?? [];

/**
 * The top-level `<TabItem>` panels (`<div data-ocx-tab>`) in the rendered `<Tabs>` slot (C-150):
 * their labels and icons, and the slot HTML with each panel's opening tag replaced by `attrs(i)`.
 * @param {string} html
 * @returns {{ items: { label: string, icon?: string }[], html: (attrs: (i: number) => Record<string, string | true>) => string }}
 */
export function tabPanels(html) {
  const t = tokenize(html);
  /** @type {number[]} */
  const at = [];
  /** @type {{ label: string, icon?: string }[]} */
  const items = [];
  let depth = 0;
  for (const [i, tag] of t.entries()) {
    if (/^<div[\s>]/i.test(tag)) {
      if (depth++ === 0 && /\sdata-ocx-tab[\s=>]/.test(tag)) {
        at.push(i);
        const icon = attr(tag, 'data-icon');
        items.push({ label: attr(tag, 'data-label') ?? '', ...(icon && { icon }) });
      }
    } else if (/^<\/div\s*>$/i.test(tag)) depth--;
  }
  return {
    items,
    html: (attrs) => {
      const out = [...t];
      at.forEach((i, n) => {
        out[i] = `<div${Object.entries(attrs(n))
          .map(([k, v]) =>
            v === true ? ` ${k}` : ` ${k}="${v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')}"`,
          )
          .join('')}>`;
      });
      return out.join('');
    },
  };
}

const ENTITIES = /** @type {Record<string, string>} */ ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" });

/**
 * A double-quoted attribute of a start tag, entities decoded (Astro escapes & < > " ').
 * @param {string} tag
 * @param {string} name
 * @returns {string | undefined}
 */
function attr(tag, name) {
  const raw = new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
  return raw?.replace(/&(#x?[\da-f]+|\w+);/gi, (/** @type {string} */ m, /** @type {string} */ e) =>
    e.startsWith('#') ? codePoint(Number(`0${e.slice(1)}`), m) : (ENTITIES[e] ?? m),
  );
}

/** @param {number} n @param {string} raw kept when `n` is no code point */
const codePoint = (n, raw) => (n <= 0x10ffff ? String.fromCodePoint(n) : raw);

const TABLE_WRAP = '<div class="ocx-table-scroll" tabindex="0" role="region"';

/**
 * Scroll region around a markdown table; focusable so keyboard users can scroll it.
 * @param {string} label accessible name, raw HTML text (entities kept)
 */
export const tableWrap = (label) => `${TABLE_WRAP} aria-label="${label.replace(/"/g, '&quot;')}">`;

/**
 * Wraps each top-level bare `<table>` (what markdown emits; classed tables are
 * a component's own) in {@link tableWrap}, named after the closest preceding
 * heading and numbered when a name repeats: every region landmark on a page is
 * unique (axe landmark-unique). Already wrapped tables are left alone.
 * @param {string} html
 * @returns {string}
 */
export function wrapTables(html) {
  const t = tokenize(html);
  let depth = 0;
  let wrapped = false;
  let prev = '';
  let heading = '';
  /** @type {string | undefined} text of the heading being read */
  let reading;
  /** @type {Map<string, number>} */
  const seen = new Map();
  for (let i = 0; i < t.length; i++) {
    const tag = /** @type {string} */ (t[i]);
    if (/^<h[1-6][\s>]/i.test(tag)) reading = '';
    else if (/^<\/h[1-6]\s*>$/i.test(tag) && reading != null) {
      heading = reading.replace(/\s+/g, ' ').trim();
      reading = undefined;
    } else if (reading != null && !tag.startsWith('<')) reading += tag;
    if (/^<table[\s>/]/i.test(tag)) {
      if (depth++ === 0 && tag === '<table>' && !prev.startsWith(TABLE_WRAP)) {
        const base = heading ? `${heading} table` : 'Table';
        const n = (seen.get(base) ?? 0) + 1;
        seen.set(base, n);
        t[i] = tableWrap(n > 1 ? `${base} ${n}` : base) + tag;
        wrapped = true;
      }
    } else if (/^<\/table\s*>$/i.test(tag) && depth > 0 && --depth === 0 && wrapped) {
      t[i] = `${tag}</div>`;
      wrapped = false;
    }
    if (tag.trim()) prev = tag;
  }
  return t.join('');
}

/**
 * Splits every `<link rel="stylesheet">` out of the content, for the caller to
 * place ahead of the content wrapper. Expressive
 * Code emits its stylesheet link inside the first code block; when that block
 * sits in a tab panel, Chrome paints the tablist unframed (the rest of the
 * content waits for the sheet), then snaps the frame in once it loads. Ahead of
 * the content, the content paints once, already styled; outside the wrapper, no
 * `:first-child` or sibling-margin rule sees the links.
 * @param {string} html
 * @returns {{ links: string, rest: string }}
 */
export function splitStylesheets(html) {
  /** @type {string[]} */
  const links = [];
  const rest = tokenize(html).filter((tag) => {
    const hit = /^<link\s/i.test(tag) && /\srel\s*=\s*(["']?)stylesheet\1[\s/>]/i.test(tag);
    if (hit) links.push(tag);
    return !hit;
  });
  return { links: links.join(''), rest: rest.join('') };
}
