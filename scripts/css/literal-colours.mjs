#!/usr/bin/env node
/**
 * Prints colour literals outside a token declaration (var() fallbacks and custom-property right-hand sides stripped) in the given .css files and inline <style> of .html files. Only allowlisted third-party entries, each with a reason, may remain; exit 1 otherwise. Zero paths (empty match) is a FAIL, not a silent pass: exit 1.
 *
 * Usage: node scripts/css/literal-colours.mjs <path...>
 * Contract C-029 (see .claude/rules/css-theming/gate.md and design §7).
 */
import { readFileSync } from 'node:fs';

/** Third-party files allowed to carry literals, each with a reason. @type {{ file: RegExp, reason: string }[]} */
const ALLOW = [
  { file: /\/pagefind\//, reason: 'Pagefind ships its own UI CSS into dist; Starlight never links it' },
  {
    file: /\/_astro\/terminal-player\.[\w-]+\.css$/,
    reason: "asciinema-player's own sheet (Terminal), layered into ocx.vendor, loaded only with the player",
  },
  {
    file: /\/probe\/cascade\//,
    reason: 'C-028 cascade probe page: an unlayered consumer rule with identity-encoded literal colours, by design',
  },
];
/** Declarations allowed to carry a literal, each with a reason. @type {{ hit: RegExp, reason: string }[]} */
const ALLOW_HIT = [
  {
    hit: /^border-(bottom|left):1px solid #fff$/,
    reason: "Starlight's Pagefind search component (checkbox tick), upstream",
  },
];

/** @param {string} p */
const css = (p) => {
  const src = readFileSync(p, 'utf8');
  return p.endsWith('.html') ? [...src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n') : src;
};

const paths = process.argv.slice(2);
if (paths.length === 0) {
  console.error('literal-colours: no files given (empty match is a FAIL)');
  process.exit(1);
}
let bad = false;
for (const p of paths) {
  if (ALLOW.some((a) => a.file.test(p))) continue;
  const stripped = css(p)
    .replace(/#0000(?:0000)?\b/g, 'transparent') // the minifier encodes `transparent` as #0000; not a scheme colour
    .replace(/var\(\s*--[\w-]+\s*,[^;)]*\)/g, 'var(X)') // fallback slots
    .replace(/--[\w-]+\s*:[^;}]*/g, '--tok:X'); // token declarations
  // Print the whole declaration around each literal so a hit is findable in a one-line bundle.
  for (const [hit] of stripped.matchAll(/[^;{}]*(#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|oklch\()[^;{}]*/g)) {
    if (ALLOW_HIT.some((a) => a.hit.test(hit.trim()))) continue;
    console.log(`${p}: ${hit.trim()}`);
    bad = true;
  }
}
process.exit(bad ? 1 : 0);
