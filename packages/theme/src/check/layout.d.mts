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
export function layoutProblem(nav: Nav, repo: string, ownPath: string, distRelFile: string): string | undefined;
export type Nav = import("../registry.mjs").Nav;
