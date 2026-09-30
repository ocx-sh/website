// The ocx.sh path registry: pure functions over nav.json v4. No I/O, no imports.
// Shape is checked by nav.schema.json; validate() owns every cross-reference rule.

/** @typedef {{ wordmark: string, href: string }} Brand */
/** @typedef {{ id: string, label: string, href: string }} LinkSection */
/** @typedef {{ id: string, label: string, hubs: string[] }} MenuSection */
/** @typedef {LinkSection | MenuSection} Section */
/** @typedef {{ id: string, label: string }} Category */
/**
 * @typedef {object} Hub
 * @property {string} id
 * @property {string} label
 * @property {string} href mount point, a claim path
 * @property {string} blurb default text of the menu detail strip
 * @property {string} all label of the "see all" link
 * @property {Category[]} categories at most 4
 */
/**
 * @typedef {object} Claim
 * @property {string} path path prefix the repo deploys, per the §1.1 grammar
 * @property {string} repo `ocx-sh/<name>`
 * @property {boolean} search ships its own Pagefind index
 */
/**
 * @typedef {object} Entry
 * @property {string} id unique per hub
 * @property {string} hub
 * @property {string} category
 * @property {string} label
 * @property {string} meta short mono tag
 * @property {string} desc at most 60 chars
 * @property {string} [href] a claim path or an `https:` URL; absent iff planned
 * @property {boolean} [planned]
 */
// ponytail: `version` and `kind` are widened to what a JSON import infers (number, string)
// so `import nav from './nav.json'` type-checks as Nav; the schema pins 4 and the enum.
// Permanent: narrowing them later breaks consumers that annotate a JSON import as Nav (OW5).
// Compare `kind` at runtime.
/** @typedef {{ id: string, label: string, href: string, kind: string }} Action */
/** @typedef {{ label: string, href: string }} FooterLink */
/**
 * @typedef {object} Nav
 * @property {string} [$schema]
 * @property {number} version always 4 (schema const)
 * @property {Brand} brand
 * @property {Section[]} sections
 * @property {Hub[]} hubs
 * @property {Claim[]} claims
 * @property {Entry[]} entries
 * @property {Action[]} actions
 * @property {FooterLink[]} footer
 */
/**
 * A rule violation. `at` locates it (`claims[3].path`); `message` names the rule (`R4: …`).
 * @typedef {{ at: string, message: string }} Problem
 */
/**
 * A search index to merge into the local Pagefind instance.
 * @typedef {{ path: string, label: string }} MergeTarget
 */

/** Directories the root claim `/` owns besides `/` itself and top-level files (R5). */
export const ROOT_DIRS = Object.freeze(/** @type {const} */ (['/_astro/', '/pagefind/']));

const TOPS = new Set(['docs', 'catalog', 'install', 'schemas', 'integrations', 'apps']);
const HUBS = new Set(['integrations', 'apps']);
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const REPO = /^ocx-sh\/[A-Za-z0-9._-]+$/;
const RESERVED = new Set([
  '_astro',
  'pagefind',
  'artifactory',
  'bunnycdn_errors',
  '.well-known',
  'api',
  'lore',
  'team',
  'preview',
]);
const reserved = (/** @type {string} */ seg) => RESERVED.has(seg) || /^v\d+(\.\d+)?$/.test(seg);

/**
 * The §1.1 / R-rule problem with one claim path, or `undefined` when it is valid.
 * @param {string} path
 * @returns {string | undefined}
 */
function pathProblem(path) {
  if (!/^\/([\x21-\x7e]*\/)?$/.test(path) || path !== path.toLowerCase())
    return 'R1: path must start and end with "/" and be lowercase ASCII';
  const segs = path === '/' ? [] : path.slice(1, -1).split('/');
  const bad = segs.find(reserved);
  if (bad !== undefined) return `R8: "${bad}" is reserved`;
  const [top, slug] = segs;
  if (segs.length > 2 || (slug !== undefined && !HUBS.has(top ?? '')))
    return 'R4: a claim nests only directly under a hub claim';
  if (top !== undefined && !TOPS.has(top)) return `R1: "${top}" is not a top-level segment`;
  if (slug !== undefined && !(SLUG.test(slug) && slug.length <= 32))
    return `R1: "${slug}" is not a slug (a-z0-9 words joined by "-", ≤ 32 chars)`;
  return undefined;
}

/**
 * Every rule violation in `nav` (C-002…C-006); empty when valid.
 * @param {Nav} nav shape-valid registry
 * @returns {Problem[]}
 */
export function validate(nav) {
  /** @type {Problem[]} */
  const problems = [];
  /** @type {(at: string, message: string) => void} */
  const add = (at, message) => void problems.push({ at, message });
  const claimed = new Set(nav.claims.map((c) => c.path));

  /** @type {Map<string, number>} */
  const seenPath = new Map();
  /** @type {Map<string, string>} */
  const zoneRepo = new Map();
  nav.claims.forEach((c, i) => {
    const problem = pathProblem(c.path);
    if (problem) add(`claims[${i}].path`, problem);
    const first = seenPath.get(c.path);
    if (first !== undefined) add(`claims[${i}].path`, `C-004: "${c.path}" already claimed by claims[${first}]`);
    else seenPath.set(c.path, i);
    if (!REPO.test(c.repo)) add(`claims[${i}].repo`, `C-005: repo "${c.repo}" must match ocx-sh/<name>`);
    const zone = zoneName(c.repo);
    const other = zoneRepo.get(zone);
    if (other !== undefined && other !== c.repo)
      add(`claims[${i}].repo`, `C-005: "${c.repo}" and "${other}" share zone ${zone}`);
    else zoneRepo.set(zone, c.repo);
  });

  /** @type {(at: string, href: string) => void} */
  const internal = (at, href) => {
    if (href.startsWith('/') && !claimed.has(href)) add(at, `C-006: internal href "${href}" is not a claim path`);
  };
  internal('brand.href', nav.brand.href);
  nav.actions.forEach((a, i) => internal(`actions[${i}].href`, a.href));

  const hubIds = new Set(nav.hubs.map((h) => h.id));
  /** @type {Map<string, number>} */
  const hubUses = new Map();
  nav.sections.forEach((s, i) => {
    if ('href' in s) return internal(`sections[${i}].href`, s.href);
    s.hubs.forEach((h, j) => {
      if (!hubIds.has(h)) add(`sections[${i}].hubs[${j}]`, `C-006: unknown hub "${h}"`);
      hubUses.set(h, (hubUses.get(h) ?? 0) + 1);
    });
  });
  nav.hubs.forEach((h, i) => {
    internal(`hubs[${i}].href`, h.href);
    if (hubUses.get(h.id) !== 1) add(`hubs[${i}]`, `C-006: hub "${h.id}" must appear in exactly one section`);
    if (h.categories.length > 4) add(`hubs[${i}].categories`, `C-006: hub "${h.id}" has more than 4 categories`);
  });

  const ids = /** @type {Set<string>} */ (new Set());
  nav.entries.forEach((e, i) => {
    const at = `entries[${i}]`;
    const hub = nav.hubs.find((h) => h.id === e.hub);
    if (!hub) add(`${at}.hub`, `C-006: unknown hub "${e.hub}"`);
    else if (!hub.categories.some((c) => c.id === e.category))
      add(`${at}.category`, `C-006: "${e.category}" is not a category of hub "${e.hub}"`);
    const key = `${e.hub}/${e.id}`;
    if (ids.has(key)) add(`${at}.id`, `C-006: id "${e.id}" is not unique in hub "${e.hub}"`);
    ids.add(key);
    if ((e.planned === true) === (e.href !== undefined)) add(at, 'C-006: an entry has an href iff it is not planned');
    if (e.href !== undefined) {
      internal(`${at}.href`, e.href);
      if (!e.href.startsWith('/') && !e.href.startsWith('https://'))
        add(`${at}.href`, `C-006: external href "${e.href}" must be https:`);
    }
    if (e.desc.length > 60) add(`${at}.desc`, 'C-006: desc exceeds 60 chars');
  });

  const labels = /** @type {Set<string>} */ (new Set());
  for (const t of mergeTargets(nav, '')) {
    if (labels.has(t.label)) add('claims', `C-006: search label "${t.label}" is not unique`);
    labels.add(t.label);
  }
  return problems;
}

/**
 * The claim owning `path`: the longest claim path that prefixes it (`/` matches everything).
 * A path without its trailing slash matches its claim too (`/docs` → `/docs/`, F2).
 * @param {Nav} nav
 * @param {string} path
 * @returns {Claim | undefined}
 */
export function claimFor(nav, path) {
  /** @type {Claim | undefined} */
  let best;
  for (const c of nav.claims) {
    const owns = path.startsWith(c.path) || path === c.path.slice(0, -1);
    if (owns && c.path.length > (best?.path.length ?? -1)) best = c;
  }
  return best;
}

/**
 * Every claim deployed by `repo`, in `claims` order.
 * @param {Nav} nav
 * @param {string} repo `ocx-sh/<name>`
 * @returns {Claim[]}
 */
export function claimsOf(nav, repo) {
  return nav.claims.filter((c) => c.repo === repo);
}

/**
 * The Bunny storage zone of `repo` (R7): `ocx-sh/rules_ocx` → `sh-ocx-web-rules-ocx`.
 * @param {string} repo
 * @returns {string}
 */
export function zoneName(repo) {
  return `sh-ocx-web-${repo
    .replace(/^ocx-sh\//, '')
    .toLowerCase()
    .replace(/[._]/g, '-')}`;
}

/**
 * Every `search: true` claim except `ownPath`, in `claims` order, labelled by the
 * entry, section or hub linking to it, else the brand wordmark.
 * @param {Nav} nav
 * @param {string} ownPath claim path of the calling site
 * @returns {MergeTarget[]}
 */
export function mergeTargets(nav, ownPath) {
  /** @type {(path: string) => string} */
  const label = (path) =>
    nav.entries.find((e) => e.href === path)?.label ??
    nav.sections.find((s) => 'href' in s && s.href === path)?.label ??
    nav.hubs.find((h) => h.href === path)?.label ??
    nav.brand.wordmark;
  return nav.claims.filter((c) => c.search && c.path !== ownPath).map((c) => ({ path: c.path, label: label(c.path) }));
}
