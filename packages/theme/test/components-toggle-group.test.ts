// <ToggleGroup> on Zag `toggle-group` (C-153, C-130a/b/f): SSR equal to connect() for single
// (radio group) and multiple (pressed buttons) selection, styles in @layer ocx, tokens only.
import { readFileSync } from 'node:fs';
import * as toggleZag from '@zag-js/toggle-group';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
// @ts-expect-error jsdom ships no types and @types/jsdom is not a dependency
import * as jsdom from 'jsdom';
import { beforeAll, describe, expect, it } from 'vitest';
import { render as paint } from '../src/components/toggle-group.zag.mjs';
import { ssrApi } from '../src/components/ui/zag-runtime.mjs';
import { domAttrs } from './zag-helpers.ts';

type Component = Parameters<AstroContainer['renderToString']>[0];
const { JSDOM } = jsdom as { JSDOM: new (html: string) => { window: Window } };
// Template import: tsc has no .astro module types (as in chrome.test.ts).
const path = '../src/components/ToggleGroup.astro';
const ToggleGroup = ((await import(path)) as { default: Component }).default;

const ITEMS = [
  { value: 'linux', label: 'linux' },
  { value: 'macos', label: 'macos' },
  { value: 'windows', label: 'windows' },
  { value: 'freebsd', label: 'freebsd', disabled: true },
];
const OWN = /^(class|data-astro-.*|data-zag-(root|state|props|id)|aria-label)$/;
const zagAttrs = (el: Element | null | undefined) =>
  Object.fromEntries([...(el?.attributes ?? [])].filter((a) => !OWN.test(a.name)).map((a) => [a.name, a.value]));

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});
const render = async (props: Record<string, unknown>) =>
  new JSDOM(await container.renderToString(ToggleGroup, { props: { label: 'Platform', items: ITEMS, ...props } }))
    .window.document;

describe('C-130a/b ToggleGroup SSR equals connect()', () => {
  it.each([
    ['single, one pressed', { value: 'macos' }, { defaultValue: ['macos'], deselectable: false }],
    ['single, none pressed', {}, { defaultValue: [], deselectable: false }],
    [
      'multiple',
      { multiple: true, value: ['linux', 'windows'] },
      { defaultValue: ['linux', 'windows'], multiple: true },
    ],
  ])('C-130a %s: root and every item equal ssrApi, no data-focus', async (_, props, machineProps) => {
    const d = await render(props);
    const root = d.querySelector<HTMLElement>('[data-zag-root]');
    expect(JSON.parse(root?.dataset['zagProps'] ?? '')).toEqual(machineProps);
    const api = ssrApi(toggleZag.machine, toggleZag.connect, { id: root?.dataset['zagId'], ...machineProps });
    expect(zagAttrs(root)).toEqual(domAttrs(api.getRootProps()));
    const items = [...d.querySelectorAll('[data-part="item"]')];
    expect(items.map((i) => i.textContent?.trim())).toEqual(ITEMS.map((i) => i.label));
    ITEMS.forEach(({ value, disabled }, i) =>
      expect(zagAttrs(items[i])).toEqual(domAttrs(api.getItemProps({ value, disabled }))),
    );
    expect(d.querySelector('[data-focus], [data-focus-visible]')).toBeNull();
  });

  it('C-130b root carries data-zag-root="toggle-group", data-zag-state="idle", the SSR id and the label', async () => {
    const root = (await render({ value: 'linux' })).querySelector('[data-zag-root]');
    expect(root?.getAttribute('data-zag-root')).toBe('toggle-group');
    expect(root?.getAttribute('data-zag-state')).toBe('idle');
    expect(root?.getAttribute('data-zag-id')).toMatch(/^ocx-ui-toggle-group-\d+$/);
    expect(root?.getAttribute('aria-label')).toBe('Platform');
  });

  it('C-153 single = radio group with aria-checked; multiple = group of buttons with aria-pressed', async () => {
    const single = await render({ value: 'macos' });
    expect(single.querySelector('[data-zag-root]')?.getAttribute('role')).toBe('radiogroup');
    expect([...single.querySelectorAll('[role="radio"]')].map((i) => i.getAttribute('aria-checked'))).toEqual([
      'false',
      'true',
      'false',
      'false',
    ]);
    const multiple = await render({ multiple: true, value: 'linux' });
    expect(multiple.querySelector('[data-zag-root]')?.getAttribute('role')).toBe('group');
    expect([...multiple.querySelectorAll('button')].map((i) => i.getAttribute('aria-pressed'))).toEqual([
      'true',
      'false',
      'false',
      'false',
    ]);
  });

  it('C-106 zag props pass through to data-zag-props and SSR', async () => {
    const root = (await render({ value: 'linux', zag: { orientation: 'vertical' } })).querySelector('[data-zag-root]');
    expect(JSON.parse(root?.getAttribute('data-zag-props') ?? '')).toMatchObject({ orientation: 'vertical' });
    expect(root?.getAttribute('data-orientation')).toBe('vertical');
  });
});

describe('C-271 ToggleGroup items wear the ToggleButton look, with icons', () => {
  const ICONS = [
    { value: 'light', label: 'Light', icon: 'sun', iconOnly: true },
    { value: 'dark', label: 'Dark', icon: 'moon', iconOnly: true },
    { value: 'auto', label: 'Auto', icon: 'apple' },
    { value: 'plain', label: 'Plain' },
  ];

  it('every item carries .ocx-ui-toggle-button, text items render as before', async () => {
    const d = await render({ value: 'macos' });
    const items = [...d.querySelectorAll('[data-part="item"]')];
    expect(items.every((i) => i.classList.contains('ocx-ui-toggle-button'))).toBe(true);
    expect(items.some((i) => i.querySelector('.ocx-icon') || i.hasAttribute('data-icon-only'))).toBe(false);
    expect(items.some((i) => i.hasAttribute('aria-label'))).toBe(false);
  });

  it('icon: an Icon before the label; iconOnly: only the icon, aria-label, data-icon-only', async () => {
    const d = await render({ items: ICONS, value: 'dark' });
    const [light, dark, auto, plain] = [...d.querySelectorAll('[data-part="item"]')] as Element[];
    expect(light?.getAttribute('aria-label')).toBe('Light');
    expect(light?.hasAttribute('data-icon-only')).toBe(true);
    expect(light?.querySelector('.ocx-icon[data-icon="sun"]')).not.toBeNull();
    expect(light?.textContent?.trim()).toBe('');
    expect(dark?.getAttribute('aria-checked')).toBe('true');
    expect(auto?.querySelector('.ocx-icon[data-icon="apple"]')).not.toBeNull();
    expect(auto?.textContent?.trim()).toBe('Auto');
    expect(auto?.hasAttribute('aria-label')).toBe(false);
    expect(auto?.hasAttribute('data-icon-only')).toBe(false);
    expect(plain?.querySelector('.ocx-icon')).toBeNull();
  });

  it('iconOnly without an icon still shows the label', async () => {
    const d = await render({ items: [{ value: 'a', label: 'Alpha', iconOnly: true }] });
    const item = d.querySelector('[data-part="item"]');
    expect(item?.textContent?.trim()).toBe('Alpha');
    expect(item?.hasAttribute('data-icon-only')).toBe(false);
  });
});

describe('toggle-group.zag render emits under the root scope (C-105, C-272)', () => {
  const fire = (zagRoot?: string) => {
    const events: CustomEvent[] = [];
    const root = {
      id: 'toggle-group:x',
      dataset: zagRoot ? { zagRoot } : {},
      querySelectorAll: () => [],
      dispatchEvent: (e: CustomEvent) => events.push(e),
    } as unknown as HTMLElement;
    const api = (value: string[]) => ({ value, getRootProps: () => ({}) }) as never;
    paint(api([]), root, () => {});
    paint(api(['linux']), root, () => {});
    return events.map((e) => [e.type, e.detail as unknown, e.bubbles]);
  };

  it.each([
    ['toggle-group', 'ocx:toggle-group:change'],
    ['tag-group', 'ocx:tag-group:change'],
    [undefined, 'ocx:toggle-group:change'],
  ])('data-zag-root=%s → %s {value}, once per change', (scope, name) => {
    expect(fire(scope)).toEqual([[name, { value: ['linux'] }, true]]);
  });
});

describe('C-130f ToggleGroup styles', () => {
  const source = readFileSync(new URL('../src/components/ToggleGroup.astro', import.meta.url), 'utf8');
  const css = /<style is:global>([\s\S]*)<\/style>/.exec(source)?.[1];

  it('C-130f @layer ocx, keyed on the Zag item part and state, tokens only', () => {
    expect(css?.trim()).toMatch(/^@layer ocx \{[\s\S]*\}$/);
    expect(css).toContain(".ocx-toggle-group > [data-part='item'] + [data-part='item']");
    expect(css).not.toContain("[data-scope='toggle-group']"); // TagGroup chips share the Zag scope
    expect(css).not.toContain("[data-state='on']"); // the cell look is toggle-button.css
    expect(source).toContain("import './ui/toggle-button.css'");
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|\brgba?\(|\b\d+px\b/i);
  });
});
