#!/usr/bin/env node
/**
 * Prints every rule outside a cascade layer (any `@layer <name>`, brace-matched) in the given .css files and the inline <style> bodies of the given .html files. Empty output + exit 0 is the pass; exit 1 on any leaked rule not in the allowlist. Zero paths (empty match) is a FAIL, not a silent pass: exit 1.
 *
 * Usage: node scripts/css/outside-layers.mjs <path...>
 * Contract C-029 (see .claude/rules/css-theming/gate.md and design §7).
 */
import { readFileSync } from 'node:fs';

/** Files whose leaks are not ours, each with a reason. @type {{ file: RegExp, reason: string }[]} */
const ALLOW = [
  { file: /\/pagefind\//, reason: 'Pagefind ships its own UI CSS into dist; Starlight never links it' },
  {
    file: /\/_astro\/print\.[\w-]+\.css$/,
    reason: "Starlight's print sheet: unlayered upstream --sl-* overrides under @media print",
  },
  {
    file: /\/probe\/cascade\//,
    reason: 'C-028 cascade probe page: an unlayered consumer rule with identity-encoded literal colours, by design',
  },
];
// Rules Starlight itself ships unlayered, matched per rule because Vite bundles them into the
// same common.*.css as the theme (file-level scoping would hide theme leaks too).
/** @type {{ rule: RegExp, reason: string }[]} */
const UPSTREAM = [
  {
    rule: /@media \(width>=\d+em\)\{(?::where\(\.astro-\w+\)\[data-has-sidebar\]\{--sl-content-inline-start:[^;}]*;?\}|html\{scroll-padding-top:[^;}]*;?\})\}|html:not\(\[data-has-(?:toc|sidebar)\]\)\{--sl-[\w-]+:[^;}]*;?\}|html\{scroll-padding-top:[^;}]*;?\}|main:where\(\.astro-\w+\)\{padding:var\(--sl-main-pad\)\}/g,
    reason: 'Starlight components/Page.astro <style>: unlayered upstream (@astrojs/starlight 0.42)',
  },
  {
    rule: /:root\{--ocx-font-(?:sans|mono):"IBM Plex (?:Sans|Mono)-[0-9a-f]+"[^}]*\}/g,
    reason: 'Astro Fonts API <Font> inline style: always unlayered; binds the font tokens to the hashed faces',
  },
];
// Not layerable: legal outside a layer, always.
const IGNORE =
  /^\s*(@(property|font-face|charset|import|namespace)\b[^{]*\{[^}]*\}|@(property|font-face|charset|import|namespace)\b[^;]*;|@layer\s+[^{;]*;|\/\*[\s\S]*?\*\/)/;

/** @param {string} p */
const css = (p) => {
  const src = readFileSync(p, 'utf8');
  return p.endsWith('.html') ? [...src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n') : src;
};

/** @param {string} src */
function leaked(src) {
  let out = '';
  for (let i = 0; i < src.length;) {
    const rest = src.slice(i);
    const skip = rest.match(IGNORE);
    if (skip) {
      i += skip[0].length;
      continue;
    }
    const layer = rest.match(/^\s*@layer\s+[\w.-]+\s*\{/);
    if (layer) {
      let depth = 1;
      let j = i + layer[0].length;
      // brace-match, not regex. ponytail: a brace inside a string literal desyncs it; allowlist that file.
      while (j < src.length && depth > 0) {
        if (src[j] === '{') depth++;
        else if (src[j] === '}') depth--;
        j++;
      }
      i = j;
      continue;
    }
    out += src[i++];
  }
  return out.trim();
}

const paths = process.argv.slice(2);
if (paths.length === 0) {
  console.error('outside-layers: no files given (empty match is a FAIL)');
  process.exit(1);
}
let bad = false;
for (const p of paths) {
  const allowed = ALLOW.find((a) => a.file.test(p));
  if (allowed) {
    console.error(`${p}: allowlisted (${allowed.reason})`);
    continue;
  }
  const out = UPSTREAM.reduce(
    (o, u) =>
      o.replace(u.rule, (m) => {
        console.error(`${p}: allowlisted ${m} (${u.reason})`);
        return '';
      }),
    leaked(css(p)),
  ).trim();
  if (out) {
    console.log(`${p}: ${out}`);
    bad = true;
  }
}
process.exit(bad ? 1 : 0);
