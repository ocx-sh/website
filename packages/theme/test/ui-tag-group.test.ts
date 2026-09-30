// <TagGroup> (C-272, D-P7) SSR (Container, node): 'none' is a labelled list of label chips (optionally
// removable), 'single' / 'multiple' a Zag toggle-group of filter chips whose SSR equals connect()
// (C-130a/b); radio vs aria-pressed semantics; the type rejects removable with a selection mode.
import { readFileSync } from 'node:fs';
import * as toggleZag from '@zag-js/toggle-group';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
// @ts-expect-error jsdom ships no types and @types/jsdom is not a dependency
import * as jsdom from 'jsdom';
import { beforeAll, describe, expect, it } from 'vitest';
import { ssrApi } from '../src/components/ui/zag-runtime.mjs';
import { probeErrorLines } from './astro-props.ts';
import { expectSsrMatchesConnect } from './zag-helpers.ts';

type Component = Parameters<AstroContainer['renderToString']>[0];
const { JSDOM } = jsdom as { JSDOM: new (html: string) => { window: Window } };
// Template import: tsc has no .astro module types (as in chrome.test.ts).
const TagGroup = ((await import(`../src/components/ui/${'TagGroup'}.astro`)) as { default: Component }).default;

const ITEMS = [
  { value: 'linux', label: 'linux' },
  { value: 'macos', label: 'macos' },
  { value: 'windows', label: 'windows' },
  { value: 'freebsd', label: 'freebsd', disabled: true },
];

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});
const render = async (props: Record<string, unknown>) => {
  const html = await container.renderToString(TagGroup, { props: { label: 'Platform', items: ITEMS, ...props } });
  return { html, doc: new JSDOM(`<body>${html}</body>`).window.document };
};

/** The wrapper's own attributes, not part of the Zag contract: root hooks, the label link, the Tag look. */
const OWN = /^(data-zag-(root|state|props|id)|aria-labelledby|data-variant|data-tone)$/;
const zagOnly = (el: Element) => {
  const copy = el.cloneNode(false) as Element;
  for (const name of copy.getAttributeNames()) if (OWN.test(name)) copy.removeAttribute(name);
  return copy.outerHTML;
};

describe('C-272 selectable TagGroup SSR equals connect() (C-130a/b)', () => {
  it.each([
    ['single', { selectionMode: 'single', value: 'macos' }, { defaultValue: ['macos'], deselectable: false }],
    [
      'multiple',
      { selectionMode: 'multiple', value: ['linux', 'windows'] },
      { defaultValue: ['linux', 'windows'], multiple: true },
    ],
    [
      'single, zag override',
      { selectionMode: 'single', zag: { deselectable: true } },
      { defaultValue: [], deselectable: true },
    ],
  ])('%s: root and every chip equal ssrApi, no data-focus', async (_, props, machineProps) => {
    const { doc } = await render(props);
    const root = doc.querySelector<HTMLElement>('[data-zag-root]')!;
    expect(JSON.parse(root.dataset['zagProps'] ?? '')).toEqual(machineProps);
    const api = ssrApi(toggleZag.machine, toggleZag.connect, { id: root.dataset['zagId'], ...machineProps });
    expectSsrMatchesConnect(zagOnly(root), 'root', api.getRootProps());
    const chips = [...doc.querySelectorAll('[data-part="item"]')];
    expect(chips.map((c) => c.textContent?.trim())).toEqual(ITEMS.map((i) => i.label));
    ITEMS.forEach((item, i) => expectSsrMatchesConnect(zagOnly(chips[i]!), 'item', api.getItemProps(item)));
    expect(doc.querySelector('[data-focus], [data-focus-visible]')).toBeNull();
  });

  it('C-130b root: data-zag-root="tag-group", idle, class, and named by the visible label span', async () => {
    const { doc } = await render({ selectionMode: 'multiple' });
    const root = doc.querySelector('[data-zag-root]')!;
    expect(root.getAttribute('data-zag-root')).toBe('tag-group');
    expect(root.getAttribute('data-zag-state')).toBe('idle');
    expect(root.getAttribute('data-zag-id')).toMatch(/^ocx-ui-tag-group-\d+$/);
    expect(root.classList.contains('ocx-ui-tag-group')).toBe(true);
    const label = doc.getElementById(root.getAttribute('aria-labelledby')!)!;
    expect(label.tagName).toBe('SPAN');
    expect(label.textContent?.trim()).toBe('Platform');
    expect(label.hasAttribute('data-hidden')).toBe(false);
  });

  it('chips are filter Tags rendered as buttons with one type attribute', async () => {
    const { html, doc } = await render({ selectionMode: 'multiple' });
    const chips = [...doc.querySelectorAll('[data-part="item"]')];
    expect(chips.every((c) => c.tagName === 'BUTTON' && c.getAttribute('data-variant') === 'filter')).toBe(true);
    expect(chips.every((c) => c.querySelector('.ocx-ui-tag__check'))).toBe(true);
    expect(html).not.toMatch(/type="button"[^>]*type="button"/);
  });

  it('single = radiogroup of aria-checked radios; multiple = group of aria-pressed buttons', async () => {
    const single = (await render({ selectionMode: 'single', value: 'macos' })).doc;
    expect(single.querySelector('[data-zag-root]')?.getAttribute('role')).toBe('radiogroup');
    expect([...single.querySelectorAll('[role="radio"]')].map((i) => i.getAttribute('aria-checked'))).toEqual([
      'false',
      'true',
      'false',
      'false',
    ]);
    expect(single.querySelector('[aria-pressed]')).toBeNull();
    const multiple = (await render({ selectionMode: 'multiple', value: ['linux', 'windows'] })).doc;
    expect(multiple.querySelector('[data-zag-root]')?.getAttribute('role')).toBe('group');
    expect([...multiple.querySelectorAll('[data-part="item"]')].map((i) => i.getAttribute('aria-pressed'))).toEqual([
      'true',
      'false',
      'true',
      'false',
    ]);
    expect(multiple.querySelector('[role="radio"]')).toBeNull();
  });

  it('a disabled chip is a disabled button', async () => {
    const { doc } = await render({ selectionMode: 'single' });
    expect(doc.querySelector<HTMLButtonElement>('[data-part="item"]:last-child')?.disabled).toBe(true);
  });
});

describe('C-272 TagGroup selectionMode none', () => {
  it('is a list named by the label span, one <li> per label chip, no Zag', async () => {
    const { doc } = await render({ items: [{ value: 'ci', label: 'ci', tone: 'keyword' }, ...ITEMS] });
    const list = doc.querySelector('ul.ocx-ui-tag-group')!;
    expect(list.getAttribute('role')).toBe('list');
    expect(list.getAttribute('tabindex')).toBe('-1');
    expect(list.hasAttribute('data-ocx-tag-group')).toBe(true);
    expect(doc.getElementById(list.getAttribute('aria-labelledby')!)?.textContent?.trim()).toBe('Platform');
    const tags = [...list.querySelectorAll(':scope > li > .ocx-ui-tag')];
    expect(tags.map((t) => [t.getAttribute('data-variant'), t.getAttribute('data-value')])).toEqual([
      ['label', 'ci'],
      ...ITEMS.map((i) => ['label', i.value]),
    ]);
    expect(tags[0]?.getAttribute('data-tone')).toBe('keyword');
    expect(doc.querySelector('[data-zag-root], [data-scope], button')).toBeNull();
  });

  it('removable: one named remove button per chip, the default label and a {label} template', async () => {
    const plain = (await render({ removable: true })).doc;
    const buttons = [...plain.querySelectorAll('.ocx-ui-tag__remove')];
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(ITEMS.map((i) => `Remove ${i.label}`));
    expect(buttons.map((b) => b.hasAttribute('disabled'))).toEqual([false, false, false, true]);
    const custom = (await render({ removable: true, removeLabel: 'Drop {label} tag' })).doc;
    expect(custom.querySelector('.ocx-ui-tag__remove')?.getAttribute('aria-label')).toBe('Drop linux tag');
  });

  it('hideLabel keeps the label as the name, visually hidden', async () => {
    const { doc } = await render({ hideLabel: true });
    const list = doc.querySelector('ul')!;
    expect(doc.getElementById(list.getAttribute('aria-labelledby')!)?.hasAttribute('data-hidden')).toBe(true);
  });

  it('class goes to the wrapper', async () => {
    const { doc } = await render({ class: 'mine' });
    expect(doc.querySelector('.ocx-ui-tag-group-field')?.classList.contains('mine')).toBe(true);
  });
});

describe('TagGroup types', () => {
  const typeCheck = (probes: string) =>
    probeErrorLines(new URL('../src/components/ui/TagGroup.astro', import.meta.url), probes);

  it('removable only without a selection mode; data props compile', () => {
    const lines = typeCheck(
      [
        "const a: Props = { label: 'T', items: [{ value: 'a', label: 'a', tone: 'keyword' }], removable: true, removeLabel: 'Drop {label}' };",
        "const b: Props = { label: 'T', items: [], selectionMode: 'multiple', value: ['a'], zag: { deselectable: true } };",
        "const c: Props = { label: 'T', items: [], selectionMode: 'single', removable: true };",
        "const d: Props = { label: 'T', items: [], selectionMode: 'multiple', removeLabel: 'x' };",
        'void [a, b, c, d];',
      ].join('\n'),
    );
    expect(lines).toEqual([2, 3]); // c and d, 0-based probe lines
  });
});

describe('TagGroup styles', () => {
  const css = /<style is:global>([\s\S]*)<\/style>/.exec(
    readFileSync(new URL('../src/components/ui/TagGroup.astro', import.meta.url), 'utf8'),
  )?.[1];
  it('C-130f @layer ocx, chips wrap with a space-2 gap, tokens only', () => {
    expect(css?.trim()).toMatch(/^@layer ocx \{[\s\S]*\}$/);
    expect(css).toMatch(/\.ocx-ui-tag-group \{[^}]*display: flex;[^}]*flex-wrap: wrap;[^}]*gap: var\(--ocx-space-2\)/);
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|\brgba?\(|\b\d+px\b/i);
  });
});
