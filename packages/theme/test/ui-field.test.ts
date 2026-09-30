// C-260 Label, C-261 field.css, C-262 InputGroup, C-263 Input slots. Markup via the Astro Container
// API (node env), parsed with JSDOM.
import { readFileSync } from 'node:fs';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
// @ts-expect-error jsdom ships no types and @types/jsdom is not a dependency
import * as jsdom from 'jsdom';
import { beforeAll, describe, expect, it } from 'vitest';

type Component = Parameters<AstroContainer['renderToString']>[0];
const { JSDOM } = jsdom as { JSDOM: new (html: string) => { window: { document: Document } } };
// Template import: tsc has no .astro module types (as in chrome.test.ts).
const load = async (name: string) =>
  ((await import(`../src/components/ui/${name}.astro`)) as { default: Component }).default;
const Label = await load('Label');
const InputGroup = await load('InputGroup');
const Input = await load('Input');

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});

async function render(c: Component, props: Record<string, unknown>, slots?: Record<string, string>) {
  const html = await container.renderToString(c, { props, ...(slots ? { slots } : {}) });
  return new JSDOM(`<body>${html}</body>`).window.document;
}

const css = readFileSync(new URL('../src/components/ui/field.css', import.meta.url), 'utf8');

describe('C-260 Label', () => {
  it('C-260 defaults to <label> with the field label class and its for', async () => {
    const doc = await render(Label, { for: 'x' }, { default: 'Name' });
    const el = doc.querySelector('.ocx-ui-field__label');
    expect(el?.tagName).toBe('LABEL');
    expect(el?.getAttribute('for')).toBe('x');
    expect(el?.textContent?.trim()).toBe('Name');
    expect(el?.hasAttribute('data-hidden')).toBe(false);
    expect(el?.querySelector('.ocx-ui-field__required')).toBeNull();
  });

  it('C-260 as="span" renders a <span> without for', async () => {
    const doc = await render(Label, { as: 'span', for: 'x', id: 'grp-label' }, { default: 'Group' });
    const el = doc.querySelector('.ocx-ui-field__label');
    expect(el?.tagName).toBe('SPAN');
    expect(el?.hasAttribute('for')).toBe(false);
    expect(el?.id).toBe('grp-label');
  });

  it('C-260 hidden and disabled render data attributes', async () => {
    const el = (await render(Label, { hidden: true, disabled: true }, { default: 'Q' })).querySelector('label');
    expect(el?.hasAttribute('data-hidden')).toBe(true);
    expect(el?.hasAttribute('data-disabled')).toBe(true);
    expect(el?.hasAttribute('hidden')).toBe(false);
  });

  it('C-260 required appends an aria-hidden * after the text', async () => {
    const el = (await render(Label, { required: true }, { default: 'Q' })).querySelector('label');
    const mark = el?.querySelector('span.ocx-ui-field__required');
    expect(mark?.getAttribute('aria-hidden')).toBe('true');
    expect(mark?.textContent).toBe('*');
    expect(el?.lastElementChild).toBe(mark);
  });

  it('C-260 rest attributes land on the element (a Zag getLabelProps spread)', async () => {
    const el = (
      await render(
        Label,
        { id: 'z-label', 'data-scope': 'combobox', 'data-part': 'label', class: 'extra' },
        { default: 'Z' },
      )
    ).querySelector('label');
    expect(el?.id).toBe('z-label');
    expect(el?.getAttribute('data-scope')).toBe('combobox');
    expect(el?.getAttribute('data-part')).toBe('label');
    expect(el?.classList.contains('ocx-ui-field__label')).toBe(true);
    expect(el?.classList.contains('extra')).toBe(true);
  });
});

describe('C-262 InputGroup', () => {
  it('C-262 renders start, default, end in that order inside .ocx-ui-input-group', async () => {
    const doc = await render(
      InputGroup,
      {},
      { end: '<b id="e"></b>', default: '<input id="c">', start: '<i id="s"></i>' },
    );
    const group = doc.querySelector('div.ocx-ui-input-group');
    expect([...(group?.children ?? [])].map((c) => c.id)).toEqual(['s', 'c', 'e']);
  });

  it('C-262 disabled, invalid and wrap map to data attributes; none by default', async () => {
    const plain = (await render(InputGroup, {})).querySelector('.ocx-ui-input-group');
    for (const a of ['data-disabled', 'data-invalid', 'data-wrap']) expect(plain?.hasAttribute(a)).toBe(false);
    const all = (
      await render(InputGroup, { disabled: true, invalid: true, wrap: true, class: 'x', role: 'group' })
    ).querySelector('.ocx-ui-input-group');
    for (const a of ['data-disabled', 'data-invalid', 'data-wrap']) expect(all?.hasAttribute(a), a).toBe(true);
    expect(all?.classList.contains('x')).toBe(true);
    expect(all?.getAttribute('role')).toBe('group');
  });
});

describe('C-263 Input with start / end slots', () => {
  it('C-263 slots put the input inside the group, wearing the group input class', async () => {
    const doc = await render(
      Input,
      { label: 'Site', id: 's', hint: 'h' },
      { start: '<span class="ocx-ui-input-group__addon">https://</span>', end: '<button type="button">Go</button>' },
    );
    const group = doc.querySelector('.ocx-ui-field > .ocx-ui-input-group');
    const input = group?.querySelector('input');
    expect(input?.classList.contains('ocx-ui-input-group__input')).toBe(true);
    expect(input?.classList.contains('ocx-ui-input')).toBe(false);
    expect([...(group?.children ?? [])].map((c) => c.tagName)).toEqual(['SPAN', 'INPUT', 'BUTTON']);
    expect(doc.querySelector('label')?.getAttribute('for')).toBe('s');
  });

  it('C-263 aria-describedby still points at the message; a caller value is merged', async () => {
    const doc = await render(Input, { label: 'A', id: 'a', hint: 'h', 'aria-describedby': 'ext' }, { end: '<i></i>' });
    const input = doc.querySelector('input');
    expect(input?.getAttribute('aria-describedby')).toBe('ext a-msg');
    expect(doc.getElementById('a-msg')?.textContent?.trim()).toBe('h');
  });

  it('C-263 error sets aria-invalid on the input, data-invalid on group and field', async () => {
    const doc = await render(Input, { label: 'A', id: 'a', error: 'Bad' }, { start: '<i></i>' });
    expect(doc.querySelector('input')?.getAttribute('aria-invalid')).toBe('true');
    expect(doc.querySelector('.ocx-ui-input-group')?.hasAttribute('data-invalid')).toBe(true);
    expect(doc.querySelector('.ocx-ui-field')?.hasAttribute('data-invalid')).toBe(true);
  });

  it('C-263 disabled reaches the input, the group and the label', async () => {
    const doc = await render(Input, { label: 'A', disabled: true }, { end: '<i></i>' });
    expect(doc.querySelector('input')?.hasAttribute('disabled')).toBe(true);
    expect(doc.querySelector('.ocx-ui-input-group')?.hasAttribute('data-disabled')).toBe(true);
    expect(doc.querySelector('label')?.hasAttribute('data-disabled')).toBe(true);
  });

  it('C-263 required flows to the Label marker and the input; password and number are accepted', async () => {
    const doc = await render(Input, { label: 'Size', type: 'number', required: true });
    expect(doc.querySelector('input')?.getAttribute('type')).toBe('number');
    expect(doc.querySelector('input')?.hasAttribute('required')).toBe(true);
    expect(doc.querySelector('label .ocx-ui-field__required')?.getAttribute('aria-hidden')).toBe('true');
    expect((await render(Input, { label: 'P', type: 'password' })).querySelector('input')?.type).toBe('password');
  });
});

describe('Input type=number stepper', () => {
  const buttons = (doc: Document) => [...doc.querySelectorAll<HTMLButtonElement>('.ocx-ui-stepper [data-step]')];

  it('renders Decrease / Increase ghost buttons at the end, out of the tab order', async () => {
    const doc = await render(Input, { label: 'Retries', type: 'number', value: '3' });
    const [down, up] = buttons(doc);
    expect(down?.getAttribute('aria-label')).toBe('Decrease');
    expect(up?.getAttribute('aria-label')).toBe('Increase');
    for (const b of [down, up]) {
      expect(b?.getAttribute('tabindex')).toBe('-1');
      expect(b?.getAttribute('data-variant')).toBe('ghost');
      expect(b?.disabled).toBe(false);
    }
    expect(doc.querySelector('.ocx-ui-input-group > .ocx-ui-stepper')).not.toBeNull();
    expect(doc.querySelector('.ocx-ui-input-group')?.lastElementChild?.className).toBe('ocx-ui-stepper');
  });

  it('follows a caller end slot; stepper={false}, step=any and other types render none', async () => {
    const doc = await render(Input, { label: 'MB', type: 'number' }, { end: '<span id="u">MB</span>' });
    expect([...(doc.querySelector('.ocx-ui-input-group')?.children ?? [])].map((c) => c.className || c.id)).toEqual([
      'ocx-ui-input-group__input',
      'u',
      'ocx-ui-stepper',
    ]);
    for (const props of [{ type: 'number', stepper: false }, { type: 'number', step: 'any' }, { type: 'text' }])
      expect(buttons(await render(Input, { label: 'X', ...props })), JSON.stringify(props)).toEqual([]);
  });

  it('disables both buttons when disabled or readonly, one at min or max', async () => {
    for (const flag of ['disabled', 'readonly'])
      expect(
        buttons(await render(Input, { label: 'X', type: 'number', [flag]: true })).map((b) => b.disabled),
        flag,
      ).toEqual([true, true]);
    const at = async (props: Record<string, unknown>) =>
      buttons(await render(Input, { label: 'X', type: 'number', ...props })).map((b) => b.disabled);
    expect(await at({ value: '0', min: '0', max: '10' })).toEqual([true, false]);
    expect(await at({ value: '10', min: '0', max: '10' })).toEqual([false, true]);
    expect(await at({ value: '5', min: '0', max: '10' })).toEqual([false, false]);
    expect(await at({ min: '0' })).toEqual([false, false]);
  });
});

describe('C-263 Input without slots', () => {
  it('C-263 renders the bare .ocx-ui-input, no group', async () => {
    const doc = await render(Input, { label: 'Package', id: 'p' });
    expect(doc.querySelector('.ocx-ui-input-group')).toBeNull();
    const field = doc.querySelector('.ocx-ui-field');
    expect([...(field?.children ?? [])].map((c) => c.tagName)).toEqual(['LABEL', 'INPUT']);
    const input = field?.querySelector('input');
    expect(input?.className).toBe('ocx-ui-input');
    expect(input?.hasAttribute('required')).toBe(false);
    expect(field?.querySelector('label')?.attributes.length).toBe(2); // class, for
  });
});

describe('C-261 field.css', () => {
  it('C-261 sits in @layer ocx, tokens only, and defines the group rules', () => {
    expect(css).toMatch(/^@layer ocx\s*\{/m);
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(/i);
    for (const sel of [
      '.ocx-ui-input-group',
      '.ocx-ui-input-group[data-wrap]',
      '.ocx-ui-input-group:focus-within',
      '.ocx-ui-input-group__input',
      '.ocx-ui-input-group__addon',
    ])
      expect(css, sel).toContain(sel);
    expect(css).toMatch(/:focus-within\s*\{[^}]*border-color:\s*var\(--ocx-color-focus\)/);
    expect(css).toMatch(/caret-color:\s*var\(--ocx-color-accent\)/);
  });

  it('hides the native spin buttons and gives forced-colors focus an outline', () => {
    expect(css).toMatch(/input\[type='number'\]\s*\{[^}]*appearance:\s*textfield/);
    expect(css).toMatch(/::-webkit-inner-spin-button[^{]*\{[^}]*appearance:\s*none/);
    expect(css).toMatch(
      /@media \(forced-colors: active\)\s*\{[^}]*\.ocx-ui-input-group:focus-within[^}]*outline:[^;}]*Highlight/,
    );
  });

  it('C-261 focus is declared after the danger border so focus wins', () => {
    expect(css.indexOf('.ocx-ui-input-group:focus-within')).toBeGreaterThan(
      css.indexOf(".ocx-ui-input-group:has([aria-invalid='true'])"),
    );
  });
});
