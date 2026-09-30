// C-270 Slider SSR (node env, Astro Container): single and range markup equals ssrApi for the same
// props (C-130a), hidden inputs, marks, format, disabled. Behaviour: ui-slider.dom.test.ts.
import { readFileSync } from 'node:fs';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
// @ts-expect-error jsdom ships no types and @types/jsdom is not a dependency
import * as jsdom from 'jsdom';
import { beforeAll, describe, expect, it } from 'vitest';
import { formatValue } from '../src/components/ui/range.mjs';
import { connect, machine } from '../src/components/ui/slider.zag.mjs';
import { ssrApi } from '../src/components/ui/zag-runtime.mjs';
import { domAttrs, expectSsrMatchesConnect } from './zag-helpers.ts';

type Win = Window & typeof globalThis;
type Component = Parameters<AstroContainer['renderToString']>[0];
const { JSDOM } = jsdom as { JSDOM: new (html: string) => { window: Win } };
// Template import through a variable: tsc has no .astro module types (as in chrome.test.ts).
const path = '../src/components/ui/Slider.astro';
const Slider = ((await import(path)) as { default: Component }).default;

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});

async function render(props: Record<string, unknown>) {
  const html = await container.renderToString(Slider, { props });
  const doc = new JSDOM(`<body>${html}</body>`).window.document;
  const root = doc.querySelector<HTMLElement>('[data-zag-root="slider"]') as HTMLElement;
  const format = root.dataset['ocxFormat']
    ? (JSON.parse(root.dataset['ocxFormat']) as Intl.NumberFormatOptions)
    : undefined;
  // The api SSR drew from: data-zag-props + the id + the values + the format's aria text.
  const api = ssrApi(machine, connect, {
    ...(JSON.parse(root.dataset['zagProps'] ?? '{}') as Record<string, unknown>),
    id: root.dataset['zagId'],
    defaultValue:
      (props['value'] as number | number[] | undefined) instanceof Array ? props['value'] : [props['value']],
    ...(format && { getAriaValueText: ({ value }: { value: number }) => formatValue(value, format) }),
  });
  return { html, doc, root, api };
}

const OWN_ROOT = (root: HTMLElement) => ({
  'data-zag-root': root.dataset['zagRoot'],
  'data-zag-id': root.dataset['zagId'],
  'data-zag-state': root.dataset['zagState'],
  'data-zag-props': root.dataset['zagProps'],
  'data-ocx-format': root.dataset['ocxFormat'],
});
const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim();

describe('C-270 Slider single SSR equals ssrApi (C-130a)', () => {
  it('every part carries exactly the attributes connect() yields, with no data-focus', async () => {
    const { html, doc, root, api } = await render({
      label: 'Volume',
      value: 40,
      name: 'volume',
      marks: [0, 50, 100],
    });
    expectSsrMatchesConnect(html, 'root', { ...api.getRootProps(), ...OWN_ROOT(root) });
    for (const [part, attrs] of [
      ['label', api.getLabelProps()],
      ['value-text', api.getValueTextProps()],
      ['control', api.getControlProps()],
      ['track', api.getTrackProps()],
      ['range', api.getRangeProps()],
      ['thumb', api.getThumbProps({ index: 0 })],
      ['marker-group', api.getMarkerGroupProps()],
    ] as const)
      expectSsrMatchesConnect(html, part, attrs);
    const markers = [...doc.querySelectorAll('[data-part="marker"]')];
    expect(markers).toHaveLength(3);
    [0, 50, 100].forEach((value, i) =>
      expectSsrMatchesConnect(markers[i]?.outerHTML ?? '', 'marker', api.getMarkerProps({ value })),
    );
    expect(doc.querySelector('[data-focus], [data-focus-visible]')).toBeNull();
  });

  it('root is idle with data-zag-props holding the data props; a single thumb is named by the label', async () => {
    const { doc, root } = await render({ label: 'Volume', value: 40, min: 10, max: 60, step: 5 });
    expect(root.dataset['zagState']).toBe('idle');
    const props = JSON.parse(root.dataset['zagProps'] ?? '') as unknown;
    expect(props).toEqual({ min: 10, max: 60, step: 5, thumbAlignment: 'center' });
    const thumb = doc.querySelector('[role="slider"]') as HTMLElement;
    expect(thumb.getAttribute('aria-labelledby')).toBe(doc.querySelector('[data-part="label"]')?.id);
    expect(thumb.hasAttribute('aria-label')).toBe(false);
    expect(thumb.getAttribute('aria-valuenow')).toBe('40');
    expect(thumb.getAttribute('aria-valuemin')).toBe('10');
    expect(thumb.getAttribute('aria-valuemax')).toBe('60');
    expect(thumb.getAttribute('tabindex')).toBe('0');
  });

  it('first paint is plain percentages: no measured thumb size (D-P12)', async () => {
    const { doc, root } = await render({ label: 'Volume', value: 25 });
    const style = root.getAttribute('style') ?? '';
    expect(style).toContain('--slider-thumb-offset-0:25%');
    expect(style).toContain('--slider-range-start:0%');
    expect(style).toContain('--slider-range-end:75%');
    expect(doc.querySelector('[role="slider"]')?.getAttribute('style')).toContain('visibility:visible');
  });

  it('the value text shows the number; showValue=false drops the part', async () => {
    const on = await render({ label: 'Volume', value: 40 });
    expect(text(on.doc.querySelector('[data-part="value-text"]'))).toBe('40');
    const off = await render({ label: 'Volume', value: 40, showValue: false });
    expect(off.doc.querySelector('[data-part="value-text"]')).toBeNull();
  });

  it('hideLabel keeps the label as the name, marked data-hidden', async () => {
    const { doc } = await render({ label: 'Volume', value: 40, hideLabel: true });
    const label = doc.querySelector('[data-part="label"]');
    expect(label?.hasAttribute('data-hidden')).toBe(true);
    expect(label?.tagName).toBe('LABEL');
  });
});

describe('C-270 Slider hidden inputs', () => {
  it('a single thumb submits `name` through one hidden input equal to connect()', async () => {
    const { doc, api } = await render({ label: 'Volume', value: 40, name: 'volume' });
    const inputs = [...doc.querySelectorAll('[data-part="thumb"] input')];
    expect(inputs).toHaveLength(1);
    const attrs = Object.fromEntries([...(inputs[0]?.attributes ?? [])].map((a) => [a.name, a.value]));
    expect(attrs).toEqual(domAttrs(api.getHiddenInputProps({ index: 0 })));
    expect(attrs).toMatchObject({ name: 'volume', value: '40', hidden: '' });
  });

  it('a range has one hidden input per thumb, both named name[] as Zag builds them', async () => {
    const { doc, api } = await render({ label: 'Price', value: [20, 80], name: 'price' });
    const inputs = [...doc.querySelectorAll<HTMLInputElement>('[data-part="thumb"] input')];
    expect(inputs.map((i) => [i.getAttribute('name'), i.getAttribute('value')])).toEqual([
      ['price[]', '20'],
      ['price[]', '80'],
    ]);
    inputs.forEach((input, index) =>
      expect(Object.fromEntries([...input.attributes].map((a) => [a.name, a.value]))).toEqual(
        domAttrs(api.getHiddenInputProps({ index })),
      ),
    );
  });

  it('no name, no name attribute (the field stays out of a form)', async () => {
    const { doc } = await render({ label: 'Volume', value: 40 });
    expect(doc.querySelector('[data-part="thumb"] input')?.hasAttribute('name')).toBe(false);
  });
});

describe('C-270 Slider range SSR', () => {
  it('two thumbs with the default Minimum/Maximum names, each naming itself', async () => {
    const { html, doc, root, api } = await render({ label: 'Price', value: [20, 80], name: 'price' });
    expectSsrMatchesConnect(html, 'root', { ...api.getRootProps(), ...OWN_ROOT(root) });
    const thumbs = [...doc.querySelectorAll<HTMLElement>('[role="slider"]')];
    expect(thumbs).toHaveLength(2);
    expect(thumbs.map((t) => t.getAttribute('aria-label'))).toEqual(['Minimum Price', 'Maximum Price']);
    // aria-labelledby beats aria-label, so it must not be the shared label: it is the thumb itself.
    expect(thumbs.map((t) => t.getAttribute('aria-labelledby'))).toEqual(thumbs.map((t) => t.id));
    thumbs.forEach((thumb, index) => expectSsrMatchesConnect(thumb.outerHTML, 'thumb', api.getThumbProps({ index })));
    expect(thumbs.map((t) => t.getAttribute('aria-valuenow'))).toEqual(['20', '80']);
    // Each thumb's own bounds keep the other from being crossed.
    expect(thumbs.map((t) => [t.getAttribute('aria-valuemin'), t.getAttribute('aria-valuemax')])).toEqual([
      ['0', '80'],
      ['20', '100'],
    ]);
  });

  it('the range fills between the thumbs and the value text reads "a – b"', async () => {
    const { doc, root } = await render({ label: 'Price', value: [20, 80] });
    const style = root.getAttribute('style') ?? '';
    expect(style).toContain('--slider-range-start:20%');
    expect(style).toContain('--slider-range-end:20%');
    expect(text(doc.querySelector('[data-part="value-text"]'))).toBe('20 – 80');
  });

  it('thumbLabels replace the default names', async () => {
    const { doc } = await render({ label: 'Price', value: [20, 80], thumbLabels: ['From', 'To'] });
    expect([...doc.querySelectorAll('[role="slider"]')].map((t) => t.getAttribute('aria-label'))).toEqual([
      'From',
      'To',
    ]);
  });

  it('a single slider takes thumbLabels too', async () => {
    const { doc } = await render({ label: 'Volume', value: 4, thumbLabels: ['Master volume'] });
    const thumb = doc.querySelector('[role="slider"]') as HTMLElement;
    expect(thumb.getAttribute('aria-label')).toBe('Master volume');
    expect(thumb.getAttribute('aria-labelledby')).toBe(thumb.id);
  });
});

describe('C-270 Slider format, marks, disabled', () => {
  const usd = { style: 'currency', currency: 'USD', maximumFractionDigits: 0 } as const;

  it('format drives the value text, aria-valuetext and data-ocx-format', async () => {
    const { doc, root, html, api } = await render({ label: 'Budget', value: [20, 80], format: usd });
    expect(text(doc.querySelector('[data-part="value-text"]'))).toBe('$20 – $80');
    expect([...doc.querySelectorAll('[role="slider"]')].map((t) => t.getAttribute('aria-valuetext'))).toEqual([
      '$20',
      '$80',
    ]);
    expect(JSON.parse(root.dataset['ocxFormat'] ?? '')).toEqual(usd);
    expectSsrMatchesConnect(html, 'thumb', api.getThumbProps({ index: 0 }));
  });

  it('without format there is no aria-valuetext (aria-valuenow says it)', async () => {
    const { doc, root } = await render({ label: 'Volume', value: 40 });
    expect(doc.querySelector('[role="slider"]')?.hasAttribute('aria-valuetext')).toBe(false);
    expect(root.hasAttribute('data-ocx-format')).toBe(false);
  });

  it('marks: a number is labelled with its formatted value, an object with its label', async () => {
    const { doc } = await render({
      label: 'Budget',
      value: 40,
      format: usd,
      marks: [0, 50, { value: 100, label: 'max' }],
    });
    const group = doc.querySelector('[data-part="marker-group"]');
    expect(group?.getAttribute('aria-hidden')).toBe('true');
    const marks = [...doc.querySelectorAll('[data-part="marker"]')];
    expect(marks.map((m) => [m.getAttribute('data-value'), m.textContent])).toEqual([
      ['0', '$0'],
      ['50', '$50'],
      ['100', 'max'],
    ]);
    expect(marks[1]?.getAttribute('style')).toContain('inset-inline-start:50%');
  });

  it('no marks, no marker group', async () => {
    const { doc } = await render({ label: 'Volume', value: 40 });
    expect(doc.querySelector('[data-part="marker-group"]')).toBeNull();
  });

  it('disabled: data-disabled everywhere, the thumb is out of the tab order and aria-disabled', async () => {
    const { html, doc, root, api } = await render({ label: 'Volume', value: 40, name: 'v', disabled: true });
    expectSsrMatchesConnect(html, 'root', { ...api.getRootProps(), ...OWN_ROOT(root) });
    expect(root.hasAttribute('data-disabled')).toBe(true);
    const thumb = doc.querySelector('[role="slider"]') as HTMLElement;
    expect(thumb.hasAttribute('data-disabled')).toBe(true);
    expect(thumb.getAttribute('aria-disabled')).toBe('true');
    expect(thumb.hasAttribute('tabindex')).toBe(false);
    expect(doc.querySelector('[data-part="label"]')?.hasAttribute('data-disabled')).toBe(true);
  });

  it('disabled: the hidden input is disabled too, so the form does not submit it', async () => {
    const { doc } = await render({ label: 'Volume', value: 40, name: 'v', disabled: true });
    expect(doc.querySelector<HTMLInputElement>('[data-part="thumb"] input')?.disabled).toBe(true);
  });

  it('first paint shows the snapped, clamped value the machine holds, not the raw prop', async () => {
    const over = await render({ label: 'Volume', value: 150 });
    expect(over.doc.querySelector('[data-part="value-text"]')?.textContent).toBe('100');
    const off = await render({ label: 'Volume', value: 7, step: 5 });
    expect(off.doc.querySelector('[data-part="value-text"]')?.textContent).toBe('5');
    expect(off.doc.querySelector('[role="slider"]')?.getAttribute('aria-valuenow')).toBe('5');
  });

  it('the zag passthrough reaches data-zag-props and the SSR api (largeStep, aria)', async () => {
    const { root } = await render({ label: 'Volume', value: 40, zag: { largeStep: 25, minStepsBetweenThumbs: 2 } });
    expect(JSON.parse(root.dataset['zagProps'] ?? '')).toMatchObject({ largeStep: 25, minStepsBetweenThumbs: 2 });
  });

  it('each instance has its own id space; class merges onto the root', async () => {
    const a = await render({ label: 'A', value: 1, class: 'mine' });
    const b = await render({ label: 'B', value: 1 });
    expect(a.root.classList.contains('mine')).toBe(true);
    expect(a.root.dataset['zagId']).not.toBe(b.root.dataset['zagId']);
    expect(a.root.id).not.toBe(b.root.id);
  });
});

describe('C-270 Slider modules and styles (D-Z17, C-130f)', () => {
  const read = (name: string) => readFileSync(new URL(`../src/components/ui/${name}`, import.meta.url), 'utf8');

  it('@zag-js/slider is imported (as a value) only by slider.zag.mjs', () => {
    expect(read('slider.zag.mjs')).toMatch(/from '@zag-js\/slider'/);
    for (const f of ['Slider.astro', 'range.mjs', 'Meter.astro'])
      expect(read(f)).not.toMatch(/^import (?!type\b)[^\n]*@zag-js\//m);
  });

  it('the wrapper mounts the machine lazily, on interaction, without replay', () => {
    const src = read('Slider.astro');
    expect(src).toMatch(/import\('\.\/slider\.zag\.mjs'\)/);
    expect(src).toMatch(/replay: false/);
    expect(src).not.toMatch(/trigger:/);
  });

  it('range.css: @layer ocx, tokens only, the slider thumb and track tokens', () => {
    const css = read('range.css');
    expect(css).toMatch(/@layer ocx\s*\{/);
    expect(css).toMatch(/var\(--ocx-slider-thumb\)/);
    expect(css).toMatch(/var\(--ocx-track-size\)/);
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(/i);
  });
});
