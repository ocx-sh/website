// <CycleButton>: native <button> wearing the Button look, every state's glyph in the SSR markup with
// the initial one current, the name and next-state hint as aria-label, optional hidden form input,
// rest spread, and no wrapper or hidden-text elements (the DOM budget, C-112).
import { readFileSync } from 'node:fs';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
// @ts-expect-error jsdom ships no types and @types/jsdom is not a dependency
import * as jsdom from 'jsdom';
import { beforeAll, describe, expect, it } from 'vitest';

type Component = Parameters<AstroContainer['renderToString']>[0];
const { JSDOM } = jsdom as { JSDOM: new (html: string) => { window: Window } };
// Template import: tsc has no .astro module types (as in chrome.test.ts).
const CycleButton = ((await import(`../src/components/ui/${'CycleButton'}.astro`)) as { default: Component }).default;

const SORT = [
  { value: 'asc', label: 'Ascending', icon: 'sort-asc' },
  { value: 'desc', label: 'Descending', icon: 'sort-desc' },
];
const THREE = [
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
  { value: 'auto', label: 'Auto', icon: 'sun' },
];

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});
const render = async (props: Record<string, unknown> = {}) => {
  const html = await container.renderToString(CycleButton, { props: { states: SORT, ...props } });
  return new JSDOM(html).window.document;
};
const button = async (props: Record<string, unknown> = {}) => (await render(props)).querySelector('button')!;

describe('CycleButton SSR', () => {
  it('is a type=button wearing the Button classes: secondary, m, icon only by default', async () => {
    const b = await button();
    expect(b.getAttribute('type')).toBe('button');
    expect(b.classList.contains('ocx-ui-button')).toBe(true);
    expect(b.classList.contains('ocx-ui-cycle-button')).toBe(true);
    expect(b.getAttribute('data-variant')).toBe('secondary');
    expect(b.getAttribute('data-size')).toBe('m');
    expect(b.hasAttribute('data-icon-only')).toBe(true);
  });

  it('renders one glyph per state, the first current, and the name plus next-state hint as aria-label', async () => {
    const b = await button();
    const glyphs = [...b.querySelectorAll('svg')];
    expect(glyphs.map((g) => g.getAttribute('data-icon'))).toEqual(['sort-asc', 'sort-desc']);
    expect(glyphs.map((g) => g.classList.contains('ocx-ui-cycle-button__state'))).toEqual([true, true]);
    expect(glyphs.map((g) => g.classList.contains('ocx-ui-cycle-button__current'))).toEqual([true, false]);
    expect(b.getAttribute('data-value')).toBe('asc');
    expect(JSON.parse(b.getAttribute('data-cycle')!)).toEqual([
      ['asc', 'Ascending'],
      ['desc', 'Descending'],
    ]);
    expect(b.getAttribute('aria-label')).toBe('Ascending (click for Descending)');
  });

  it('icon only renders nothing but the glyphs: no wrapper, label or hint element', async () => {
    const b = await button();
    expect([...b.children].map((c) => c.localName)).toEqual(['svg', 'svg']);
    expect(b.querySelector('.ocx-ui-cycle-button__label')).toBeNull();
  });

  it('iconOnly=false shows the current label beside the glyph', async () => {
    const b = await button({ iconOnly: false, value: 'desc' });
    expect(b.querySelector('.ocx-ui-cycle-button__label')?.textContent).toBe('Descending');
    expect(b.getAttribute('aria-label')).toBe('Descending (click for Ascending)');
  });

  it('value picks the initial state; the hint names the wrapped next one', async () => {
    const b = await button({ states: THREE, value: 'auto' });
    expect(b.getAttribute('data-value')).toBe('auto');
    expect(b.querySelector('.ocx-ui-cycle-button__current')).toBe(b.querySelectorAll('svg')[2]);
    expect(b.getAttribute('aria-label')).toBe('Auto (click for Light)');
  });

  it('variant, size, iconOnly=false and disabled land as attributes', async () => {
    const b = await button({ variant: 'ghost', size: 's', iconOnly: false, disabled: true });
    expect(b.getAttribute('data-variant')).toBe('ghost');
    expect(b.getAttribute('data-size')).toBe('s');
    expect(b.hasAttribute('data-icon-only')).toBe(false);
    expect(b.hasAttribute('disabled')).toBe(true);
  });

  it('name adds a hidden input carrying the value; no name, no input', async () => {
    const input = (await button({ name: 'order', value: 'desc' })).querySelector('input')!;
    expect(input.getAttribute('type')).toBe('hidden');
    expect(input.getAttribute('name')).toBe('order');
    expect(input.getAttribute('value')).toBe('desc');
    expect((await button()).querySelector('input')).toBeNull();
  });

  it('rest attributes reach the button; the component owns type and the name', async () => {
    const b = await button({ id: 'sort', class: 'extra', 'data-x': '1', type: 'submit', 'aria-label': 'x' });
    expect(b.id).toBe('sort');
    expect(b.classList.contains('extra')).toBe(true);
    expect(b.getAttribute('data-x')).toBe('1');
    expect(b.getAttribute('type')).toBe('button');
    expect(b.getAttribute('aria-label')).toBe('Ascending (click for Descending)');
  });

  it('rejects fewer than two states and an unknown value', async () => {
    await expect(render({ states: [SORT[0]] })).rejects.toThrow(/at least two/);
    await expect(render({ value: 'nope' })).rejects.toThrow(/not one of the states/);
  });
});

describe('cycle-button.css', () => {
  const css = readFileSync(new URL('../src/components/ui/cycle-button.css', import.meta.url), 'utf8');

  it('shows only the current state and sits in @layer ocx', () => {
    expect(css.trimStart().startsWith('/*')).toBe(true);
    expect(css).toContain('@layer ocx {');
    // Stacked in one cell, the others opacity 0 (not display none): first paint is final either way.
    expect(css).toMatch(/\.ocx-ui-cycle-button__state \{\s*grid-area: 1 \/ 1;/);
    expect(css).toMatch(/__state:not\(\.ocx-ui-cycle-button__current\)\s*{\s*opacity: 0;/);
    expect(css.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/display: none/);
  });

  it('animates the swap only under [data-live] (D-R7 c), on tokens', () => {
    const transitions = [...css.matchAll(/([^{}]+)\{[^{}]*transition:/g)].map((m) => m[1]!.trim());
    expect(transitions).toEqual(['.ocx-ui-cycle-button[data-live] .ocx-ui-cycle-button__state']);
    expect(css).toMatch(/opacity var\(--ocx-duration-moderate\) var\(--ocx-ease-in-out\)/);
    expect(css).not.toMatch(/\d+m?s\b/);
  });

  it('is tokens only: no raw colour, no px', () => {
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i);
    expect(css).not.toMatch(/\d+px/);
  });
});
