// C-013 link check: pure string/regex scanning, no DOM dependency.

import { claimFor, ROOT_DIRS } from '../registry.mjs';

// ponytail: regex attribute scan, not an HTML parser; it also matches inside comments and
// <script> text, which only ever adds targets to check. Swap for a parser if that bites.
const ATTR = /(?:^|\s)(href|src|srcset)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi;

/** @typedef {import('../registry.mjs').Nav} Nav */

/**
 * Every root-relative `href`/`src`/`srcset` URL referenced by `html`, hash and query
 * stripped, HTML-entity decoded (`&amp;`), dot segments and `\` resolved as a browser would,
 * not percent-decoded. Non-root-relative, protocol-relative (`//`, `/\`) and `data:` values
 * are excluded.
 * @param {string} html
 * @returns {string[]}
 */
export function linkTargets(html) {
  /** @type {string[]} */
  const out = [];
  for (const m of html.matchAll(ATTR)) {
    const value = (m[2] ?? m[3] ?? m[4] ?? '').replaceAll('&amp;', '&');
    const urls =
      m[1]?.toLowerCase() === 'srcset'
        ? value
            .replace(/data:\S*/g, '')
            .split(',')
            .map((c) => c.trim().split(/\s+/)[0] ?? '')
        : [value.trim()];
    for (const url of urls) {
      if (!url.startsWith('/')) continue;
      // Resolve `..`, `.`, `%2e%2e` and `\` like a browser; a host change means it was protocol-relative.
      const u = new URL(url, 'http://x');
      if (u.host === 'x') out.push(u.pathname);
    }
  }
  return out;
}

/**
 * Whether the root claim `/` owns public path `p` (R5): `/`, a top-level file, or a path
 * under a `ROOT_DIRS` entry (`/_astro` itself counts as top-level).
 * @param {string} p
 * @returns {boolean}
 */
export function rootAllows(p) {
  return p === '/' || /^\/[^/]+$/.test(p) || ROOT_DIRS.some((d) => p.startsWith(d));
}

/**
 * The C-013 problem for link `target` found in the HTML file at `ownPath`'s repo, or
 * `undefined` when the link is allowed.
 * @param {Nav} nav
 * @param {string} repo `ocx-sh/<name>`, the repo whose dist is being checked
 * @param {string} ownPath the claim path this dist deploys under
 * @param {string} target a root-relative URL from {@link linkTargets}
 * @param {(distRelPath: string) => boolean} exists tests whether a dist-relative path is a
 *   file (or a directory with `index.html`); the path is percent-decoded before this call
 * @returns {string | undefined}
 */
export function linkProblem(nav, repo, ownPath, target, exists) {
  const claim = claimFor(nav, target);
  if (!claim) return `C-013: ${target} is under no claim`;
  if (claim.path === '/' && !rootAllows(target)) return `C-013: ${target} is a directory the root claim does not own`;
  const own = target.startsWith(ownPath) || target === ownPath.slice(0, -1);
  if (claim.repo !== repo || !own) return undefined;
  let rel;
  try {
    rel = decodeURIComponent(target.slice(ownPath.length));
  } catch {
    return `C-013: ${target} is not a valid percent-encoded URL`;
  }
  // `%2f..%2f` survives URL normalisation and decodes into a dot segment; never leave dist.
  if (rel.split(/[\\/]/).includes('..')) return `C-013: ${target} escapes dist`;
  return exists(rel) ? undefined : `C-013: ${target} does not exist in dist`;
}
