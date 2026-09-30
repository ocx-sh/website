// C-266 Meter: ARIA, clamping, format and valueText (node env, Astro Container).
import { readFileSync } from 'node:fs';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
// @ts-expect-error jsdom ships no types and @types/jsdom is not a dependency
import * as jsdom from 'jsdom';
import { beforeAll, describe, expect, it } from 'vitest';

type Win = Window & typeof globalThis;
type Component = Parameters<AstroContainer['renderToString']>[0];
const { JSDOM } = jsdom as { JSDOM: new (html: string) => { window: Win } };
// Template import through a variable: tsc has no .astro module types (as in chrome.test.ts).
const path = '../src/components/ui/Meter.astro';
const Meter = ((await import(path)) as { default: Component }).default;

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});

async function render(props: Record<string, unknown>) {
  const html = await container.renderToString(Meter, { props });
  const doc = new JSDOM(`<body>${html}</body>`).window.document;
  const root = doc.querySelector('[role="meter"]') as HTMLElement;
  return { html, doc, root };
}

describe('C-266 Meter', () => {
  it('is a role=meter div named by its span label, with the value and range in aria-*', async () => {
    const { doc, root } = await render({ label: 'Disk', value: 40 });
    expect(root.tagName).toBe('DIV');
    expect(root.classList.contains('ocx-ui-meter')).toBe(true);
    const label = doc.querySelector('[data-part="label"]');
    expect(label?.tagName).toBe('SPAN');
    expect(root.getAttribute('aria-labelledby')).toBe(label?.id);
    expect(label?.id).toBeTruthy();
    expect(label?.textContent?.trim()).toBe('Disk');
    expect(root.getAttribute('aria-valuenow')).toBe('40');
    expect(root.getAttribute('aria-valuemin')).toBe('0');
    expect(root.getAttribute('aria-valuemax')).toBe('100');
  });

  it('defaults to the percent of the range as the shown text and aria-valuetext', async () => {
    const { doc, root } = await render({ label: 'Disk', value: 40 });
    expect(doc.querySelector('[data-part="value-text"]')?.textContent).toBe('40%');
    expect(root.getAttribute('aria-valuetext')).toBe('40%');
    expect(root.getAttribute('style')).toBe('--_value:40');
  });

  it('measures against min and max', async () => {
    const { doc, root } = await render({ label: 'Cache', value: 15, min: 10, max: 30 });
    expect(root.getAttribute('aria-valuemin')).toBe('10');
    expect(root.getAttribute('aria-valuemax')).toBe('30');
    expect(root.getAttribute('style')).toBe('--_value:25');
    expect(doc.querySelector('[data-part="value-text"]')?.textContent).toBe('25%');
  });

  it('clamps a value outside the range: aria-valuenow and the fill both', async () => {
    const over = await render({ label: 'Disk', value: 150 });
    expect(over.root.getAttribute('aria-valuenow')).toBe('100');
    expect(over.root.getAttribute('style')).toBe('--_value:100');
    expect(over.doc.querySelector('[data-part="value-text"]')?.textContent).toBe('100%');
    const under = await render({ label: 'Disk', value: -5 });
    expect(under.root.getAttribute('aria-valuenow')).toBe('0');
    expect(under.root.getAttribute('style')).toBe('--_value:0');
  });

  it('a degenerate range (max <= min) fills nothing instead of NaN', async () => {
    const { root } = await render({ label: 'Disk', value: 5, min: 10, max: 10 });
    expect(root.getAttribute('style')).toBe('--_value:0');
  });

  it('format applies to the value itself, not the percent', async () => {
    const { doc, root } = await render({
      label: 'Quota',
      value: 3.2,
      max: 5,
      format: { style: 'unit', unit: 'gigabyte', maximumFractionDigits: 1 },
    });
    expect(doc.querySelector('[data-part="value-text"]')?.textContent).toBe('3.2 GB');
    expect(root.getAttribute('aria-valuetext')).toBe('3.2 GB');
    expect(root.getAttribute('style')).toBe('--_value:64');
  });

  it('valueText replaces the shown text and aria-valuetext, and beats format', async () => {
    const { doc, root } = await render({
      label: 'Quota',
      value: 64,
      valueText: '3.2 of 5 GB',
      format: { style: 'percent' },
    });
    expect(doc.querySelector('[data-part="value-text"]')?.textContent).toBe('3.2 of 5 GB');
    expect(root.getAttribute('aria-valuetext')).toBe('3.2 of 5 GB');
  });

  it('tone and size land as data attributes, default neutral m', async () => {
    const plain = await render({ label: 'Disk', value: 1 });
    expect(plain.root.getAttribute('data-tone')).toBe('neutral');
    expect(plain.root.getAttribute('data-size')).toBe('m');
    const set = await render({ label: 'Disk', value: 1, tone: 'danger', size: 's' });
    expect(set.root.getAttribute('data-tone')).toBe('danger');
    expect(set.root.getAttribute('data-size')).toBe('s');
  });

  it('hideLabel hides the label visually but keeps it as the name', async () => {
    const { doc, root } = await render({ label: 'Disk', value: 1, hideLabel: true });
    const label = doc.querySelector('[data-part="label"]');
    expect(label?.hasAttribute('data-hidden')).toBe(true);
    expect(root.getAttribute('aria-labelledby')).toBe(label?.id);
  });

  it('each instance gets its own label id and the class merges onto the root', async () => {
    const a = await render({ label: 'A', value: 1, class: 'mine' });
    const b = await render({ label: 'B', value: 1 });
    expect(a.root.classList.contains('mine')).toBe(true);
    expect(a.root.getAttribute('aria-labelledby')).not.toBe(b.root.getAttribute('aria-labelledby'));
  });

  it('ships no script and its styles sit in @layer ocx with tokens only', () => {
    const src = readFileSync(new URL('../src/components/ui/Meter.astro', import.meta.url), 'utf8');
    expect(src).not.toMatch(/<script/);
    const css = readFileSync(new URL('../src/components/ui/range.css', import.meta.url), 'utf8');
    expect(css).toMatch(/@layer ocx\s*\{/);
    expect(css).toMatch(/var\(--ocx-track-size\)/);
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(/i);
  });

  it('R5 the fill is full width, scaled from inline-start to the value, which moves on the slow token', () => {
    const css = readFileSync(new URL('../src/components/ui/range.css', import.meta.url), 'utf8');
    const fill = /\.ocx-ui-meter__fill \{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(fill).toMatch(/scale: calc\(var\(--_value\) \/ 100\) 1;/);
    expect(fill).toMatch(/transform-origin: left;/);
    expect(fill).not.toMatch(/inline-size|transition/);
    // The registered value glides where it is set; the fill follows it.
    expect(css).toMatch(/@property --_value \{\s*syntax: '<number>';\s*inherits: true;/);
    expect(css).toMatch(/\.ocx-ui-meter \{[^}]*transition: --_value var\(--ocx-duration-slow\) var\(--ocx-ease-out\);/);
    expect(css).toMatch(/\.ocx-ui-meter__fill:dir\(rtl\) \{\s*transform-origin: right;/);
    // Slider stays unanimated while dragging (D-R8).
    expect(css).not.toMatch(/\.ocx-ui-slider[^{]*\{[^}]*transition/);
  });
});
