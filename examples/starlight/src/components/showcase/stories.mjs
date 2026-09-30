// C-125 story kit: pure helpers over raw story sources (`src/stories/<slug>/<name>.mdx`). The doc
// page, the gallery and the story route share them. Only the route imports story modules: Astro
// bundles the CSS of every module a page imports (D-SB6), so everything else reads the raw text,
// `import.meta.glob('../../stories/**/*.mdx', { query: '?raw', import: 'default', eager: true })`.

/**
 * @typedef {{ title: string, height: number, description?: string, order?: number,
 *   log?: boolean, block?: boolean, prose?: boolean, toaster?: boolean }} StoryMeta
 * @typedef {{ id: string, slug: string, name: string, meta: StoryMeta, raw: string }} Story
 */

/** @type {Readonly<Record<string, 'string' | 'int' | 'bool'>>} */
const KEYS = {
  title: 'string',
  height: 'int',
  description: 'string',
  order: 'int',
  log: 'bool',
  block: 'bool',
  prose: 'bool',
  toaster: 'bool',
};
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/**
 * A story's flat YAML frontmatter: `key: value` lines only (strings, integers, `true`/`false`).
 * Throws on a missing block, an unknown or repeated key, a wrong type, or no `title`/`height`.
 * @param {string} raw the story's source
 * @returns {StoryMeta}
 */
export function parseFrontmatter(raw) {
  const block = FRONTMATTER.exec(raw)?.[1];
  if (block === undefined) throw new Error('story: no frontmatter block');
  /** @type {Record<string, string | number | boolean>} */
  const out = {};
  for (const line of block.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const m = /^([A-Za-z_]\w*):[ \t]*(.*?)[ \t]*$/.exec(line);
    if (!m) throw new Error(`story frontmatter: not a flat \`key: value\` line: ${line}`);
    const key = m[1] ?? '';
    const value = m[2] ?? '';
    const type = KEYS[key];
    if (!type) throw new Error(`story frontmatter: unknown key \`${key}\` (allowed: ${Object.keys(KEYS).join(', ')})`);
    if (key in out) throw new Error(`story frontmatter: \`${key}\` repeated`);
    if (type === 'bool') {
      if (value !== 'true' && value !== 'false') throw new Error(`story frontmatter: \`${key}\` must be true or false`);
      out[key] = value === 'true';
    } else if (type === 'int') {
      if (!/^\d+$/.test(value) || Number(value) < 1)
        throw new Error(`story frontmatter: \`${key}\` must be a positive integer`);
      out[key] = Number(value);
    } else {
      const text = /^(['"])(.*)\1$/.exec(value)?.[2] ?? value;
      if (!text) throw new Error(`story frontmatter: \`${key}\` is empty`);
      out[key] = text;
    }
  }
  if (typeof out['title'] !== 'string') throw new Error('story frontmatter: `title` is required');
  if (typeof out['height'] !== 'number') throw new Error('story frontmatter: `height` is required (px)');
  return /** @type {StoryMeta} */ (out);
}

/**
 * The story's source as a consumer writes it: frontmatter removed, trimmed.
 * @param {string} raw
 */
export const snippet = (raw) => raw.replace(FRONTMATTER, '').trim();

/**
 * The page a story is built at.
 * @param {string} id e.g. `tabs/default`
 * @param {string} [base] the site base, with a trailing slash
 */
export const storyRoute = (id, base = '/docs/') => `${base}stories/${id}/`;

/**
 * Story id of a glob key: the path under `stories/` without `.mdx`.
 * @param {string} path e.g. `../../stories/tabs/default.mdx`
 */
export const storyId = (path) => path.replace(/^.*?\/stories\//, '').replace(/\.mdx$/, '');

/**
 * The stories of one component (`src/stories/<slug>/*.mdx`): `default` first, then by `order`
 * (unordered last), then by title.
 * @param {string} slug the doc page's path under `components/`
 * @param {Readonly<Record<string, string>>} raws glob key → raw source
 * @returns {Story[]}
 */
export function storiesOf(slug, raws) {
  return Object.entries(raws)
    .map(([path, raw]) => ({ id: storyId(path), raw }))
    .filter(({ id }) => id.slice(0, id.lastIndexOf('/')) === slug)
    .map(({ id, raw }) => ({ id, slug, name: id.slice(slug.length + 1), meta: parseFrontmatter(raw), raw }))
    .toSorted(
      (a, b) =>
        Number(b.name === 'default') - Number(a.name === 'default') ||
        (a.meta.order ?? Infinity) - (b.meta.order ?? Infinity) ||
        a.meta.title.localeCompare(b.meta.title, 'en'),
    );
}
