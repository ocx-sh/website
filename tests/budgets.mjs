/**
 * Budgets and the gated page list (C-110, C-111, D-Z15): the single source
 * `.lighthouserc.cjs` (lhci assertions) and `tests/e2e/{budgets,hydration}.spec.ts`
 * (CDP measurements) both read. No top-level `await`: `.lighthouserc.cjs`
 * `require()`s this module (Node 24 `require(esm)`).
 *
 * A budget value only goes up with a Spec Delta row in
 * `.agents/plans/plan_zag-adoption.md`; Z13 ratchets them down.
 */
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { storyRoute } from '../examples/starlight/src/components/showcase/stories.mjs';

const KB = 1024;

/**
 * @typedef {'content' | 'showcase' | 'story'} PageClass
 * @typedef {{ preJsGz: number, postJsGz: number, totalBytes: number, domElements: number, heapMB: number }} Budget
 */

/**
 * Every page's HTML, gzipped: Lighthouse's simulation fits a response of up to
 * 14,600 bytes (10 TCP packets) into the first round trip. Past that the
 * document costs one more simulated RTT (~150 ms FCP/LCP) and performance drops
 * to 0.99. The cap leaves ~400 bytes for response headers.
 */
export const HTML_GZ_MAX = 14_200;

/**
 * Pagefind's scripts, loaded when the search dialog opens: every `/pagefind/` script plus its UI chunk
 * (`@pagefind/default-ui`, bundled as `/_astro/ui-core.<hash>.js`), gzip of the bodies. Kept apart so
 * the chrome's `postJsGz` cannot grow unnoticed inside Pagefind's share (Spec Delta MODIFIED C-110,
 * amended; Z13 ratchet). Measured over a real query ("install"): UI 26,479 + `pagefind.js` 12,961 +
 * worker 12,016 = 51,456 B → 58 KiB. The index, fragments and wasm a query fetches are not scripts.
 */
export const PAGEFIND_GZ_MAX = 58 * KB;

/**
 * Byte values in bytes; `heapMB` in MiB. Sizes are gzip of the response body.
 * Z13 ratchet (Spec Delta MODIFIED C-110): measured max over the class's pages × 1.15, rounded up to
 * 1 KiB / 100 elements / 1 MiB, the larger of the budgets e2e and lhci where both measure (table in
 * the plan's Schedule log). `postJsGz` is the chrome only: Pagefind (incl. its UI chunk) is excluded.
 * @type {Record<PageClass, Budget>}
 */
export const BUDGETS = {
  content: {
    preJsGz: 11 * KB,
    // Theme + Zag chrome JS after every widget is touched, Pagefind excluded (D-Z2 ≤ 90 kB; Spec Delta
    // MODIFIED C-110, amended): Pagefind has its own cap, PAGEFIND_GZ_MAX.
    postJsGz: 64 * KB,
    totalBytes: 147 * KB,
    domElements: 800,
    heapMB: 4,
  },
  showcase: {
    preJsGz: 19 * KB,
    postJsGz: 93 * KB,
    totalBytes: 161 * KB,
    domElements: 1300,
    heapMB: 5,
  },
  // Story pages (Spec Delta ADDED C-110 `story`, C-125): ratcheted from the showcase ceiling by the
  // gate (2026-09-30, 117 pages): lhci script 10,902 B (dependency-explorer/states), e2e postJs
  // 66,397 B (command-bar/demo), lhci 117,541 B (toc/default), 889 elements (keyboard), 3.39 MiB.
  story: {
    preJsGz: 13 * KB,
    postJsGz: 75 * KB,
    totalBytes: 133 * KB,
    domElements: 1100,
    heapMB: 4,
  },
};

/**
 * Per-page `preJsGz` caps (Spec Delta, MODIFIED C-110): a showcase page whose first viewport holds
 * a `visible` component starts it without input (C-104), so its machine counts before input.
 * Cap = measured × 1.15, rounded up to 1 KiB, from the larger of the two gates' measurements:
 * Toc 23,373 B (budgets e2e, gzip of bodies) and 29,290 B (lhci script transfer size, headers
 * included, 19 requests) after the glue split → 33 KiB; Z13 ratchet: 27,187 B lhci → 31 KiB. The Toc
 * story pages carry the same cap (Spec Delta ADDED C-110): the doc page's first canvas loads the
 * default one, and every story page shows its Toc in the first viewport; ratcheted from 25,033 B lhci
 * (both) → 29 KiB.
 * @type {Readonly<Record<string, number>>}
 */
export const PRE_JS_VISIBLE = {
  '/docs/components/toc/': 31 * KB,
  '/docs/stories/toc/default/': 29 * KB,
  '/docs/stories/toc/states/': 29 * KB,
};

/**
 * The budget of one gated page: its class budget, with a `PRE_JS_VISIBLE` cap if it has one.
 * @param {string} path
 * @returns {Budget}
 */
export function budgetOf(path) {
  const budget = BUDGETS[classOf(path)];
  const pre = PRE_JS_VISIBLE[path];
  return pre === undefined ? budget : { ...budget, preJsGz: pre };
}

/**
 * One pathname pattern per class (regex source, anchored at the path start). The root site's pages
 * (landing, hubs, install, 404) are `content`: a new site page matches no class until it is listed here.
 * @type {Record<PageClass, string>}
 */
export const CLASS_PATTERNS = {
  showcase: '^/docs/components/',
  story: '^/docs/stories/',
  content: '^(?:/docs/(?:probe/[^/]+/|404\\.html|previews/)?|/|/integrations/|/apps/|/install/|/404\\.html)$',
};

/** Default docs tree of the Starlight example. */
export const DOCS_DIR = fileURLToPath(new URL('../examples/starlight/src/content/docs/', import.meta.url));

/** Built output of the root site. */
export const SITE_DIST = fileURLToPath(new URL('../site/dist/', import.meta.url));

/** Story sources of the Starlight example (C-125), one page each at `/docs/stories/<id>/`. */
export const STORIES_DIR = fileURLToPath(new URL('../examples/starlight/src/stories/', import.meta.url));

/**
 * The page class of a gated pathname. Throws when no class or more than one
 * class matches, so a page outside every pattern fails the unit test.
 * @param {string} path pathname, e.g. `/docs/components/code/`
 * @returns {PageClass}
 */
export function classOf(path) {
  const hits = /** @type {PageClass[]} */ (Object.keys(CLASS_PATTERNS)).filter((c) =>
    new RegExp(CLASS_PATTERNS[c]).test(path),
  );
  if (hits.length !== 1) throw new Error(`classOf(${path}): matches ${hits.length} classes (${hits.join(', ')})`);
  return /** @type {PageClass} */ (hits[0]);
}

/**
 * Route of one docs source file (relative to the docs dir, `/` separators).
 * `404.md` is Starlight's static `404.html`.
 * ponytail: file names here are already slugs; mirror Starlight's slugify if a page ever needs it.
 * @param {string} rel e.g. `components/code.md`
 */
export function routeOf(rel) {
  const stem = rel.replace(/\.mdx?$/, '');
  if (stem === '404') return '/docs/404.html';
  const path = stem === 'index' ? '' : stem.replace(/\/index$/, '');
  return `/docs/${path ? `${path}/` : ''}`;
}

/**
 * Every gated page (D-Z15, C-125): each `.md`/`.mdx` under the docs dir except `samples/**`, plus
 * one story page per `.mdx` under the stories dir, as a sorted route list.
 * @param {string} [docsDir]
 * @param {string} [storiesDir]
 * @returns {string[]}
 */
export function examplePages(docsDir = DOCS_DIR, storiesDir = STORIES_DIR) {
  /** @param {string} dir */
  const files = (dir) =>
    existsSync(dir) ? readdirSync(dir, { recursive: true, encoding: 'utf8' }).map((f) => f.split('\\').join('/')) : [];
  const docs = files(docsDir)
    .filter((f) => /\.mdx?$/.test(f) && !f.startsWith('samples/'))
    .map(routeOf);
  const stories = files(storiesDir)
    .filter((f) => f.endsWith('.mdx'))
    .map((f) => storyRoute(f.slice(0, -'.mdx'.length)));
  return [...docs, ...stories].sort();
}

/**
 * Every HTML page of the built root site as a sorted route list (`index.html` → `/`, `x/index.html`
 * → `/x/`, `404.html` as itself). Throws `missing dist: <dir>` like `scripts/require-dist.mjs`.
 * @param {string} [distDir]
 * @returns {string[]}
 */
export function sitePages(distDir = SITE_DIST) {
  if (!existsSync(distDir)) throw new Error('missing dist: site/dist');
  return readdirSync(distDir, { recursive: true, encoding: 'utf8' })
    .map((f) => f.split('\\').join('/'))
    .filter((f) => f.endsWith('.html'))
    .map((f) => (f === 'index.html' ? '/' : `/${f.replace(/index\.html$/, '')}`))
    .sort();
}
