/** @typedef {import('../registry.mjs').Nav} Nav */
/**
 * Every root-relative `href`/`src`/`srcset` URL referenced by `html`, hash and query
 * stripped, HTML-entity decoded (`&amp;`), dot segments and `\` resolved as a browser would,
 * not percent-decoded. Non-root-relative, protocol-relative (`//`, `/\`) and `data:` values
 * are excluded.
 * @param {string} html
 * @returns {string[]}
 */
export function linkTargets(html: string): string[];
/**
 * Whether the root claim `/` owns public path `p` (R5): `/`, a top-level file, or a path
 * under a `ROOT_DIRS` entry (`/_astro` itself counts as top-level).
 * @param {string} p
 * @returns {boolean}
 */
export function rootAllows(p: string): boolean;
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
export function linkProblem(nav: Nav, repo: string, ownPath: string, target: string, exists: (distRelPath: string) => boolean): string | undefined;
export type Nav = import("../registry.mjs").Nav;
