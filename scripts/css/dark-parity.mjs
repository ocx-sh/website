#!/usr/bin/env node
/**
 * Asserts every colour token declared in the dark scope also appears in the default scope and vice versa (light-dark() skipped, geometry allowlisted) across the given .css files and inline <style> of .html files; exit 1 on asymmetry. Zero paths (empty match) is a FAIL, not a silent pass: exit 1.
 *
 * Usage: node scripts/css/dark-parity.mjs <path...>
 * Contract C-029 (see .claude/rules/css-theming/gate.md and design §7).
 */
import { readFileSync } from 'node:fs';

// ponytail: only the theme's own tokens; Starlight/Pagefind/EC scheme their --sl-*/--pagefind-*/--ec-* their own way.
const OWNED = /^--ocx-/;
// Geometry and other non-colour tokens are declared once, in the default scope: a token is checked only
// if its name says colour or its value carries a colour literal.
const COLOUR = /color|#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|oklch\(/;
const DEFAULT = /^(:root|:root\[data-theme=['"]?light['"]?\])$/;
const DARK = /^(\.dark|:root\[data-theme=['"]?dark['"]?\]|\[data-theme=['"]?dark['"]?\])$/;

/** @param {string} p */
const css = (p) => {
  const src = readFileSync(p, 'utf8');
  return p.endsWith('.html') ? [...src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n') : src;
};

const paths = process.argv.slice(2);
if (paths.length === 0) {
  console.error('dark-parity: no files given (empty match is a FAIL)');
  process.exit(1);
}
const NAME = { light: 'default', dark: 'dark' };
let bad = false;
let found = false;
for (const p of paths) {
  /** @type {Record<'light' | 'dark', Set<string>>} */
  const scope = { light: new Set(), dark: new Set() };
  for (const [, sel = '', body = ''] of css(p).matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    const items = sel.split(',').map((s) => s.trim());
    const kind = items.every((s) => DARK.test(s)) ? 'dark' : items.every((s) => DEFAULT.test(s)) ? 'light' : null;
    if (!kind) continue;
    for (const [, name = '', value = ''] of body.matchAll(/(--[\w-]+)\s*:([^;]*)/g)) {
      if (OWNED.test(name) && COLOUR.test(name + value) && !value.includes('light-dark(')) scope[kind].add(name);
    }
  }
  if (scope.light.size || scope.dark.size) found = true;
  for (const [from, to] of /** @type {const} */ ([
    ['dark', 'light'],
    ['light', 'dark'],
  ])) {
    for (const t of scope[from]) {
      if (!scope[to].has(t)) {
        console.log(`${p}: ${t} declared in the ${NAME[from]} scope but not the ${NAME[to]} scope`);
        bad = true;
      }
    }
  }
}
if (!found) {
  console.error('dark-parity: no --ocx- colour token in any default or dark scope (no scope detected is a FAIL)');
  process.exit(1);
}
process.exit(bad ? 1 : 0);
