// <SearchField> (C-269) SSR structure via the Astro Container API (node env), parsed with JSDOM.
import { readFileSync } from 'node:fs';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
// @ts-expect-error jsdom ships no types and @types/jsdom is not a dependency
import * as jsdom from 'jsdom';
import { beforeAll, describe, expect, it } from 'vitest';

type Component = Parameters<AstroContainer['renderToString']>[0];
const { JSDOM } = jsdom as { JSDOM: new (html: string) => { window: { document: Document } } };
// Template import: tsc has no .astro module types (as in chrome.test.ts).
const SearchField = ((await import(`../src/components/ui/${'SearchField'}.astro`)) as { default: Component }).default;

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});
const render = async (props: Record<string, unknown> = {}) => {
  const html = await container.renderToString(SearchField, { props: { label: 'Filter tags', ...props } });
  return new JSDOM(`<body>${html}</body>`).window.document;
};

describe('SearchField SSR', () => {
  it('is a field root around Label + InputGroup (search icon, search input, clear button)', async () => {
    const doc = await render();
    const root = doc.querySelector('div.ocx-ui-field.ocx-ui-search-field')!;
    expect(root).not.toBeNull();
    const group = root.querySelector(':scope > .ocx-ui-input-group')!;
    expect(root.querySelector(':scope > label.ocx-ui-field__label')).not.toBeNull();
    expect(group.querySelector(':scope > svg[data-icon="search"]')).not.toBeNull();
    const input = group.querySelector<HTMLInputElement>(':scope > input.ocx-ui-input-group__input')!;
    expect(input.type).toBe('search');
    expect(group.lastElementChild?.tagName).toBe('BUTTON');
  });

  it('the label is visually hidden by default and names the input', async () => {
    const doc = await render();
    const label = doc.querySelector('label')!;
    const input = doc.querySelector('input')!;
    expect(label.hasAttribute('data-hidden')).toBe(true);
    expect(label.getAttribute('for')).toBe(input.id);
    expect(input.id).toMatch(/^ocx-ui-search-\d+$/);
    expect(label.textContent?.trim()).toBe('Filter tags');
  });

  it('hideLabel={false} shows the label', async () => {
    const doc = await render({ hideLabel: false });
    expect(doc.querySelector('label')!.hasAttribute('data-hidden')).toBe(false);
  });

  it('placeholder defaults to the label, an empty one falls back to it, a given one wins', async () => {
    expect((await render()).querySelector('input')!.placeholder).toBe('Filter tags');
    expect((await render({ placeholder: '  ' })).querySelector('input')!.placeholder).toBe('Filter tags');
    expect((await render({ placeholder: 'Find…' })).querySelector('input')!.placeholder).toBe('Find…');
  });

  it('value and name land on the input; the id prop names the input, not the root', async () => {
    const doc = await render({ value: 'zag', name: 'q', id: 'my-search' });
    const input = doc.querySelector('input')!;
    expect(input.value).toBe('zag');
    expect(input.name).toBe('q');
    expect(input.id).toBe('my-search');
    expect(doc.querySelector('label')!.getAttribute('for')).toBe('my-search');
    expect(doc.querySelector('.ocx-ui-search-field')!.id).toBe('');
  });

  it('rest attributes land on the input and class on the root', async () => {
    const doc = await render({
      class: 'mine',
      'aria-controls': 'results',
      autocomplete: 'off',
      spellcheck: 'false',
      'data-ocx-filter': '',
    });
    const input = doc.querySelector('input')!;
    expect(input.getAttribute('aria-controls')).toBe('results');
    expect(input.getAttribute('autocomplete')).toBe('off');
    expect(input.getAttribute('spellcheck')).toBe('false');
    expect(input.hasAttribute('data-ocx-filter')).toBe(true);
    expect(doc.querySelector('.ocx-ui-search-field')!.classList.contains('mine')).toBe(true);
    expect(input.classList.contains('mine')).toBe(false);
  });

  it('the clear button is a ghost s icon-only Button named "Clear <label>" with a close icon', async () => {
    const button = (await render()).querySelector('button')!;
    expect(button.type).toBe('button');
    expect(button.getAttribute('aria-label')).toBe('Clear Filter tags');
    expect(button.classList.contains('ocx-ui-search-field__clear')).toBe(true);
    expect(button.classList.contains('ocx-ui-button')).toBe(true);
    expect(button.getAttribute('data-variant')).toBe('ghost');
    expect(button.getAttribute('data-size')).toBe('s');
    expect(button.hasAttribute('data-icon-only')).toBe(true);
    expect(button.querySelector('svg[data-icon="close"]')).not.toBeNull();
    expect(button.disabled).toBe(false);
  });

  it('disabled disables the input and the clear button and greys the group', async () => {
    const doc = await render({ disabled: true });
    expect(doc.querySelector('input')!.disabled).toBe(true);
    expect(doc.querySelector('button')!.disabled).toBe(true);
    expect(doc.querySelector('.ocx-ui-input-group')!.hasAttribute('data-disabled')).toBe(true);
  });
});

describe('SearchField source', () => {
  const src = readFileSync(new URL('../src/components/ui/SearchField.astro', import.meta.url), 'utf8');
  it('hides clear on :placeholder-shown and without scripting, and the native cancel glyph', () => {
    expect(src).toContain(':placeholder-shown');
    expect(src).toContain(':disabled');
    expect(src).toContain('@media (scripting: none)');
    expect(src).toContain('::-webkit-search-cancel-button');
    expect(src).toContain('::-webkit-search-decoration');
  });
  it('is tokens-only (no raw colour or px literal) and inside @layer ocx', () => {
    const style = src.slice(src.indexOf('<style'), src.indexOf('</style>'));
    expect(style).toContain('@layer ocx');
    expect(style).not.toMatch(/#[0-9a-f]{3,8}\b|\d+px/i);
  });
});
