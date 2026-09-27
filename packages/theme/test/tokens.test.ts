// Contracts on tokens.css: colour is the only per-scheme family, and every
// text/background pair the design guide names meets WCAG AA (4.5:1).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/tokens.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function block(selector: string): Map<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`no block for ${selector}`);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  return new Map([...body.matchAll(/(--ocx-[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
}

const light = block(":root[data-theme='light']");
const dark = new Map([...light, ...block(":root[data-theme='dark']")]);
const darkOnly = block(":root[data-theme='dark']");

function resolve(scheme: Map<string, string>, token: string): string {
  const value = scheme.get(token);
  if (value === undefined) throw new Error(`${token} undefined`);
  const ref = /^var\((--ocx-[\w-]+)\)$/.exec(value);
  return ref ? resolve(scheme, ref[1]!) : value;
}

function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`not an opaque hex colour: ${hex}`);
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(m[1]!.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(scheme: Map<string, string>, fg: string, bg: string): number {
  const [a, b] = [luminance(resolve(scheme, fg)), luminance(resolve(scheme, bg))];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// [foreground, background] pairs that carry body-size text.
const TEXT_PAIRS: [string, string][] = [
  ['fg', 'bg'],
  ['fg', 'surface'],
  ['fg-muted', 'bg'],
  ['fg-muted', 'surface'],
  ['fg-subtle', 'surface'],
  ['accent-fg', 'bg'],
  ['accent-fg', 'surface'],
  ['on-accent', 'accent'],
  ['code-fg', 'code-bg'],
  ['code-comment', 'code-bg'],
  ['success', 'surface'],
  ['warning', 'surface'],
  ['danger', 'surface'],
  ['keyword', 'surface'],
];

// Deliberately identical in both schemes (design guide: coral is not flipped).
const SAME_IN_BOTH = new Set(['accent', 'accent-hover', 'on-accent', 'accent-tint', 'accent-tint-border']);

describe('tokens.css', () => {
  for (const [name, scheme] of [['light', light], ['dark', dark]] as const) {
    it.each(TEXT_PAIRS)(`${name}: %s on %s meets 4.5:1`, (fg, bg) => {
      expect(contrast(scheme, `--ocx-color-${fg}`, `--ocx-color-${bg}`)).toBeGreaterThanOrEqual(4.5);
    });
  }

  it('overrides every literal colour token in dark, unless deliberately shared', () => {
    const missing = [...light]
      .filter(([k, v]) => k.startsWith('--ocx-color-') && !v.startsWith('var('))
      .map(([k]) => k)
      .filter((k) => !darkOnly.has(k) && !SAME_IN_BOTH.has(k.slice('--ocx-color-'.length)));
    expect(missing).toEqual([]);
  });

  it('keeps non-colour tokens out of the dark block', () => {
    const stray = [...darkOnly.keys()].filter((k) => !k.startsWith('--ocx-color-') && !k.startsWith('--ocx-shadow-'));
    expect(stray).toEqual([]);
  });
});
