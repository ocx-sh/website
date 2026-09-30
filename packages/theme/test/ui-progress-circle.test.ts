// C-265 ProgressCircle: the shared builder and the SSR markup (node env, Astro Container).
import { readFileSync } from 'node:fs';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
// @ts-expect-error jsdom ships no types and @types/jsdom is not a dependency
import * as jsdom from 'jsdom';
import { beforeAll, describe, expect, it } from 'vitest';
import { progressCircleSvg } from '../src/components/ui/progress-circle.mjs';

type Win = Window & typeof globalThis;
type Component = Parameters<AstroContainer['renderToString']>[0];
const { JSDOM } = jsdom as { JSDOM: new (html: string) => { window: Win } };
const ProgressCircle = ((await import(`../src/components/ui/${'ProgressCircle'}.astro`)) as { default: Component })
  .default;

const parse = (svg: string) => new JSDOM(`<body>${svg}</body>`).window.document;
const dash = (svg: string) => parse(svg).querySelector('[data-part="fill"]')?.getAttribute('stroke-dasharray');

describe('C-265 progressCircleSvg', () => {
  it('is a decorative 24 box with a track and a fill, both pathLength 100', () => {
    const doc = parse(progressCircleSvg({ value: 40 }));
    const svg = doc.querySelector('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('focusable')).toBe('false');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 24 24');
    for (const part of ['track', 'fill'])
      expect(doc.querySelector(`[data-part="${part}"]`)?.getAttribute('pathLength')).toBe('100');
    expect(doc.querySelector('[data-part="fill"]')?.getAttribute('transform')).toBe('rotate(-90 12 12)');
  });

  it('determinate: dasharray is the value, clamped and rounded to 1 decimal', () => {
    expect(dash(progressCircleSvg({ value: 40 }))).toBe('40 100');
    expect(dash(progressCircleSvg({ value: 33.333 }))).toBe('33.3 100');
    expect(dash(progressCircleSvg({ value: 250 }))).toBe('100 100');
    expect(dash(progressCircleSvg({ value: -5 }))).toBe('0 100');
  });

  it('a 0 fill is hidden (a square cap would paint a dot)', () => {
    expect(
      parse(progressCircleSvg({ value: 0 }))
        .querySelector('[data-part="fill"]')
        ?.getAttribute('opacity'),
    ).toBe('0');
  });

  it('indeterminate: no value, no dasharray attribute, state says so', () => {
    for (const html of [progressCircleSvg(), progressCircleSvg({ value: Number.NaN })]) {
      expect(html).not.toContain('stroke-dasharray');
      expect(parse(html).querySelector('svg')?.getAttribute('data-state')).toBe('indeterminate');
    }
  });

  it('size lands on the svg, default m', () => {
    expect(parse(progressCircleSvg()).querySelector('svg')?.getAttribute('data-size')).toBe('m');
    expect(
      parse(progressCircleSvg({ size: 's' }))
        .querySelector('svg')
        ?.getAttribute('data-size'),
    ).toBe('s');
  });

  it('imports no DOM or Astro (a lazy chunk imports it)', () => {
    const src = readFileSync(new URL('../src/components/ui/progress-circle.mjs', import.meta.url), 'utf8');
    expect(src).not.toMatch(/^import /m);
  });
});

describe('C-265 ProgressCircle SSR', () => {
  let container: AstroContainer;
  beforeAll(async () => {
    container = await AstroContainer.create();
  });
  const render = async (props: Record<string, unknown>) => {
    const html = await container.renderToString(ProgressCircle, { props });
    return { html, root: parse(html).querySelector('[role="progressbar"]') as HTMLElement };
  };

  it('determinate: progressbar with name, range, valuenow, --_value and state', async () => {
    const { root } = await render({ label: 'Upload', value: 40, tone: 'success', size: 'l' });
    expect(root.getAttribute('aria-label')).toBe('Upload');
    expect(root.getAttribute('aria-valuemin')).toBe('0');
    expect(root.getAttribute('aria-valuemax')).toBe('100');
    expect(root.getAttribute('aria-valuenow')).toBe('40');
    expect(root.getAttribute('data-state')).toBe('determinate');
    expect(root.getAttribute('data-tone')).toBe('success');
    expect(root.getAttribute('data-size')).toBe('l');
    expect(root.getAttribute('style')).toContain('--_value:40');
    expect(root.querySelector('[data-part="fill"]')?.getAttribute('stroke-dasharray')).toBe('40 100');
  });

  it('indeterminate: no aria-valuenow, no --_value', async () => {
    const { root, html } = await render({ label: 'Loading' });
    expect(root.hasAttribute('aria-valuenow')).toBe(false);
    expect(root.getAttribute('data-state')).toBe('indeterminate');
    expect(root.getAttribute('style')).toBeNull();
    expect(html).not.toContain('stroke-dasharray');
  });

  it('showValue: aria-hidden rounded percentage, only when determinate', async () => {
    const on = await render({ label: 'x', value: 66.6, showValue: true });
    const text = on.root.querySelector('.ocx-ui-progress-circle__value');
    expect(text?.textContent).toBe('67%');
    expect(text?.getAttribute('aria-hidden')).toBe('true');
    expect(
      (await render({ label: 'x', showValue: true })).root.querySelector('.ocx-ui-progress-circle__value'),
    ).toBeNull();
    expect((await render({ label: 'x', value: 5 })).root.querySelector('.ocx-ui-progress-circle__value')).toBeNull();
  });

  it('ships no JS', async () => {
    expect((await render({ label: 'x', value: 1 })).html).not.toMatch(/<script/i);
  });

  it('css: in @layer ocx, tokens only', () => {
    const css = readFileSync(new URL('../src/components/ui/progress-circle.css', import.meta.url), 'utf8');
    expect(css).toMatch(/@layer ocx\s*\{/);
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(/i);
    expect(css).not.toMatch(/--ocx-color-accent/);
  });

  it('R5 a value change glides on slow ease-out where the value is set; the arc and opacity follow', () => {
    const css = readFileSync(new URL('../src/components/ui/progress-circle.css', import.meta.url), 'utf8');
    expect(css).toMatch(/@property --_value \{\s*syntax: '<number>';\s*inherits: true;/);
    expect(css).toMatch(
      /\.ocx-ui-progress-circle\[style\*='--_value'\],\s*\.ocx-ui-progress-circle__ring\[style\*='--_value'\] \{\s*transition: --_value var\(--ocx-duration-slow\) var\(--ocx-ease-out\);/,
    );
    expect(css).not.toMatch(/transition:[^;]*stroke-dasharray/);
  });
});
