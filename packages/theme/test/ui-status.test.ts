// WP14a status primitives: Tag, Loader, Skeleton (contract: .agents/research/ui-primitives.md › Contract).
// Markup via the Astro Container API, parsed with JSDOM; styles checked on the component source.
import { readFileSync } from 'node:fs';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
// @ts-expect-error jsdom ships no types and @types/jsdom is not a dependency
import * as jsdom from 'jsdom';
import { beforeAll, describe, expect, it } from 'vitest';

type Win = Window & typeof globalThis;
type Component = Parameters<AstroContainer['renderToString']>[0];
const { JSDOM } = jsdom as { JSDOM: new (html: string) => { window: Win } };
// Template import: tsc has no .astro module types (as in chrome.test.ts).
const load = async (name: string) =>
  ((await import(`../src/components/ui/${name}.astro`)) as { default: Component }).default;
const Tag = await load('Tag');
const Loader = await load('Loader');
const Skeleton = await load('Skeleton');

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});

async function render(c: Component, props: Record<string, unknown>, slot?: string) {
  const html = await container.renderToString(c, { props, ...(slot ? { slots: { default: slot } } : {}) });
  return { html, doc: new JSDOM(`<body>${html}</body>`).window.document };
}

const style = (name: string) => {
  // Tag and Loader look is the shared ui/*.css; the others keep a scoped <style>.
  if (name === 'Tag' || name === 'Loader')
    return readFileSync(new URL(`../src/components/ui/${name.toLowerCase()}.css`, import.meta.url), 'utf8');
  const src = readFileSync(new URL(`../src/components/ui/${name}.astro`, import.meta.url), 'utf8');
  return /<style[^>]*>([\s\S]*)<\/style>/.exec(src)?.[1] ?? '';
};

describe('WP14a ui styles (all status primitives)', () => {
  it.each(['Tag', 'Loader', 'Skeleton'])(
    'WP14a %s: styles sit in @layer ocx, tokens only (no literal colours)',
    (name) => {
      const s = style(name);
      expect(s).toMatch(/@layer ocx\s*\{/);
      expect(s).toMatch(/var\(--ocx-/);
      expect(s).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(/i);
    },
  );

  it.each(['Tag', 'Loader', 'Skeleton'])('WP14a %s: ships zero client JS', async (name) => {
    const { html } = await render(await load(name), {}, 'x');
    expect(html).not.toMatch(/<script/i);
  });
});

describe('WP14a Tag', () => {
  it('WP14a Tag: defaults to span.ocx-ui-tag label/neutral with the slot text', async () => {
    const { doc } = await render(Tag, {}, 'MIT');
    const t = doc.querySelector('.ocx-ui-tag');
    expect(t?.tagName).toBe('SPAN');
    expect(t?.getAttribute('data-variant')).toBe('label');
    expect(t?.getAttribute('data-tone')).toBe('neutral');
    expect(t?.textContent?.trim()).toBe('MIT');
  });

  it.each([
    ['stamp', 'success'],
    ['label', 'keyword'],
    ['stamp', 'warning'],
    ['label', 'danger'],
  ])('WP14a Tag: variant %s tone %s map to data-*; class passes through', async (variant, tone) => {
    const t = (await render(Tag, { variant, tone, class: 'extra' }, 'x')).doc.querySelector('.ocx-ui-tag');
    expect(t?.getAttribute('data-variant')).toBe(variant);
    expect(t?.getAttribute('data-tone')).toBe(tone);
    expect(t?.classList.contains('extra')).toBe(true);
  });

  it('WP14a Tag: passive, never interactive (no role, no tabindex)', async () => {
    const t = (await render(Tag, {}, 'x')).doc.querySelector('.ocx-ui-tag');
    expect(t?.hasAttribute('role')).toBe(false);
    expect(t?.hasAttribute('tabindex')).toBe(false);
  });

  it('WP14a Tag: mono text-2xs, radius-sm; stamp is caps with tracking-caps', () => {
    const s = style('Tag');
    expect(s).toContain('var(--ocx-font-mono)');
    expect(s).toContain('var(--ocx-text-xs)');
    expect(s).toContain('var(--ocx-radius-sm)');
    expect(s).toMatch(/\[data-variant=["']?stamp["']?\][^{]*\{[^}]*text-transform:\s*uppercase/);
    expect(s).toContain('var(--ocx-tracking-caps)');
  });
});

describe('WP14a Loader', () => {
  it('WP14a Loader: span.ocx-ui-loader[role=status] > aria-hidden spinner + label "Loading…" by default', async () => {
    const { doc } = await render(Loader, {});
    const l = doc.querySelector('.ocx-ui-loader');
    expect(l?.tagName).toBe('SPAN');
    expect(l?.getAttribute('role')).toBe('status');
    expect(l?.getAttribute('data-size')).toBe('m');
    expect(l?.querySelector('.ocx-ui-loader__spinner')?.getAttribute('aria-hidden')).toBe('true');
    expect(l?.querySelector('.ocx-ui-loader__label')?.textContent).toBe('Loading…');
  });

  it('WP14a Loader: label, size and class props reach the markup', async () => {
    const l = (await render(Loader, { label: 'Loading dependencies…', size: 's', class: 'extra' })).doc.querySelector(
      '.ocx-ui-loader',
    );
    expect(l?.getAttribute('data-size')).toBe('s');
    expect(l?.classList.contains('extra')).toBe(true);
    expect(l?.querySelector('.ocx-ui-loader__label')?.textContent).toBe('Loading dependencies…');
  });

  it('WP14a Loader: always rendered — never [hidden] at first paint, so the live region exists before any change', async () => {
    const l = (await render(Loader, {})).doc.querySelector('.ocx-ui-loader');
    expect(l?.hasAttribute('hidden')).toBe(false);
  });

  it('WP14a Loader: aria-busy belongs to the consumer region, not the loader (status stays announceable)', async () => {
    const { doc } = await render(Loader, {});
    expect(doc.querySelector('[aria-busy]')).toBeNull();
  });

  it('WP14a Loader: text-swap contract — the label is the only text node the consumer updates', async () => {
    // role=status is polite by default; the announced text lives in __label alone (the spinner is aria-hidden
    // and empty), so a consumer's `label.textContent = …` is the whole announcement.
    const l = (await render(Loader, { label: 'Fetching…' })).doc.querySelector('.ocx-ui-loader');
    expect(l?.querySelector('.ocx-ui-loader__spinner')?.textContent).toBe('');
    expect(l?.textContent?.trim()).toBe('Fetching…');
    expect(l?.querySelectorAll('.ocx-ui-loader__label')).toHaveLength(1);
    expect(l?.hasAttribute('aria-live')).toBe(false); // implicit polite from role=status; no double announcement
  });

  it('WP14a Loader: [hidden] { display: none } wins over the component display', () => {
    expect(style('Loader')).toMatch(/\[hidden\]\s*\{[^}]*display:\s*none/);
  });

  it('WP14a Loader: the layer pull runs only under prefers-reduced-motion: no-preference, at 6× duration-slow', () => {
    const s = style('Loader');
    expect(s).toContain('--_t: calc(var(--ocx-duration-slow) * 6)');
    const gated = /@media[^{]*\(prefers-reduced-motion:\s*no-preference\)\s*\{([\s\S]*)/.exec(s)?.[1] ?? '';
    // One period, each layer a quarter-period behind the last (negative delays: steady from frame 0).
    expect(gated).toMatch(
      /animation:\s*ocx-ui-loader-pull var\(--_t\)[^;]*calc\(\(var\(--_i, 0\) - 4\) \* var\(--_t\) \/ 4\)[^;]*infinite/,
    );
    expect(gated).toMatch(/animation-name:\s*ocx-ui-loader-land/);
    // Reduced motion = no animation at all: tests/e2e/ui-status.spec.ts checks the computed animation-name.
    expect(s).toMatch(/@keyframes ocx-ui-loader-pull/);
  });

  it('WP14a Loader: keyframes move only transform and opacity (compositor-only, 60 fps)', () => {
    const frames = [...style('Loader').matchAll(/@keyframes[^{]*\{((?:[^{}]*\{[^}]*\})*)\s*\}/g)]
      .map((m) => m[1])
      .join('');
    const props = new Set([...frames.matchAll(/([a-z-]+):/g)].flatMap((m) => m[1] ?? []));
    expect([...props].sort((a, b) => a.localeCompare(b))).toEqual([
      'animation-timing-function',
      'opacity',
      'transform',
    ]);
  });

  it('WP14a Loader: hidden when scripting is off (a loader without JS never finishes)', () => {
    expect(style('Loader')).toMatch(/@media\s*\(scripting:\s*none\)\s*\{[\s\S]*display:\s*none/);
  });

  it('WP14a Loader: a 2×2 of four aria-hidden layers; m = control-sm, s = icon-md; quiet cells with a neutral ink head, no accent', async () => {
    const { doc } = await render(Loader, {});
    expect(doc.querySelectorAll('.ocx-ui-loader__spinner > i')).toHaveLength(4);
    const s = style('Loader');
    expect(s).toContain('var(--ocx-control-sm)');
    expect(s).toContain('var(--ocx-icon-md)');
    expect(s).toMatch(/grid-template:\s*1fr 1fr \/ 1fr 1fr/);
    expect(s).toMatch(/> i\s*\{[^}]*background:\s*var\(--ocx-color-border-control\)/);
    expect(s).toMatch(/> i::after\s*\{[^}]*background:\s*var\(--ocx-color-fg-muted\)/);
    expect(s).not.toContain('--ocx-color-accent');
    // Forced colours drop backgrounds: cells and head take system ink.
    expect(s).toMatch(/@media \(forced-colors: active\)[\s\S]*GrayText[\s\S]*CanvasText/);
    // Still frame (reduced motion): the bottom-left layer, last in the clockwise pull, is the head.
    expect(s).toMatch(/nth-child\(3\)::after\s*\{\s*opacity:\s*1/);
  });
});

describe('WP14a Skeleton', () => {
  it('WP14a Skeleton: span.ocx-ui-skeleton[aria-hidden] with 3 lines and --_lines by default', async () => {
    const s = (await render(Skeleton, {})).doc.querySelector('.ocx-ui-skeleton');
    expect(s?.tagName).toBe('SPAN');
    expect(s?.getAttribute('aria-hidden')).toBe('true');
    expect(s?.getAttribute('style')).toMatch(/--_lines:\s*3/);
    expect(s?.querySelectorAll('.ocx-ui-skeleton__line')).toHaveLength(3);
  });

  it('WP14a Skeleton: lines and class props reach the markup', async () => {
    const s = (await render(Skeleton, { lines: 5, class: 'extra' })).doc.querySelector('.ocx-ui-skeleton');
    expect(s?.querySelectorAll('.ocx-ui-skeleton__line')).toHaveLength(5);
    expect(s?.getAttribute('style')).toMatch(/--_lines:\s*5/);
    expect(s?.classList.contains('extra')).toBe(true);
  });

  it('WP14a Skeleton: reserves calc(--_lines × 1lh), bars surface-subtle, static (no animation)', () => {
    const s = style('Skeleton');
    expect(s).toMatch(/block-size:\s*calc\(var\(--_lines\)\s*\*\s*1lh\)/);
    expect(s).toContain('var(--ocx-color-surface-subtle)');
    expect(s).not.toMatch(/animation|@keyframes/);
  });
});
