// C-273 TagsInput SSR (Container, node): states, SSR = ssrApi for both machines (C-130a), the chip
// template (D-P9) and the hidden form input. Behaviour is ui-tags-input.dom.test.ts and the e2e.
import { readFileSync } from 'node:fs';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
// @ts-expect-error jsdom ships no types and @types/jsdom is not a dependency
import * as jsdom from 'jsdom';
import { beforeAll, describe, expect, it } from 'vitest';
import * as tagsInput from '../src/components/ui/tags-input.zag.mjs';
import { ssrApi, ssrAttrs } from '../src/components/ui/zag-runtime.mjs';
import { domAttrs } from './zag-helpers.ts';

type Win = Window & typeof globalThis;
type Component = Parameters<AstroContainer['renderToString']>[0];
const { JSDOM } = jsdom as { JSDOM: new (html: string) => { window: Win } };
// Template import: tsc has no .astro module types (as in ui-tag.test.ts).
const load = async (name: string) =>
  ((await import(`../src/components/ui/${name}.astro`)) as { default: Component }).default;
const TagsInput = await load('TagsInput');

const SUGGESTIONS = [
  { value: 'k8s', label: 'kubernetes', meta: '312' },
  { value: 'docker', label: 'docker' },
  { value: 'cli', label: 'cli' },
];

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});

async function render(props: Record<string, unknown>) {
  const html = await container.renderToString(TagsInput, { props: { label: 'Tags', ...props } });
  const doc = new JSDOM(`<body>${html}</body>`).window.document;
  const root = doc.querySelector<HTMLElement>('[data-zag-root="tags-input"]')!;
  return { html, doc, root, input: root.querySelector<HTMLInputElement>('input:not([hidden])')! };
}

/** Every Zag attribute of `attrs` is on `el` with the same value (a wrapper may add its own). */
function expectHas(el: Element | null, attrs: Record<string, unknown>, part: string) {
  expect(el, part).not.toBeNull();
  for (const [name, value] of Object.entries(domAttrs(attrs)))
    expect(el?.getAttribute(name), `${part} [${name}]`).toBe(value);
}

const chips = (root: Element) =>
  [...root.querySelectorAll('.ocx-ui-input-group > [data-part="item"]')].map((el) => ({
    value: el.getAttribute('data-value'),
    text: el.querySelector('[data-part="item-text"]')?.textContent,
    remove: el.querySelector('.ocx-ui-tag__remove')?.getAttribute('aria-label'),
  }));

describe('C-273 TagsInput SSR states', () => {
  it('empty: idle root, labelled input with the placeholder, closed popup, no chips', async () => {
    const { root, input, doc } = await render({ suggestions: SUGGESTIONS, placeholder: 'Add a tag' });
    expect(root.getAttribute('data-zag-state')).toBe('idle');
    expect(root.classList.contains('ocx-ui-field')).toBe(true);
    expect(chips(root)).toEqual([]);
    expect(input.getAttribute('placeholder')).toBe('Add a tag');
    expect(input.getAttribute('role')).toBe('combobox');
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(doc.querySelector(`label[for="${input.id}"]`)?.textContent?.trim()).toBe('Tags');
    const list = doc.getElementById(input.getAttribute('aria-controls') ?? '');
    expect(list?.getAttribute('role')).toBe('listbox');
    expect(list?.hasAttribute('hidden')).toBe(true);
    expect(doc.getElementById(list?.getAttribute('aria-labelledby') ?? '')?.textContent?.trim()).toBe('Tags');
    expect(html(root)).not.toMatch(/data-focus/);
  });

  it('prefilled: one chip per value, the suggestion label for a known value, the raw value otherwise', async () => {
    const { root, input } = await render({ suggestions: SUGGESTIONS, value: ['k8s', 'legacy'], placeholder: 'x' });
    expect(chips(root)).toEqual([
      { value: 'k8s', text: 'kubernetes', remove: 'Remove kubernetes' },
      { value: 'legacy', text: 'legacy', remove: 'Remove legacy' },
    ]);
    // Zag shows the placeholder only while there are no tags.
    expect(input.hasAttribute('placeholder')).toBe(false);
    // Added values leave the popup.
    const hidden = [...root.querySelectorAll('[role="option"]')].map((o) => [
      o.getAttribute('data-value'),
      o.hasAttribute('hidden'),
    ]);
    expect(hidden).toEqual([
      ['k8s', true],
      ['docker', false],
      ['cli', false],
      [tagsInput.CREATE, true],
    ]);
  });

  it('allowCreate defaults off with suggestions and on without; free mode has no popup', async () => {
    expect((await render({ suggestions: SUGGESTIONS })).root.hasAttribute('data-ocx-allow-create')).toBe(false);
    expect(
      (await render({ suggestions: SUGGESTIONS, allowCreate: true })).root.hasAttribute('data-ocx-allow-create'),
    ).toBe(true);
    const free = await render({});
    expect(free.root.hasAttribute('data-ocx-allow-create')).toBe(true);
    expect(free.root.querySelector('[data-part="content"]')).toBeNull();
    expect(free.input.hasAttribute('role')).toBe(false);
  });

  it('the create row is rendered hidden with the plus icon; the empty text is hidden while rows remain', async () => {
    const { root } = await render({ suggestions: SUGGESTIONS, allowCreate: true });
    const create = root.querySelector(`[data-value="${tagsInput.CREATE}"]`);
    expect(create?.hasAttribute('hidden')).toBe(true);
    expect(create?.querySelector('[data-icon="plus"]')).not.toBeNull();
    expect(root.querySelector('.ocx-ui-tags-input__empty')?.hasAttribute('hidden')).toBe(true);
    const all = await render({ suggestions: SUGGESTIONS, value: ['k8s', 'docker', 'cli'], empty: 'nothing left' });
    expect(all.root.querySelector('.ocx-ui-tags-input__empty')?.hasAttribute('hidden')).toBe(false);
    expect(all.root.querySelector('.ocx-ui-tags-input__empty')?.textContent?.trim()).toBe('nothing left');
  });

  it('max reached: data-max on the root and a readonly input; below max neither', async () => {
    const full = await render({ suggestions: SUGGESTIONS, value: ['k8s', 'cli'], max: 2 });
    expect(full.root.hasAttribute('data-max')).toBe(true);
    expect(full.input.hasAttribute('readonly')).toBe(true);
    const room = await render({ suggestions: SUGGESTIONS, value: ['k8s'], max: 2 });
    expect(room.root.hasAttribute('data-max')).toBe(false);
    expect(room.input.hasAttribute('readonly')).toBe(false);
  });

  it('disabled: input and remove buttons disabled, the box greyed through data-disabled', async () => {
    const { root, input } = await render({ suggestions: SUGGESTIONS, value: ['cli'], disabled: true });
    expect(input.disabled).toBe(true);
    expect(root.querySelector<HTMLButtonElement>('.ocx-ui-tag__remove')?.disabled).toBe(true);
    expect(root.querySelector('.ocx-ui-input-group')?.hasAttribute('data-disabled')).toBe(true);
    expect(root.querySelector('.ocx-ui-field__label')?.hasAttribute('data-disabled')).toBe(true);
  });

  it('error: aria-invalid on the input, data-invalid on the root, the message describes the input', async () => {
    const { root, input, doc } = await render({ error: 'Pick at least one tag', hint: 'ignored' });
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(root.hasAttribute('data-invalid')).toBe(true);
    expect(doc.getElementById(input.getAttribute('aria-describedby') ?? '')?.textContent?.trim()).toBe(
      'Pick at least one tag',
    );
    const hinted = await render({ hint: 'Comma separated' });
    expect(hinted.input.hasAttribute('aria-invalid')).toBe(false);
    expect(hinted.doc.getElementById(hinted.input.getAttribute('aria-describedby') ?? '')?.textContent?.trim()).toBe(
      'Comma separated',
    );
  });

  it('hideLabel keeps the label as the name, visually hidden', async () => {
    const { root } = await render({ hideLabel: true });
    expect(root.querySelector('.ocx-ui-field__label')?.hasAttribute('data-hidden')).toBe(true);
  });
});

describe('C-130a TagsInput SSR equals ssrApi for both machines', () => {
  it('root, label, control, chips, input, hidden input, positioner, content and rows', async () => {
    const value = ['k8s', 'legacy'];
    const { root, input } = await render({ suggestions: SUGGESTIONS, value, name: 'tags', placeholder: 'Add' });
    const own = JSON.parse(root.getAttribute('data-zag-props') ?? '{}') as Record<string, unknown>;
    const id = root.getAttribute('data-zag-id')!;
    expect(own).toEqual({ delimiter: ',', placeholder: 'Add', name: 'tags', blurBehavior: 'clear', editable: false });
    const tags = ssrApi(tagsInput.machine, tagsInput.connect, {
      ...own,
      id,
      defaultValue: value,
      translations: { deleteTagTriggerLabel: (v: string) => `Remove ${tagsInput.labelOf(SUGGESTIONS, v)}` },
    });
    const rules = { suggestions: SUGGESTIONS, allowCreate: false, matchMode: 'fuzzy' as const };
    const combo = ssrApi(tagsInput.combobox.machine, tagsInput.combobox.connect, {
      id,
      ids: { input: input.id, control: `tags-input:${id}:control`, label: `tags-input:${id}:label` },
      value: [],
      inputBehavior: 'autohighlight',
      selectionBehavior: 'clear',
      closeOnSelect: false,
      allowCustomValue: true,
      disabled: false,
      invalid: false,
      readOnly: false,
      positioning: { strategy: 'fixed' },
      collection: tagsInput.toCollection('', value, rules),
    });
    expectHas(root, tags.getRootProps(), 'root');
    expectHas(root.querySelector('[data-part="label"]'), tags.getLabelProps(), 'label');
    expectHas(root.querySelector('.ocx-ui-input-group'), tags.getControlProps(), 'control');
    const chipEls = root.querySelectorAll('.ocx-ui-input-group > [data-part="item"]');
    value.forEach((v, index) => {
      const chip = chipEls[index]!;
      expectHas(chip, tags.getItemProps({ index, value: v }), `item ${v}`);
      expectHas(
        chip.querySelector('[data-part="item-preview"]'),
        tags.getItemPreviewProps({ index, value: v }),
        'preview',
      );
      expectHas(chip.querySelector('[data-part="item-text"]'), tags.getItemTextProps({ index, value: v }), 'text');
      expectHas(
        chip.querySelector('.ocx-ui-tag__remove'),
        tags.getItemDeleteTriggerProps({ index, value: v }),
        'delete',
      );
    });
    const inputProps = tagsInput.inputAttrs(tags.getInputProps(), combo.getInputProps(), false);
    const actual = Object.fromEntries(
      [...input.attributes].filter((a) => a.name !== 'class').map((a) => [a.name, a.value]),
    );
    expect(actual).toEqual(domAttrs(inputProps));
    expectHas(root.querySelector('input[hidden]'), tags.getHiddenInputProps(), 'hidden input');
    expectHas(root.querySelector('[data-part="positioner"]'), combo.getPositionerProps(), 'positioner');
    expectHas(root.querySelector('[data-part="content"]'), combo.getContentProps(), 'content');
    for (const s of SUGGESTIONS)
      expectHas(
        root.querySelector(`[role="option"][data-value="${s.value}"]`),
        combo.getItemProps({ item: s }),
        s.value,
      );
    expect(html(root)).not.toMatch(/data-focus/);
  });

  it('the hidden input carries the name and the values before any script', async () => {
    const { root } = await render({ suggestions: SUGGESTIONS, value: ['k8s', 'cli'], name: 'tags' });
    const hidden = root.querySelector<HTMLInputElement>('input[hidden]')!;
    expect(hidden.name).toBe('tags');
    expect(hidden.value).toBe('k8s, cli');
    expect(ssrAttrs({ hidden: true }).hidden).toBe('');
  });
});

describe('D-P9 chip template', () => {
  it('one inert <template data-ocx-chip> holding a removable label Tag with the preview and text parts', async () => {
    const { root } = await render({ suggestions: SUGGESTIONS, value: ['k8s'] });
    const templates = root.querySelectorAll('template[data-ocx-chip]');
    expect(templates).toHaveLength(1);
    const chip = (templates[0] as HTMLTemplateElement).content.firstElementChild!;
    expect(chip.classList.contains('ocx-ui-tag')).toBe(true);
    expect(chip.getAttribute('data-variant')).toBe('label');
    expect(chip.hasAttribute('data-removable')).toBe(true);
    expect(chip.querySelector('[data-part="item-preview"] [data-part="item-text"]')).not.toBeNull();
    expect(chip.querySelector('.ocx-ui-tag__remove [data-icon="close"]')).not.toBeNull();
    // Inert: nothing in it is a part of the live DOM.
    expect(root.querySelectorAll('[data-part="item"]')).toHaveLength(1 + SUGGESTIONS.length + 1);
  });
});

const html = (el: Element) => el.outerHTML;

describe('TagsInput highlighted chip', () => {
  it('draws an outline, which survives forced colours', () => {
    const src = readFileSync(new URL('../src/components/ui/TagsInput.astro', import.meta.url), 'utf8');
    expect(/\[data-highlighted\]\) \{[^}]*outline: var\(--ocx-focus-ring\)/.test(src)).toBe(true);
  });
});

describe('TagsInput first-paint requests (Lighthouse, six HTTP/1.1 connections)', () => {
  const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
  const ui = (name: string) => read(`../src/components/ui/${name}`);

  // a9aa371: a <link> the client script adds when the machine loads, not text in the chunk (CSS in JS
  // counted toward the script budget, C-112).
  it('the popup sheet is not a stylesheet of the page: the client script links it when the machine loads', () => {
    expect(ui('TagsInput.astro')).not.toMatch(/import\s+['"]\.\/overlay\.css['"]/);
    expect(ui('TagsInput.astro')).toMatch(/import\s+overlay\s+from\s+['"]\.\/overlay\.css\?url['"]/);
    expect(ui('tags-input.zag.mjs')).not.toMatch(/overlay\.css/);
  });

  it('the suggestions live once in the HTML: the popup rows, not a data attribute', async () => {
    const { root } = await render({ suggestions: SUGGESTIONS });
    expect(root.hasAttribute('data-ocx-suggestions')).toBe(false);
    expect(tagsInput.readSuggestions(root)).toEqual([
      { value: 'k8s', label: 'kubernetes' },
      { value: 'docker', label: 'docker' },
      { value: 'cli', label: 'cli' },
    ]);
    expect(root.querySelector('.ocx-ui-option__meta')?.textContent).toBe('312'); // meta lives in the row
  });

  // The two scripts were early requests on the docs page (Lighthouse queued LCP a round trip later).
  // They now load only on the story pages, which have no Starlight chrome and no table of contents.
  it('the docs page renders no TagsInput; its stories hold the demo and the states', () => {
    const site = '../../../examples/starlight/src';
    expect(read(`${site}/content/docs/components/tags-input.mdx`)).not.toMatch(/^import TagsInput\b/m);
    for (const story of ['default', 'states'])
      expect(read(`${site}/stories/tags-input/${story}.mdx`)).toMatch(
        /^import TagsInput from '@ocx-sh\/theme\/components\/ui\/TagsInput\.astro';$/m,
      );
  });
});
