#!/usr/bin/env node
/**
 * Fails when a component stylesheet that must stay inlined shows up as an external `_astro/<Name>.<hash>.css` in a dist: past the Starlight plugin's inline-CSS cap it becomes one more render-blocking request (Lighthouse performance 0.99). Prints each such file; exit 1. Zero dirs is a FAIL, not a silent pass.
 *
 * Usage: node scripts/css/inlined-sheets.mjs <dist...>
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Components whose sheet is held under the inline cap. */
export const INLINED = ['Skeleton', 'ShellSession'];

/** The external sheets of `INLINED` components in a dist's `_astro/`. @param {string} dist */
export const externalSheets = (dist) => {
  const dir = join(dist, '_astro');
  const re = new RegExp(`^(${INLINED.join('|')})\\.[\\w-]+\\.css$`);
  return existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => re.test(f))
        .map((f) => join(dir, f))
    : [];
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const dists = process.argv.slice(2);
  if (dists.length === 0) {
    console.error('inlined-sheets: no dist given (empty match is a FAIL)');
    process.exit(1);
  }
  const bad = dists.flatMap(externalSheets);
  for (const f of bad) console.log(`${f}: must stay inlined, got an external stylesheet`);
  process.exit(bad.length ? 1 : 0);
}
