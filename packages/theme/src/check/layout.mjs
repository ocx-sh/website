// C-014 layout check.

import { claimFor } from '../registry.mjs';
import { rootAllows } from './links.mjs';

/** @typedef {import('../registry.mjs').Nav} Nav */

/**
 * The C-014 problem for `distRelFile` (a dist-relative posix path) under the claim
 * `ownPath`, owned by `repo`, or `undefined` when it is allowed.
 * @param {Nav} nav
 * @param {string} repo `ocx-sh/<name>`, the repo whose dist is being checked
 * @param {string} ownPath the claim path this dist deploys under
 * @param {string} distRelFile a file path relative to the dist root, posix separators
 * @returns {string | undefined}
 */
export function layoutProblem(nav, repo, ownPath, distRelFile) {
  const pub = ownPath + distRelFile;
  const claim = claimFor(nav, pub);
  if (claim?.repo !== repo) return `C-014: ${pub} is not under a claim owned by ${repo}`;
  if (claim.path === '/' && !rootAllows(pub)) return `C-014: ${pub} is a directory the root claim does not own`;
  return undefined;
}
