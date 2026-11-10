#!/usr/bin/env node
/**
 * Fails when the render-blocking stylesheets every page of a built site loads grow past their ceiling
 * (`SHARED_SHEET_GZ`, tests/budgets.mjs). Issue #38: this sheet is what every consumer page pays before first paint.
 * The Starlight example dist is measured on `probe/long/` (all its blocking sheets but Expressive Code's `ec.*.css`
 * and print sheets), the root site on the sheets `/` and `/team/` share. A dist with neither page is skipped; zero
 * dists is a FAIL, not a silent pass.
 *
 * Usage: node scripts/css/shared-sheet.mjs <dist...>
 */
import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { SHARED_SHEET_GZ } from '../../tests/budgets.mjs';

/** The render-blocking stylesheet file names of an HTML document (no print sheets). @param {string} html */
export const blockingSheets = (html) =>
  [...html.matchAll(/<link\b[^>]*>/g)]
    .map(([tag]) => tag)
    .filter((tag) => /\brel="stylesheet"/.test(tag) && !/\bmedia="print"/.test(tag))
    .map((tag) => /\bhref="([^"]+)"/.exec(tag)?.[1] ?? '')
    .filter(Boolean);

/**
 * The shared sheets of a dist and their summed gzip size, or null when it is neither site.
 * @param {string} dist
 * @returns {{ kind: 'starlight' | 'site', sheets: string[], gz: number } | null}
 */
export const sharedSheets = (dist) => {
  /** @param {string} page */
  const read = (page) => (existsSync(join(dist, page)) ? blockingSheets(readFileSync(join(dist, page), 'utf8')) : null);
  const long = read('probe/long/index.html');
  const home = read('index.html');
  const team = read('team/index.html');
  /** @type {'starlight' | 'site'} */
  let kind;
  /** @type {string[]} */
  let hrefs;
  if (long) {
    kind = 'starlight';
    hrefs = long.filter((h) => !/^ec\.[\w-]+\.css$/.test(basename(h)));
  } else if (home && team) {
    kind = 'site';
    hrefs = home.filter((h) => team.includes(h));
  } else return null;
  const sheets = hrefs.map((href) => {
    const file = [join(dist, href.replace(/^\/docs\//, '')), join(dist, href)].find((f) => existsSync(f));
    if (!file) throw new Error(`${dist}: ${href} is linked but not built`);
    return { href, gz: gzipSync(readFileSync(file)).length };
  });
  return { kind, sheets: sheets.map((s) => `${basename(s.href)} ${s.gz} B`), gz: sheets.reduce((n, s) => n + s.gz, 0) };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const dists = process.argv.slice(2);
  if (dists.length === 0) {
    console.error('shared-sheet: no dist given (empty match is a FAIL)');
    process.exit(1);
  }
  let bad = 0;
  for (const dist of dists) {
    const r = sharedSheets(dist);
    if (!r) continue;
    const max = SHARED_SHEET_GZ[r.kind];
    console.log(`${dist}: shared sheet ${r.gz} B gzip (ceiling ${max}): ${r.sheets.join(', ')}`);
    if (r.gz > max) {
      bad++;
      console.log(
        `${dist}: the shared sheet grew ${r.gz - max} B past its ceiling. Move rules into the sheet of the component that needs them, ` +
          'or raise SHARED_SHEET_GZ in tests/budgets.mjs with a Spec Delta row (issue #38).',
      );
    }
  }
  process.exit(bad ? 1 : 0);
}
