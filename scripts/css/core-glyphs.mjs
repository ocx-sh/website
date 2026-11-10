#!/usr/bin/env node
/**
 * Fails when a built page's text contains a character that Plex only has in its on-demand "rest" files
 * (REST_RANGE): that page would fetch a second font request, and the core list in
 * packages/theme/scripts/generate-fonts.mjs should grow deliberately instead. Characters in neither
 * range (emoji, CJK, arrows Plex lacks) are fine: they never were Plex. Prints page, codepoint and
 * character; exit 1. Zero dirs is a FAIL, not a silent pass.
 *
 * Scans element text, painted attributes (input value and placeholder, option label), template content and
 * the `content:` strings of built stylesheets.
 *
 * Usage: node scripts/css/core-glyphs.mjs <dist...>
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodeHTML } from 'entities';
import { REST_RANGE } from '../../packages/theme/src/fonts/plex.generated.mjs';

/** @param {string} range @returns {[number, number][]} */
const parse = (range) =>
  range.split(',').map((p) => {
    const [a, b = a] = p
      .replace(/U\+/g, '')
      .split('-')
      .map((h) => parseInt(h, 16));
    return /** @type {[number, number]} */ ([a, b]);
  });
const REST = parse(REST_RANGE);
/**
 * The text a page paints in its font: element text (template content included, it is cloned into the page),
 * plus the attributes the browser draws as text (input value and placeholder, option and optgroup label).
 * Entities are decoded in full. @param {string} html
 */
export const textOf = (html) => {
  const body = html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
  const painted = [...body.matchAll(/<(input|option|optgroup)\b[^>]*>/gi)].flatMap(([tag, name]) =>
    [...tag.matchAll(/\s(placeholder|value|label)=(?:"([^"]*)"|'([^']*)')/gi)]
      .filter(([, attr]) => (name?.toLowerCase() === 'input' ? attr !== 'label' : attr?.toLowerCase() === 'label'))
      .map((m) => m[2] ?? m[3] ?? ''),
  );
  return decodeHTML([body.replace(/<[^>]*>/g, ' '), ...painted].join(' '));
};

/** Decoded `content: "..."` strings of a stylesheet (CSS escapes resolved). @param {string} css */
export const cssContent = (css) =>
  [...css.matchAll(/content\s*:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g)].map(([, str]) =>
    (str ?? '')
      .slice(1, -1)
      .replace(
        /\\([0-9a-f]{1,6})\s?|\\(.)/gi,
        (/** @type {string} */ _, /** @type {string | undefined} */ hex, /** @type {string} */ ch) =>
          hex ? String.fromCodePoint(parseInt(hex, 16)) : ch,
      )
      .replace(/\\\n/g, ''),
  );

/** The distinct rest characters of a text. @param {string} text */
export const restChars = (text) =>
  [...new Set(text)].filter((ch) => {
    const c = ch.codePointAt(0) ?? 0;
    return REST.some(([lo, hi]) => c >= lo && c <= hi);
  });

/** Pages that need a rest character on purpose: the fixture tests/e2e/fonts.spec.ts loads the rest files with. */
export const ALLOWED = /[\\/]probe[\\/]glyphs[\\/]index\.html$/;

/** @param {string} dir @param {string} ext @returns {string[]} */
const filesOf = (dir, ext) =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? filesOf(join(dir, e.name), ext) : e.name.endsWith(ext) ? [join(dir, e.name)] : [],
      )
    : [];

if (import.meta.url === `file://${process.argv[1]}`) {
  const dists = process.argv.slice(2);
  if (dists.length === 0) {
    console.error('core-glyphs: no dist given (empty match is a FAIL)');
    process.exit(1);
  }
  let bad = 0;
  /** @param {string} file @param {string} text */
  const report = (file, text) => {
    for (const ch of restChars(text)) {
      bad++;
      console.log(
        `${file}: U+${(ch.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')} ${JSON.stringify(ch)} is outside the core font; add it to CORE_WANTED in generate-fonts.mjs`,
      );
    }
  };
  for (const file of dists.flatMap((d) => filesOf(d, '.html')).filter((f) => !ALLOWED.test(f)))
    report(file, textOf(readFileSync(file, 'utf8')));
  for (const file of dists.flatMap((d) => filesOf(d, '.css')))
    report(file, cssContent(readFileSync(file, 'utf8')).join(' '));
  process.exit(bad ? 1 : 0);
}
