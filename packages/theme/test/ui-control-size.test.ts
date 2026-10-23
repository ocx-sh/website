// Control sizes and the icon option row (SSR markup + overlay.css): Select and Popover take
// `size`; an icon row in the popup keeps a selected cue that is not colour alone.
import { readFileSync } from 'node:fs';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
// @ts-expect-error jsdom ships no types and @types/jsdom is not a dependency
import * as jsdom from 'jsdom';
import { beforeAll, describe, expect, it } from 'vitest';

type Component = Parameters<AstroContainer['renderToString']>[0];
const { JSDOM } = jsdom as { JSDOM: new (html: string) => { window: Window } };
const load = async (name: string) =>
  ((await import(`../src/components/ui/${name}.astro`)) as { default: Component }).default;
const Select = await load('Select');
const Popover = await load('Popover');

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});
const render = async (c: Component, props: Record<string, unknown>, html = '') =>
  new JSDOM(await container.renderToString(c, { props, slots: { default: html, trigger: 'Open' } })).window.document;

const OPTIONS = [
  { value: 'a', label: 'A' },
  { value: 'b', label: 'B', data: { rank: '2' } },
];

describe('Select size and option data', () => {
  it.each([
    [undefined, 'm'],
    ['s', 's'],
    ['m', 'm'],
  ])('size %s puts data-size="%s" on the root', async (size, expected) => {
    const d = await render(Select, { label: 'Sort', options: OPTIONS, ...(size && { size }) });
    expect(d.querySelector('.ocx-ui-select')?.getAttribute('data-size')).toBe(expected);
  });

  it('option.data becomes data-* on the native option, and only there', async () => {
    const d = await render(Select, { label: 'Sort', options: OPTIONS });
    const [a, b] = [...d.querySelectorAll('select option')];
    expect(a?.getAttribute('data-rank')).toBeNull();
    expect(b?.getAttribute('data-rank')).toBe('2');
  });
});

describe('Popover size', () => {
  it.each([
    [undefined, 'm'],
    ['s', 's'],
    ['l', 'l'],
  ])('size %s sizes the trigger Button data-size="%s"', async (size, expected) => {
    const d = await render(Popover, { ...(size && { size }) }, 'body');
    expect(d.querySelector('.ocx-ui-popover > [data-part="trigger"]')?.getAttribute('data-size')).toBe(expected);
  });
});

describe('overlay.css option row', () => {
  const css = readFileSync(new URL('../src/components/ui/overlay.css', import.meta.url), 'utf8');
  it('an icon row has no check, so the selected one is marked by accent icon and heavier label', () => {
    expect(css).toMatch(/\.ocx-ui-option\[data-state='checked'\]:not\(\[data-with-icon\]\)::before/);
    expect(css).toMatch(
      /\.ocx-ui-option\[data-with-icon\]\[data-state='checked'\] \.ocx-ui-option__icon\s*\{\s*color: var\(--ocx-color-accent-fg\)/,
    );
    expect(css).toMatch(
      /\.ocx-ui-option\[data-with-icon\]\[data-state='checked'\] \.ocx-ui-option__label\s*\{\s*font-weight: var\(--ocx-font-weight-semibold\)/,
    );
  });
});

describe('polish rules read tokens, not raw values', () => {
  const read = (file: string) => readFileSync(new URL(`../src/components/ui/${file}`, import.meta.url), 'utf8');
  it.each([
    ['Drawer.astro', /\[data-part='close-trigger'\]\s*\{[^}]*z-index: var\(--ocx-z-drawer-close\)/],
    ['skeleton.css', /animation: ocx-ui-skeleton-sweep var\(--ocx-duration-shimmer\) linear infinite/],
    ['tag.css', /\[data-variant='filter'\]\s*\{[^}]*block-size: var\(--ocx-control-lg\)/],
    ['link.css', /\.ocx-ui-link\s*\{\s*position: relative/],
    ['field.css', /\.ocx-ui-input-group__input:focus-visible\s*\{\s*outline: none/],
  ])('%s', (file, rule) => {
    expect(read(file)).toMatch(rule);
  });
});
