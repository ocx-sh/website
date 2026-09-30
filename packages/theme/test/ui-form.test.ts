// WP14a form primitives: Button, Input, Choice (contract: .agents/research/ui-primitives.md › Contract).
// Markup via the Astro Container API, parsed with JSDOM; styles checked on the component source
// (the pattern of components-platform-icons.test.ts).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
// @ts-expect-error jsdom ships no types and @types/jsdom is not a dependency
import * as jsdom from 'jsdom';
import { beforeAll, describe, expect, it } from 'vitest';
import { ssrApi, ssrAttrs } from '../src/components/ui/zag-runtime.mjs';
import { expectSsrMatchesConnect } from './zag-helpers.ts';

type Win = Window & typeof globalThis;
type Component = Parameters<AstroContainer['renderToString']>[0];
const { JSDOM } = jsdom as { JSDOM: new (html: string) => { window: Win } };
// Template import: tsc has no .astro module types (as in chrome.test.ts).
const load = async (name: string) =>
  ((await import(`../src/components/ui/${name}.astro`)) as { default: Component }).default;
const Button = await load('Button');
const Input = await load('Input');
const Choice = await load('Choice');
const RadioGroup = await load('RadioGroup');
const checkbox = await import('../src/components/ui/checkbox.zag.mjs');
const zswitch = await import('../src/components/ui/switch.zag.mjs');
const radio = await import('../src/components/ui/radio-group.zag.mjs');

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});

async function render(c: Component, props: Record<string, unknown>, slot?: string): Promise<Document> {
  const html = await container.renderToString(c, { props, ...(slot ? { slots: { default: slot } } : {}) });
  return new JSDOM(`<body>${html}</body>`).window.document;
}

/** Button's look is the shared ui/button.css (rides in base.css). */
const style = (name: string) =>
  readFileSync(new URL(`../src/components/ui/${name.toLowerCase()}.css`, import.meta.url), 'utf8');

/** The Input box styles moved to the shared field.css (D-P2). */
const fieldStyle = () => readFileSync(new URL('../src/components/ui/field.css', import.meta.url), 'utf8');

describe('WP14a ui styles (all form primitives)', () => {
  it.each(['Button', 'Input'])('WP14a %s: styles sit in @layer ocx, tokens only (no literal colours)', (name) => {
    const s = name === 'Input' ? fieldStyle() : style(name);
    expect(s).toMatch(/@layer ocx\s*\{/);
    expect(s).toMatch(/var\(--ocx-/);
    expect(s).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(/i);
  });
});

describe('WP14a Button', () => {
  it('WP14a Button: defaults to <button type="button"> secondary m, block class ocx-ui-button', async () => {
    const doc = await render(Button, {}, 'Save');
    const b = doc.querySelector('.ocx-ui-button');
    expect(b?.tagName).toBe('BUTTON');
    expect(b?.getAttribute('type')).toBe('button');
    expect(b?.getAttribute('data-variant')).toBe('secondary');
    expect(b?.getAttribute('data-size')).toBe('m');
    expect(b?.hasAttribute('data-icon-only')).toBe(false);
    expect(b?.textContent?.trim()).toBe('Save');
  });

  it('WP14a Button: href renders an <a> with no type attribute', async () => {
    const doc = await render(Button, { href: '/docs/install/', variant: 'primary' }, 'Install');
    const a = doc.querySelector('.ocx-ui-button');
    expect(a?.tagName).toBe('A');
    expect(a?.getAttribute('href')).toBe('/docs/install/');
    expect(a?.hasAttribute('type')).toBe(false);
    expect(a?.getAttribute('data-variant')).toBe('primary');
  });

  it.each([
    ['primary', 's'],
    ['secondary', 'm'],
    ['ghost', 'l'],
  ])('WP14a Button: variant %s size %s map to data-variant / data-size', async (variant, size) => {
    const b = (await render(Button, { variant, size }, 'x')).querySelector('.ocx-ui-button');
    expect(b?.getAttribute('data-variant')).toBe(variant);
    expect(b?.getAttribute('data-size')).toBe(size);
  });

  it('WP14a Button: an aria-disabled link drops href (no focus, no navigation) and keeps role link', async () => {
    const a = (await render(Button, { href: '/docs/', 'aria-disabled': 'true' }, 'Docs')).querySelector('a');
    expect(a?.hasAttribute('href')).toBe(false);
    expect(a?.getAttribute('role')).toBe('link');
    expect(a?.getAttribute('aria-disabled')).toBe('true');
  });

  it('WP14a Button: iconOnly sets data-icon-only and keeps the caller aria-label', async () => {
    const b = (await render(Button, { iconOnly: true, 'aria-label': 'Copy' }, '<svg></svg>')).querySelector(
      '.ocx-ui-button',
    );
    expect(b?.hasAttribute('data-icon-only')).toBe(true);
    expect(b?.getAttribute('aria-label')).toBe('Copy');
  });

  it('WP14a Button: type=submit, disabled and the class pass-through reach the element', async () => {
    const b = (await render(Button, { type: 'submit', disabled: true, class: 'extra' }, 'Go')).querySelector('button');
    expect(b?.getAttribute('type')).toBe('submit');
    expect(b?.hasAttribute('disabled')).toBe(true);
    expect(b?.classList.contains('ocx-ui-button')).toBe(true);
    expect(b?.classList.contains('extra')).toBe(true);
  });

  it('WP14a Button: heights are control-lg (s) and the H38/H42 calc stopgap (m/l), ', () => {
    const s = style('Button');
    expect(s).toContain('var(--ocx-control-lg)');
    expect(s).toContain('var(--ocx-control-2xl)');
    expect(s).toContain('var(--ocx-control-3xl)');
    expect(s).toMatch(/border-radius:\s*var\(--ocx-radius-md\)/);
  });

  it('WP14a Button: variant hovers skip disabled buttons', () => {
    const s = style('Button');
    const hovers = [...s.matchAll(/([^{}]*:hover[^{]*)\{/g)].map((m) => m[1] ?? '');
    expect(hovers.length).toBeGreaterThan(0);
    for (const h of hovers) expect(h).toMatch(/:hover:not\(:disabled,\s*\[aria-disabled='true'\]\)/);
  });

  it('WP14a Button: focus is :focus-visible → --ocx-focus-ring + --ocx-focus-offset', () => {
    const s = style('Button');
    expect(s).toMatch(/:focus-visible[^{]*\{[^}]*outline:\s*var\(--ocx-focus-ring\)/);
    expect(s).toMatch(/outline-offset:\s*var\(--ocx-focus-offset\)/);
  });
});

describe('WP14a Input', () => {
  it('WP14a Input: label[for] names input.ocx-ui-input inside .ocx-ui-field; type defaults to text', async () => {
    const doc = await render(Input, { label: 'Package' });
    const field = doc.querySelector('.ocx-ui-field');
    const label = field?.querySelector('label.ocx-ui-field__label');
    const input = field?.querySelector('input.ocx-ui-input');
    expect(label?.textContent?.trim()).toBe('Package');
    expect(input?.getAttribute('type')).toBe('text');
    expect(input?.id).toMatch(/^ocx-ui-input-\d+$/);
    expect(label?.getAttribute('for')).toBe(input?.id);
    expect(label?.hasAttribute('data-hidden')).toBe(false);
    expect(input?.hasAttribute('aria-invalid')).toBe(false);
    expect(input?.hasAttribute('aria-describedby')).toBe(false);
    expect(field?.querySelector('.ocx-ui-field__msg')).toBeNull();
  });

  it('WP14a Input: two inputs get distinct deterministic ids', async () => {
    const a = (await render(Input, { label: 'A' })).querySelector('input')?.id;
    const b = (await render(Input, { label: 'B' })).querySelector('input')?.id;
    expect(a).not.toBe(b);
  });

  it('WP14a Input: hideLabel keeps the <label> (accessible name) and marks it data-hidden', async () => {
    const doc = await render(Input, { label: 'Search', hideLabel: true, type: 'search', placeholder: 'Search…' });
    const label = doc.querySelector('label.ocx-ui-field__label');
    expect(label?.hasAttribute('data-hidden')).toBe(true);
    expect(label?.textContent?.trim()).toBe('Search');
    const input = doc.querySelector('input');
    expect(input?.getAttribute('type')).toBe('search');
    expect(input?.getAttribute('placeholder')).toBe('Search…');
  });

  it('WP14a Input: hint renders p.ocx-ui-field__msg referenced by aria-describedby', async () => {
    const doc = await render(Input, { label: 'URL', type: 'url', hint: 'An https:// address.', id: 'u' });
    const msg = doc.querySelector('p.ocx-ui-field__msg');
    expect(msg?.textContent?.trim()).toBe('An https:// address.');
    expect(doc.querySelector('input')?.getAttribute('aria-describedby')).toBe(msg?.id);
    expect(doc.querySelector('input')?.hasAttribute('aria-invalid')).toBe(false);
  });

  it('WP14a Input: error replaces the hint, sets aria-invalid and data-invalid', async () => {
    const doc = await render(Input, { label: 'Email', type: 'email', hint: 'h', error: 'Use name@host.' });
    const msgs = doc.querySelectorAll('.ocx-ui-field__msg');
    expect(msgs).toHaveLength(1);
    expect(msgs[0]?.textContent?.trim()).toBe('Use name@host.');
    const input = doc.querySelector('input');
    expect(input?.getAttribute('aria-invalid')).toBe('true');
    expect(input?.getAttribute('aria-describedby')).toBe(msgs[0]?.id);
    expect(doc.querySelector('.ocx-ui-field')?.hasAttribute('data-invalid')).toBe(true);
  });

  it('WP14a Input: class goes on the field wrapper; name/value/disabled reach the input', async () => {
    const doc = await render(Input, { label: 'N', class: 'extra', name: 'n', value: 'v', disabled: true });
    expect(doc.querySelector('.ocx-ui-field')?.classList.contains('extra')).toBe(true);
    const input = doc.querySelector('input');
    expect(input?.getAttribute('name')).toBe('n');
    expect(input?.getAttribute('value')).toBe('v');
    expect(input?.hasAttribute('disabled')).toBe(true);
  });

  it('WP14a Input: H38 box, mono text-sm, focus = border-color --ocx-color-focus with no outline', () => {
    const s = fieldStyle();
    expect(s).toContain('var(--ocx-control-2xl)');
    expect(s).toContain('var(--ocx-font-mono)');
    expect(s).toContain('var(--ocx-text-sm)');
    expect(s).toMatch(/:focus(-visible)?[^{]*\{[^}]*border-color:\s*var\(--ocx-color-focus\)/);
    expect(s).toMatch(/outline:\s*(none|0)/);
    expect(s).toContain('var(--ocx-color-danger)');
  });

  it('WP14a Input: an invalid field that has focus shows the focus border, not the danger one', () => {
    expect(fieldStyle()).toMatch(
      /\[aria-invalid=["']?true["']?\]:focus[^{]*\{[^}]*border-color:\s*var\(--ocx-color-focus\)/,
    );
  });

  it('WP14a Input: a caller aria-describedby is merged with the message id', async () => {
    const doc = await render(Input, { label: 'U', hint: 'h', id: 'u', 'aria-describedby': 'ext' });
    expect(doc.querySelector('input')?.getAttribute('aria-describedby')).toBe('ext u-msg');
  });

  it('WP14a Input: data-hidden label is visually hidden, not display:none (keeps the accessible name)', () => {
    const s = fieldStyle();
    const rule = /\[data-hidden\][^{]*\{([^}]*)\}/.exec(s)?.[1] ?? '';
    expect(rule).not.toBe('');
    expect(rule).not.toMatch(/display:\s*none/);
  });
});

const choiceCss = () => readFileSync(new URL('../src/components/ui/choice.css', import.meta.url), 'utf8');
const zagId = (doc: Document) => doc.querySelector('[data-zag-root]')?.getAttribute('data-zag-id') ?? '';

describe('C-160 Choice', () => {
  it.each([
    ['checkbox', 'checkbox', null],
    ['radio', 'radio', null],
    ['switch', 'checkbox', 'switch'],
  ])('WP14a C-160 Choice: type %s → input[type=%s] role=%s inside its label', async (type, inputType, role) => {
    const doc = await render(Choice, { type, label: 'Offline', name: 'o' });
    const label = doc.querySelector('label.ocx-ui-choice');
    expect(label?.getAttribute('data-type')).toBe(type);
    const input = label?.querySelector('input.ocx-ui-choice__input');
    expect(input?.getAttribute('type')).toBe(inputType);
    expect(input?.getAttribute('role')).toBe(role);
    expect(input?.getAttribute('name')).toBe('o');
    expect(label?.querySelector('.ocx-ui-choice__label')?.textContent?.trim()).toBe('Offline');
    expect(label?.querySelector('.ocx-ui-choice__box')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('WP14a C-160 Choice: defaults to checkbox; checked, disabled and class pass through (as bare boolean attributes)', async () => {
    const doc = await render(Choice, { label: 'L', checked: true, disabled: true, class: 'extra' });
    const label = doc.querySelector('label.ocx-ui-choice');
    expect(label?.getAttribute('data-type')).toBe('checkbox');
    expect(label?.classList.contains('extra')).toBe(true);
    const input = doc.querySelector('input');
    expect(input?.hasAttribute('checked')).toBe(true);
    expect(input?.hasAttribute('disabled')).toBe(true);
  });

  it.each([
    ['checkbox', checkbox],
    ['switch', zswitch],
  ] as const)(
    'C-130a C-130b C-160 %s: SSR equals connect() for the input state; root idle with the zag passthrough only',
    async (type, mod) => {
      const props = {
        type,
        label: 'Offline',
        checked: true,
        name: 'o',
        value: 'yes',
        required: true,
        zag: { readOnly: false },
      };
      const html = await container.renderToString(Choice, { props });
      const doc = new JSDOM(html).window.document;
      const machineProps = {
        id: zagId(doc),
        defaultChecked: true,
        required: true,
        name: 'o',
        value: 'yes',
        readOnly: false,
      };
      const api =
        mod === zswitch
          ? ssrApi(zswitch.machine, zswitch.connect, machineProps)
          : ssrApi(checkbox.machine, checkbox.connect, machineProps);
      expectSsrMatchesConnect(html, 'control', api.getControlProps());
      expectSsrMatchesConnect(html, 'label', api.getLabelProps());
      // The native input (no data-part): every connect() attribute, plus only class and the switch role.
      const input = doc.querySelector('input');
      const got = Object.fromEntries(
        [...(input?.attributes ?? [])]
          .filter((a) => a.name !== 'class' && a.name !== 'role')
          .map((a) => [a.name, a.value]),
      );
      const want = Object.fromEntries(
        Object.entries(ssrAttrs(api.getHiddenInputProps())).map(([k, v]) => [k, v === true ? '' : v]),
      );
      expect(got).toEqual(want);
      expect(input?.getAttribute('role')).toBe(type === 'switch' ? 'switch' : null);
      const root = doc.querySelector('label');
      expect(root?.getAttribute('data-zag-root')).toBe(type);
      expect(root?.getAttribute('data-zag-state')).toBe('idle');
      expect(JSON.parse(root?.getAttribute('data-zag-props') ?? '')).toEqual({ readOnly: false });
      expect(root?.getAttribute('for')).toBe(doc.querySelector('input')?.id);
      expect(html).not.toMatch(/data-focus/);
    },
  );

  it('C-160 a lone radio has no machine: a plain native input', async () => {
    const doc = await render(Choice, { type: 'radio', label: 'x', name: 'r' });
    expect(doc.querySelector('[data-zag-root]')).toBeNull();
  });

  it('C-130f C-160 choice.css: @layer ocx, tokens only; checked, focus and disabled visuals key on the native input (JS off)', () => {
    const s = choiceCss();
    expect(s).toMatch(/^[^{]*@layer ocx\s*\{/);
    expect(s).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(/i);
    expect(s).toMatch(/:has\(> :checked\) > \.ocx-ui-choice__box\s*\{[^}]*var\(--ocx-color-accent\)/);
    expect(s).toMatch(/:has\(> :focus-visible\) > \.ocx-ui-choice__box\s*\{[^}]*outline:\s*var\(--ocx-focus-ring\)/);
    expect(s).toMatch(/:has\(> :disabled\)/);
    // Never on data-state: after a JS-off click it would contradict the input.
    expect(s).not.toMatch(/data-state/);
    expect(s).toContain('var(--ocx-radius-full)');
  });
});

describe('C-160 Choice switch geometry', () => {
  const s = choiceCss();
  const rule = (sel: string) =>
    s.match(new RegExp(`${sel.replace(/[()>[\]'.:]/g, '\\$&')}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
  const box = rule("[data-type='switch'] > .ocx-ui-choice__box");
  const thumb = rule("[data-type='switch'] > .ocx-ui-choice__box::before");
  const on = rule("[data-type='switch']:has(> :checked) > .ocx-ui-choice__box::before");

  it('the track is as high as the checkbox box: no height override, both read --ocx-control-choice', () => {
    expect(box).not.toMatch(/block-size/);
    expect(rule('.ocx-ui-choice__box')).toMatch(/block-size:\s*var\(--ocx-control-choice\)/);
    expect(box).toMatch(/--ocx-switch-thumb:\s*calc\(var\(--ocx-control-choice\)/);
  });

  it('one inset token places the thumb top and start; travel is track - thumb - 2 x inset', () => {
    expect(s.match(/--ocx-switch-inset:/g)).toHaveLength(1);
    expect(thumb).toMatch(/inset-block-start:\s*var\(--ocx-switch-inset\)/);
    expect(thumb).toMatch(/inset-inline-start:\s*var\(--ocx-switch-inset\)/);
    expect(on).toMatch(/inset-inline-start:\s*calc\(100% - var\(--ocx-switch-thumb\) - var\(--ocx-switch-inset\)\)/);
  });
});

describe('C-160 Choice switch thumb keeps one size', () => {
  const s = choiceCss();
  const rules = [...s.matchAll(/([^{}]*\[data-type='switch'\][^{}]*::before)\s*\{([^}]*)\}/g)];
  const stateRules = rules.filter(([, sel]) => /:has\(/.test(sel!));

  it('size is set once on the base thumb from one token; no state rule touches size, scale or border', () => {
    const base = rules.find(([, sel]) => !/:has\(/.test(sel!))?.[2] ?? '';
    expect(base).toMatch(/inline-size:\s*var\(--ocx-switch-thumb\)/);
    expect(base).toMatch(/block-size:\s*var\(--ocx-switch-thumb\)/);
    expect(stateRules.length).toBeGreaterThan(0);
    for (const [, sel, body] of stateRules)
      expect(body, sel).not.toMatch(/size|scale|transform|border|padding|margin|width|height/);
    expect(base).not.toMatch(/transform/);
    expect(base).not.toMatch(/transition:[^;]*(size|transform|scale)/);
  });

  it('only position and colour change; the off thumb shares the track-edge tone so it does not glow larger than the ink one', () => {
    expect(rules.find(([, sel]) => !/:has\(/.test(sel!))?.[2]).toMatch(
      /background:\s*var\(--ocx-color-border-control\)/,
    );
    for (const [, , body] of stateRules)
      for (const [, prop] of body!.matchAll(/([\w-]+):/g)) expect(['inset-inline-start', 'background']).toContain(prop);
  });
});

describe('C-160 Choice motion', () => {
  const s = choiceCss();
  it('marks and thumb animate on state change through duration tokens (zeroed under reduced motion)', () => {
    const transitions = s.match(/transition:[^;]*;/g) ?? [];
    expect(transitions.length).toBeGreaterThanOrEqual(4);
    for (const t of s.match(/transition:[^;]*;/gs) ?? []) expect(t).toMatch(/var\(--ocx-duration-/);
    expect(s).not.toMatch(/animation|@starting-style/);
    expect(s).toMatch(/opacity:\s*0;/);
  });
});

describe('C-160 RadioGroup', () => {
  const items = [
    { value: 'project', label: 'project' },
    { value: 'user', label: 'user' },
    { value: 'system', label: 'system', disabled: true },
  ];

  it('C-130a C-130b C-160 SSR equals connect(); a radiogroup named by its label; native radios share the name', async () => {
    const html = await container.renderToString(RadioGroup, {
      props: { label: 'Scope', name: 'scope', items, value: 'user', orientation: 'horizontal' },
    });
    const doc = new JSDOM(html).window.document;
    const api = ssrApi(radio.machine, radio.connect, {
      id: zagId(doc),
      name: 'scope',
      orientation: 'horizontal',
      defaultValue: 'user',
    });
    expectSsrMatchesConnect(html, 'label', api.getLabelProps());
    expectSsrMatchesConnect(html, 'item', { ...api.getItemProps(items[0]!), 'data-type': 'radio' });
    expectSsrMatchesConnect(html, 'item-control', api.getItemControlProps(items[0]!));
    const root = doc.querySelector('[data-zag-root="radio-group"]');
    expect(root?.getAttribute('role')).toBe('radiogroup');
    expect(root?.getAttribute('data-zag-state')).toBe('idle');
    expect(root?.getAttribute('data-zag-props')).toBe('{}');
    expect(doc.getElementById(root?.getAttribute('aria-labelledby') ?? '')?.textContent.trim()).toBe('Scope');
    const inputs = [...doc.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
    expect(inputs.map((i) => [i.name, i.value, i.checked, i.disabled])).toEqual([
      ['scope', 'project', false, false],
      ['scope', 'user', true, false],
      ['scope', 'system', false, true],
    ]);
    expect(html).not.toMatch(/data-focus/);
  });

  it('C-160 RadioGroup items wear the Choice radio look', async () => {
    const doc = await render(RadioGroup, { label: 'Scope', name: 'scope', items });
    const item = doc.querySelector('label.ocx-ui-choice[data-type="radio"]');
    expect(
      item?.querySelector('input.ocx-ui-choice__input + .ocx-ui-choice__box + .ocx-ui-choice__label'),
    ).not.toBeNull();
    expect(doc.querySelector('[data-zag-root]')?.getAttribute('data-orientation')).toBe('vertical');
  });
});

describe('WP14a package export', () => {
  it('WP14a: @ocx-sh/theme/components/ui/Button.astro resolves through the ./components/*.astro export', () => {
    const require = createRequire(new URL('../../../examples/starlight/package.json', import.meta.url));
    expect(require.resolve('@ocx-sh/theme/components/ui/Button.astro').replaceAll('\\', '/')).toMatch(
      /packages\/theme\/src\/components\/ui\/Button\.astro$/,
    );
  });
});
