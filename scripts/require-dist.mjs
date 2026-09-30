#!/usr/bin/env node
/**
 * Fails fast when an expected build output is absent: for each directory argument that does not exist, prints `missing dist: <dir>` and exits 1 (never a silent pass on zero files). A path that is not a directory is also `missing dist`; a directory with no .css or .html file anywhere below it prints `empty dist: <dir>` and exits 1. A dist older than any of its inputs (its project's `src/`, `public/` and `astro.config.mjs`, `packages/theme/src/`, `packages/theme/package.json`, `pnpm-lock.yaml`) prints `stale dist: <dir>` (e2e and lighthouse never rebuild). Exit 0 when all are fresh, non-empty dirs. Zero arguments (no expected dist) is itself a failure: exit 1.
 *
 * Usage: node scripts/require-dist.mjs <path...>
 * Contract C-071 (see .claude/rules/css-theming/gate.md and design §7).
 */
import { readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

const paths = process.argv.slice(2);
if (paths.length === 0) {
  console.error('missing dist: no expected dist given');
  process.exit(1);
}
/** @param {string} p */
const isDir = (p) => {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false; // ENOENT and friends: not a dist
  }
};
/** Newest mtime (ms) of a file or any file below a dir, 0 when absent. @param {string} dir */
const newest = (dir) => {
  let max = 0;
  try {
    if (statSync(dir).isFile()) return statSync(dir).mtimeMs;
  } catch {
    return 0;
  }
  const files = isDir(dir) ? readdirSync(dir, { recursive: true, withFileTypes: true }) : [];
  for (const f of files) if (f.isFile()) max = Math.max(max, statSync(join(f.parentPath, f.name)).mtimeMs);
  return max;
};
let bad = false;
for (const p of paths) {
  if (!isDir(p)) {
    console.error(`missing dist: ${p}`);
    bad = true;
  } else if (!readdirSync(p, { recursive: true }).some((f) => /\.(css|html)$/.test(String(f)))) {
    console.error(`empty dist: ${p}`);
    bad = true;
  } else if (
    Math.max(
      ...['src', 'public', 'astro.config.mjs'].map((f) => newest(join(dirname(p), f))),
      ...['packages/theme/src', 'packages/theme/package.json', 'pnpm-lock.yaml'].map(newest),
    ) > newest(p)
  ) {
    console.error(`stale dist: ${p} (sources changed since the build; run task build)`);
    bad = true;
  }
}
process.exit(bad ? 1 : 0);
