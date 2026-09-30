// Contracts on tokens.css: colour is the only per-scheme family, and every
// text/background pair the design guide names meets WCAG AA (4.5:1), and
// every non-text UI pair meets 3:1 (C-030).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CODE_LINE_TINTS, STATUS_TINTS, TAG_BASES, TEXT_PAIRS, UI_PAIRS } from './contrast-pairs.ts';

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

function rgba(value: string): [number, number, number, number] {
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex)
    return [0, 2, 4].map((i) => parseInt(hex[1]!.slice(i, i + 2), 16)).concat(1) as [number, number, number, number];
  const fn = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(value);
  if (!fn) throw new Error(`not a hex or rgba() colour: ${value}`);
  return fn.slice(1).map(Number) as [number, number, number, number];
}

/** `top` alpha-composited over an opaque `base`, as the browser paints it. */
function over(top: string, base: string): [number, number, number] {
  const [t, b] = [rgba(top), rgba(base)];
  if (b[3] !== 1) throw new Error(`base not opaque: ${base}`);
  return [0, 1, 2].map((i) => t[i]! * t[3] + b[i]! * (1 - t[3])) as [number, number, number];
}

function luminance([r, g, b]: [number, number, number]): number {
  const [lr, lg, lb] = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

function ratio(fg: [number, number, number], bg: [number, number, number]): number {
  const [a, b] = [luminance(fg), luminance(bg)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function opaque(scheme: Map<string, string>, token: string): [number, number, number] {
  const c = rgba(resolve(scheme, token));
  if (c[3] !== 1) throw new Error(`${token} is translucent; composite it`);
  return [c[0], c[1], c[2]];
}

function contrast(scheme: Map<string, string>, fg: string, bg: string): number {
  return ratio(opaque(scheme, fg), opaque(scheme, bg));
}

const TINTED = CODE_LINE_TINTS.flatMap(([tint, fgs]) => fgs.map((fg) => [fg, tint] as [string, string]));
// C-108c: the warning label is also checked on surface-subtle (table heads, subtle cards).
const LABELS = [
  ...STATUS_TINTS.flatMap(([fg, tint]) => ['bg', 'surface'].map((base) => [fg, tint, base] as const)),
  ['warning', 'warning-tint', 'surface-subtle'] as const,
];

const component = (path: string): string => readFileSync(new URL(`../src/components/${path}`, import.meta.url), 'utf8');

// Tag label ink on its tint, read from tag.css itself: the default (neutral) rule and each tone rule.
const tagCss = component('ui/tag.css');
const TAG_TONES = [...tagCss.matchAll(/\.ocx-ui-tag(?:\[data-tone='(\w+)'\])?\s*\{([^}]*)\}/g)]
  .map(
    (m) =>
      [
        m[1] ?? 'neutral',
        /--_tone:\s*var\(--ocx-color-([\w-]+)\)/.exec(m[2]!)?.[1],
        /--_tint:\s*var\(--ocx-color-([\w-]+)\)/.exec(m[2]!)?.[1],
      ] as const,
  )
  .filter((t): t is readonly [string, string, string] => t[1] !== undefined && t[2] !== undefined);
const TAG_LABELS = TAG_TONES.flatMap(([tone, fg, tint]) => TAG_BASES.map((base) => [tone, fg, tint, base] as const));

describe('tokens.css', () => {
  for (const [name, scheme] of [
    ['light', light],
    ['dark', dark],
  ] as const) {
    it.each(TEXT_PAIRS)(`C-030 ${name}: %s on %s meets 4.5:1`, (fg, bg) => {
      expect(contrast(scheme, `--ocx-color-${fg}`, `--ocx-color-${bg}`)).toBeGreaterThanOrEqual(4.5);
    });
    it.each(TINTED)(`C-030 ${name}: %s on a %s code line meets 4.5:1`, (fg, tint) => {
      const bg = over(resolve(scheme, `--ocx-color-${tint}`), resolve(scheme, '--ocx-color-code-bg'));
      expect(ratio(opaque(scheme, `--ocx-color-${fg}`), bg)).toBeGreaterThanOrEqual(4.5);
    });
    it.each(LABELS)(`C-030 ${name}: %s label on %s over %s meets 4.5:1`, (fg, tint, base) => {
      const bg = over(resolve(scheme, `--ocx-color-${tint}`), resolve(scheme, `--ocx-color-${base}`));
      expect(ratio(opaque(scheme, `--ocx-color-${fg}`), bg)).toBeGreaterThanOrEqual(4.5);
    });
    it.each(TAG_LABELS)(`owner ${name}: Tag %s label (%s on %s) over %s meets 4.5:1`, (_, fg, tint, base) => {
      const tintValue = resolve(scheme, `--ocx-color-${tint}`);
      const bg = tintValue.startsWith('rgba')
        ? over(tintValue, resolve(scheme, `--ocx-color-${base}`))
        : opaque(scheme, `--ocx-color-${tint}`);
      expect(ratio(opaque(scheme, `--ocx-color-${fg}`), bg)).toBeGreaterThanOrEqual(4.5);
    });
    it.each(UI_PAIRS)(`C-030 ${name}: UI %s on %s meets 3:1`, (fg, bg) => {
      expect(contrast(scheme, `--ocx-color-${fg}`, `--ocx-color-${bg}`)).toBeGreaterThanOrEqual(3);
    });
  }

  it('keeps the UI text scale monotonic with text-xs at the 12px legible floor (Lighthouse font-size)', () => {
    const px = ['2xs', 'xs', 'sm', 'base', 'md', 'lg', 'xl', '2xl'].map((k) =>
      parseFloat(resolve(light, `--ocx-text-${k}`)),
    );
    expect(px[1]).toBeGreaterThanOrEqual(12);
    expect(px).toEqual([...px].sort((a, b) => a - b));
    expect(new Set(px).size).toBe(px.length);
  });

  it('lets reduced motion outrank the data-theme blocks that declare the durations', () => {
    // `:root` alone (0,1,0) loses to `:root[data-theme='light']` (0,2,0) on Starlight pages.
    const rule = /prefers-reduced-motion: reduce\)\s*\{\s*([^{]+)\{/.exec(css);
    expect(rule?.[1]?.split(',').map((s) => s.trim())).toContain(':root[data-theme]');
    // Same specificity as `:root[data-theme='dark']`: it wins only by coming later.
    expect(css.indexOf('prefers-reduced-motion: reduce')).toBeGreaterThan(css.lastIndexOf(':root[data-theme='));
  });

  it('C-108a: declares the Stage-Z overlay tokens, z-index scale in stacking order', () => {
    for (const t of ['--ocx-color-overlay', '--ocx-toast-width', '--ocx-toast-pad', '--ocx-control-hint'])
      expect(light.has(t), t).toBe(true);
    for (const t of ['--ocx-dialog-width', '--ocx-drawer-width', '--ocx-ease-out', '--ocx-ease-in-out'])
      expect(light.has(t), t).toBe(true);
    const order = ['header', 'drawer-backdrop', 'drawer', 'popover', 'modal-backdrop', 'modal', 'tooltip', 'toast'];
    const z = [...order, 'skip-link'].map((k) => Number(resolve(light, `--ocx-z-${k}`)));
    expect(z).toEqual([...z].sort((a, b) => a - b));
    expect(new Set(z).size).toBe(z.length);
  });

  it('C-108c: the warning Tag uses the label-grade warning tint, not a halved stopgap', () => {
    const tag = readFileSync(new URL('../src/components/ui/tag.css', import.meta.url), 'utf8');
    const rule = /\[data-tone='warning'\]\s*\{([^}]*)\}/.exec(tag)?.[1] ?? '';
    expect(rule).toContain('--_tint: var(--ocx-color-warning-tint);');
    expect(rule).not.toContain('color-mix');
  });

  // D-Z3: variables and data keys stay coral (the accent's text grade), never a purple of their own.
  it.each([
    ['light', light],
    ['dark', dark],
  ] as const)('D-Z3 %s: --ocx-color-code-variable is the coral accent text colour', (_, scheme) => {
    expect(scheme.get('--ocx-color-code-variable')).toBe('var(--ocx-color-accent-fg)');
    const [r, g, b] = opaque(scheme, '--ocx-color-code-variable');
    expect(r).toBeGreaterThan(g); // red-orange hue, no blue cast
    expect(g).toBeGreaterThanOrEqual(b);
  });

  it('covers every Tag tone in the label contrast check', () => {
    expect(TAG_TONES.map(([tone]) => tone).sort()).toEqual(['danger', 'keyword', 'neutral', 'success', 'warning']);
  });

  it('owner: declares the interaction-state tokens (neutral hover, hover border, square inset focus)', () => {
    for (const t of ['--ocx-color-hover', '--ocx-color-hover-border', '--ocx-focus-ring', '--ocx-focus-offset-inset'])
      expect(light.has(t), t).toBe(true);
    expect(darkOnly.has('--ocx-color-hover')).toBe(true);
    expect(light.get('--ocx-color-hover-border')).toBe('var(--ocx-color-border-control)');
  });

  it.each(['AccordionItem.astro', 'Collapsible.astro'])(
    'owner: %s draws no frame and marks the open item with the accent (bar, title, chevron)',
    (file) => {
      const s = component(file);
      expect(s).not.toContain('var(--ocx-color-border-control)');
      expect(s).not.toContain('var(--ocx-color-surface');
      const open = [...s.matchAll(/\[data-state='open'\][^{]*\{([^}]*)\}/g)].map((m) => m[1]).join('');
      expect(open).toContain('var(--ocx-color-focus)');
      expect(open).toContain('var(--ocx-color-accent-fg)');
      expect(s).toMatch(/\[data-state='open'\]\s*>\s*:global\(\.ocx-[a-z]+__chevron\)\s*\{[^}]*\brotate:\s*180deg/);
      expect(s).toMatch(/@media \(forced-colors: active\)\s*\{[^}]*\}\s*[^}]*\[data-state='open'\][^}]*Highlight/);
    },
  );

  it('declares every literal colour token in dark too', () => {
    const missing = [...light]
      .filter(([k, v]) => k.startsWith('--ocx-color-') && !v.startsWith('var('))
      .map(([k]) => k)
      .filter((k) => !darkOnly.has(k));
    expect(missing).toEqual([]);
  });

  it('keeps non-colour tokens out of the dark block', () => {
    // Restated in dark only because their values reference a colour token (dark-parity gate); same value as light.
    const restated = new Set(['--ocx-focus-ring', '--ocx-shadow-overlay']);
    const stray = [...darkOnly.keys()].filter((k) => !k.startsWith('--ocx-color-') && !restated.has(k));
    expect(stray).toEqual([]);
  });
});
