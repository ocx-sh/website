/**
 * URL selection for the local Lighthouse loop (`task lighthouse:changed`): the audited pages a change
 * touches, plus the smoke set. CI and the pre-release run audit every URL; this only narrows dev runs.
 * Paths are repo-relative with `/` separators.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, posix } from 'node:path';
import { storyRoute } from '../examples/starlight/src/components/showcase/stories.mjs';
import { pageImports } from '../packages/theme/test/showcase.mjs';
import { routeOf } from '../tests/budgets.mjs';

/** Always audited: the root site's homepage and the example index. */
export const SMOKE = ['/', '/docs/'];
// ponytail: a theme file that reaches more pages than this is shared plumbing (zag, icons, ids); its
// fan-out is the full run, which CI does. Raise it if mid-size helpers should audit their pages locally.
export const FAN_OUT_MAX = 8;

const THEME_SRC = 'packages/theme/src/';
const COMPONENTS = `${THEME_SRC}components/`;
const DOCS = 'examples/starlight/src/content/docs/';
const STORIES = 'examples/starlight/src/stories/';
const SITE = 'site/';

// Relative static, dynamic and CSS imports; bare specifiers (`@zag-js/…`) leave the theme.
const IMPORT = /(?:from\s*|import\s*\(?\s*|@import\s+)['"](\.{1,2}\/[^'"?]+)/g;
const THEME_COMPONENT = /@ocx-sh\/theme\/components\/([^'"]+\.astro)/g;

/**
 * @typedef {{ importers: Map<string, Set<string>>, pages: Map<string, Set<string>>, siteUses: Set<string> }} Context
 *   importers: theme file → theme files importing it; pages: example route → theme components it imports;
 *   siteUses: theme components the root site imports.
 */

/** @param {string} dir @param {RegExp} keep */
const walk = (dir, keep) =>
  existsSync(dir)
    ? readdirSync(dir, { recursive: true, encoding: 'utf8' })
        .map((f) => f.split('\\').join('/'))
        .filter((f) => keep.test(f))
    : [];

/**
 * Reads the theme sources, the example pages and stories, and the root site's sources.
 * @param {string} root repo root
 * @returns {Context}
 */
export function loadContext(root) {
  /** @type {Map<string, Set<string>>} */
  const importers = new Map();
  for (const rel of walk(join(root, THEME_SRC), /\.(?:astro|mjs|ts|css)$/)) {
    if (/\.(?:test|d)\.[mc]?ts$/.test(rel)) continue;
    const file = THEME_SRC + rel;
    for (const [, spec = ''] of readFileSync(join(root, file), 'utf8').matchAll(IMPORT)) {
      const dep = posix.join(posix.dirname(file), spec);
      if (!importers.has(dep)) importers.set(dep, new Set());
      importers.get(dep)?.add(file);
    }
  }
  /** @type {Map<string, Set<string>>} */
  const pages = new Map();
  /** @param {string} route @param {string} src */
  const addPage = (route, src) => {
    const set = pages.get(route) ?? new Set();
    for (const spec of pageImports(src).values()) set.add(COMPONENTS + spec);
    pages.set(route, set);
  };
  for (const rel of walk(join(root, DOCS), /\.mdx?$/)) {
    if (!rel.startsWith('samples/')) addPage(routeOf(rel), readFileSync(join(root, DOCS, rel), 'utf8'));
  }
  for (const rel of walk(join(root, STORIES), /\.mdx$/)) {
    const src = readFileSync(join(root, STORIES, rel), 'utf8');
    const id = rel.slice(0, -'.mdx'.length);
    addPage(storyRoute(id), src);
    addPage(`/docs/components/${id.split('/')[0]}/`, src);
  }
  const siteUses = new Set(
    walk(join(root, SITE, 'src'), /\.(?:astro|mdx?|mjs|ts)$/).flatMap((rel) =>
      [...readFileSync(join(root, SITE, 'src', rel), 'utf8').matchAll(THEME_COMPONENT)].map((m) => COMPONENTS + m[1]),
    ),
  );
  return { importers, pages, siteUses };
}

/**
 * Example routes rendering a changed theme component file (through any chain of theme imports), or
 * `undefined` when its reach is global: a file outside `components/` imports it, or no page does.
 * @param {string} file
 * @param {Context} ctx
 * @returns {{ examples: string[], site: boolean } | undefined}
 */
function reachOf(file, ctx) {
  const seen = new Set([file]);
  for (const f of seen) {
    if (!f.startsWith(COMPONENTS)) return undefined;
    for (const by of ctx.importers.get(f) ?? []) seen.add(by);
  }
  const examples = [...ctx.pages].filter(([, uses]) => [...uses].some((u) => seen.has(u))).map(([route]) => route);
  const site = [...seen].some((f) => ctx.siteUses.has(f));
  return examples.length || site ? { examples, site } : undefined;
}

/**
 * The showcase page of a component file and its stories' prefix: `ui/DataTable.astro` and
 * `data-table.mjs` → `/docs/components/data-table/`. A file with no such page matches nothing.
 * @param {string} file
 */
const ownPage = (file) => {
  const stem = posix.basename(file).split('.')[0] ?? '';
  return `/docs/components/${stem.replace(/(?<=[a-z0-9])(?=[A-Z])/g, '-').toLowerCase()}/`;
};

/**
 * Audited URLs a set of changed files touches, in `allUrls` order, each with the file that selected it.
 * Theme files with a global reach select nothing beyond `SMOKE` and come back in `global`.
 * @param {string[]} files changed repo-relative paths
 * @param {string[]} allUrls every audited URL (`.lighthouserc.cjs`)
 * @param {Context} ctx
 * @returns {{ urls: string[], reasons: Map<string, string>, global: string[] }}
 */
export function selectUrls(files, allUrls, ctx) {
  const known = new Set(allUrls);
  /** @type {Map<string, string>} */
  const reasons = new Map();
  /** @param {string} url @param {string} why */
  const add = (url, why) => {
    if (known.has(url) && !reasons.has(url)) reasons.set(url, why);
  };
  const siteUrls = allUrls.filter((u) => !u.startsWith('/docs/'));
  /** @type {string[]} */
  const global = [];
  for (const u of SMOKE) add(u, 'smoke');
  for (const f of files) {
    if (f.startsWith(DOCS) && /\.mdx?$/.test(f)) add(routeOf(f.slice(DOCS.length)), f);
    else if (f.startsWith(STORIES) && f.endsWith('.mdx')) {
      const id = f.slice(STORIES.length, -'.mdx'.length);
      add(storyRoute(id), f);
      add(`/docs/components/${id.split('/')[0]}/`, f);
    } else if (f.startsWith(SITE)) for (const u of siteUrls) add(u, f);
    else if (f.startsWith(THEME_SRC)) {
      const reach = f.startsWith(COMPONENTS) ? reachOf(f, ctx) : undefined;
      if (!reach || reach.examples.length > FAN_OUT_MAX) {
        global.push(f);
        for (const u of allUrls) if (u.startsWith(ownPage(f))) add(u, f);
      } else {
        for (const u of reach.examples) add(u, f);
        if (reach.site) for (const u of siteUrls) add(u, f);
      }
    }
  }
  return { urls: allUrls.filter((u) => reasons.has(u)), reasons, global };
}

/** @param {string} root @param {string[]} args */
const git = (root, args) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8', timeout: 10_000, maxBuffer: 16 * 1024 * 1024 })
    .split('\n')
    .filter(Boolean);

/**
 * Files changed on this branch against `origin/main` (or `HEAD` without one), staged, unstaged or untracked.
 * @param {string} root repo root
 */
export function changedFiles(root) {
  let base = 'HEAD';
  try {
    base = git(root, ['merge-base', 'HEAD', 'origin/main'])[0] ?? 'HEAD';
  } catch {
    // no origin/main: the working tree against HEAD
  }
  return [
    ...new Set([
      ...git(root, ['diff', '--name-only', base]),
      ...git(root, ['ls-files', '--others', '--exclude-standard']),
    ]),
  ];
}
