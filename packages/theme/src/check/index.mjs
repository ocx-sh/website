// `ocx-site check` logic, usable as a library (deploy action §3.3 step 2) and by the CLI.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { claimFor, claimsOf } from '../registry.mjs';
import { layoutProblem } from './layout.mjs';
import { linkProblem, linkTargets } from './links.mjs';
import { pagefindProblem } from './pagefind.mjs';

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
export function check(options) {
  const { dist, nav, repo } = options;
  const claims = claimsOf(nav, repo);
  if (claims.length === 0) {
    const problem = `${repo} owns no claim; claim one with a PR to ocx-sh/website adding { "path", "repo", "search" } to "claims" in packages/theme/src/nav.json`;
    return [{ file: 'nav.json', problem }];
  }
  const ownPath = options.path ?? defaultPath(nav, repo) ?? '';
  if (!claims.some((c) => c.path === ownPath)) {
    const problem = `${repo} does not own "${ownPath}"; its claims: ${claims.map((c) => c.path).join(', ')}`;
    return [{ file: 'nav.json', problem }];
  }

  /** @type {(rel: string) => boolean} */
  const isFile = (rel) => statSync(join(dist, rel), { throwIfNoEntry: false })?.isFile() === true;
  /** @type {(rel: string) => boolean} */
  const exists = (rel) => isFile(rel) || isFile(join(rel, 'index.html'));

  /** @type {CheckProblem[]} */
  const problems = [];
  /** @type {(file: string, problem: string | undefined) => void} */
  const add = (file, problem) => void (problem !== undefined && problems.push({ file, problem }));
  const files = readdirSync(dist, { recursive: true, encoding: 'utf8' })
    .filter(isFile)
    .map((f) => f.split(sep).join('/'));
  for (const file of files) {
    add(file, layoutProblem(nav, repo, ownPath, file));
    if (!file.endsWith('.html')) continue;
    for (const t of new Set(linkTargets(readFileSync(join(dist, file), 'utf8'))))
      add(file, linkProblem(nav, repo, ownPath, t, exists));
  }
  if (claimFor(nav, ownPath)?.search) {
    const entry = 'pagefind/pagefind-entry.json';
    add(entry, pagefindProblem(isFile(entry) ? readFileSync(join(dist, entry), 'utf8') : undefined));
  }
  /** @type {(a: string, b: string) => number} */
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  return problems.sort((a, b) => cmp(a.file, b.file) || cmp(a.problem, b.problem));
}

/**
 * The claim path `repo` deploys to when `--path` is omitted: its only claim, else its
 * shortest one (deploy action §3.2); `undefined` if it owns none (C-012).
 * @param {Nav} nav
 * @param {string} repo `ocx-sh/<name>`
 * @returns {string | undefined}
 */
export function defaultPath(nav, repo) {
  return claimsOf(nav, repo).reduce(
    (/** @type {string | undefined} */ best, c) => (best === undefined || c.path.length < best.length ? c.path : best),
    undefined,
  );
}
