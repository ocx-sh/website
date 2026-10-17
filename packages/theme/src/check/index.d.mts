/** @typedef {import('../registry.mjs').Nav} Nav */
/** @typedef {{ file: string, problem: string }} CheckProblem */
/**
 * Every C-012/C-013/C-014/C-070 problem found in `dist` for `repo` deployed at `path`,
 * sorted by file then problem. Reads the dist tree with `node:fs`.
 *
 * `path` defaults to {@link defaultPath}. Before scanning `dist`, this validates the
 * repo's claim: if `repo` owns no claim (C-012), or `path` is not one of
 * `claimsOf(nav, repo)`, the dist scan is skipped and the single `nav.json` problem is
 * returned instead — the first names how to claim a path with a PR to `ocx-sh/website`
 * adding `{ path, repo, search }` to `claims` in `packages/theme/src/nav.json`; the second
 * lists the repo's claims.
 * @param {object} options
 * @param {string} options.dist absolute or cwd-relative path to the dist directory
 * @param {Nav} options.nav
 * @param {string} options.repo `ocx-sh/<name>`
 * @param {string} [options.path] the claim path this dist deploys under; defaults to
 *   {@link defaultPath}
 * @returns {CheckProblem[]}
 */
export function check(options: {
    dist: string;
    nav: Nav;
    repo: string;
    path?: string | undefined;
}): CheckProblem[];
/**
 * The claim path `repo` deploys to when `--path` is omitted: its only claim, else its
 * shortest one (deploy action §3.2); `undefined` if it owns none (C-012).
 * @param {Nav} nav
 * @param {string} repo `ocx-sh/<name>`
 * @returns {string | undefined}
 */
export function defaultPath(nav: Nav, repo: string): string | undefined;
export type Nav = import("../registry.mjs").Nav;
export type CheckProblem = {
    file: string;
    problem: string;
};
