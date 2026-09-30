// <CommandBar>: SSR shape (picker, field, action slot, detect script), the copy root equal to the
// clipboard connect() (one copy mechanism, C-130a), and the stylesheet's rules. Behaviour under a DOM
// is in ui-command-bar.dom.test.ts.
import { readFileSync } from 'node:fs';
import * as clipboard from '@zag-js/clipboard';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
// @ts-expect-error jsdom ships no types and @types/jsdom is not a dependency
import * as jsdom from 'jsdom';
import { beforeAll, describe, expect, it } from 'vitest';
import { PRE_PAINT } from '../src/components/ui/command-bar.mjs';
import { ssrApi } from '../src/components/ui/zag-runtime.mjs';
import { probeErrorLines } from './astro-props.ts';
import { domAttrs } from './zag-helpers.ts';

type Component = Parameters<AstroContainer['renderToString']>[0];
const { JSDOM } = jsdom as { JSDOM: new (html: string) => { window: Window } };
// Template import: tsc has no .astro module types (as in chrome.test.ts).
const CommandBar = ((await import(`../src/components/ui/${'CommandBar'}.astro`)) as { default: Component }).default;
const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const install = [
  { value: 'linux', label: 'Linux', icon: 'linux', command: 'curl -fsSL https://setup.ocx.sh/sh | sh' },
  { value: 'macos', label: 'macOS', icon: 'apple', command: 'curl -fsSL https://setup.ocx.sh/sh | sh' },
  { value: 'windows', label: 'Windows', icon: 'windows', command: 'irm https://setup.ocx.sh/pwsh | iex' },
];
const scope = [
  { value: 'global', label: 'Global', command: 'ocx install ocx.sh/nodejs/node:24' },
  { value: 'project', label: 'Project', command: 'ocx add ocx.sh/nodejs/node:24' },
];

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});
const render = async (props: Record<string, unknown>, slots: Record<string, string> = {}) => {
  const html = await container.renderToString(CommandBar, { props, slots });
  return { html, doc: new JSDOM(html).window.document };
};

describe('CommandBar SSR: picker', () => {
  it('two or more choices: a compact Select (label hidden but present) in front of the field, first choice selected', async () => {
    const { doc } = await render({ choices: install, pickerLabel: 'Platform', noun: 'install command' });
    const bar = doc.querySelector('.ocx-cmdbar')!;
    const picker = bar.querySelector('.ocx-cmdbar__picker')!;
    expect(picker.querySelector('[data-zag-root="select"]')).not.toBeNull();
    const label = picker.querySelector('label')!;
    expect(label.textContent).toBe('Platform: Linux');
    expect(label.hasAttribute('data-hidden')).toBe(true);
    expect(picker.querySelector('[data-part="value-text"]')?.textContent).toBe('Linux');
    expect([...picker.querySelectorAll('option')].map((o) => o.value)).toEqual(['linux', 'macos', 'windows']);
    expect(picker.querySelector<HTMLOptionElement>('option[selected]')?.value).toBe('linux');
    expect(picker.nextElementSibling?.classList.contains('ocx-cmdbar__copy')).toBe(true);
  });

  it("the popup is not forced to the trigger's width, so a label never truncates in it", async () => {
    const { doc } = await render({ choices: scope });
    const props = JSON.parse(
      doc.querySelector<HTMLElement>('[data-zag-root="select"]')!.dataset['zagProps']!,
    ) as unknown;
    expect(props).toEqual({ positioning: { placement: 'bottom-start', sameWidth: false } });
  });

  it('every choice has an icon: the trigger is icon-only (icon of the first choice, name and tooltip carry it), rows carry icons', async () => {
    const { doc } = await render({ choices: install, pickerLabel: 'Platform' });
    const bar = doc.querySelector('.ocx-cmdbar')!;
    expect(bar.hasAttribute('data-picker-icon')).toBe(true);
    expect(bar.hasAttribute('data-icons')).toBe(true);
    const picker = bar.querySelector('.ocx-cmdbar__picker')!;
    expect(picker.getAttribute('title')).toBe('Platform: Linux');
    expect(picker.querySelector('label')?.textContent).toBe('Platform: Linux');
    const glyph = picker.querySelector('.ocx-ui-select__glyph svg')!;
    expect(glyph.getAttribute('data-icon')).toBe('linux');
    expect(glyph.getAttribute('aria-hidden')).toBe('true');
    expect(
      [...picker.querySelectorAll('option')].map((o) => o.getAttribute('data-icon')?.match(/data-icon="([^"]+)"/)?.[1]),
    ).toEqual(['linux', 'apple', 'windows']);
  });

  it('pickerText, or a choice without an icon: the label stays, no icon-only mode', async () => {
    const text = (await render({ choices: install, pickerText: true })).doc;
    expect(text.querySelector('.ocx-cmdbar')?.hasAttribute('data-picker-icon')).toBe(false);
    expect(text.querySelector('.ocx-ui-select__glyph svg')).not.toBeNull();
    expect(text.querySelector('.ocx-cmdbar__picker')?.hasAttribute('title')).toBe(false);
    const plain = (await render({ choices: scope, pickerLabel: 'Scope' })).doc;
    expect(plain.querySelector('.ocx-ui-select__glyph')).toBeNull();
    expect(plain.querySelector('.ocx-cmdbar')?.hasAttribute('data-icons')).toBe(false);
    expect(plain.querySelector('.ocx-cmdbar')?.hasAttribute('data-picker-icon')).toBe(false);
    expect(plain.querySelector('.ocx-cmdbar__picker label')?.textContent).toBe('Scope');
    const mixed = (await render({ choices: [install[0], scope[1]] })).doc;
    expect(mixed.querySelector('.ocx-cmdbar')?.hasAttribute('data-picker-icon')).toBe(false);
  });

  it('the picker box is as wide as the longest label (a pick never resizes it)', async () => {
    const { doc } = await render({ choices: install });
    expect(doc.querySelector<HTMLElement>('.ocx-cmdbar')?.getAttribute('style')).toBe('--ocx-cmdbar-ch:7');
  });

  it('one choice: a bare field, no picker; none: the action alone', async () => {
    const one = (await render({ choices: [scope[0]] })).doc;
    expect(one.querySelector('.ocx-cmdbar__picker')).toBeNull();
    expect(one.querySelector('.ocx-cmdbar__text')?.textContent?.trim()).toBe('ocx install ocx.sh/nodejs/node:24');
    const none = (await render({ choices: [] }, { action: '<a href="#x">Open</a>' })).doc;
    expect(none.querySelector('.ocx-cmdbar__picker')).toBeNull();
    expect(none.querySelector('.ocx-cmdbar__copy')).toBeNull();
    expect(none.querySelector('[data-zag-root]')).toBeNull();
    expect(none.querySelector('.ocx-cmdbar__action a')?.textContent).toBe('Open');
  });
});

describe('CommandBar SSR: field', () => {
  it('the field is one button naming the choice and noun; the command text is what is copied', async () => {
    const { doc } = await render({ choices: install, noun: 'install command' });
    const trigger = doc.querySelector<HTMLButtonElement>('.ocx-cmdbar__copy button')!;
    expect(trigger.getAttribute('aria-label')).toBe('Copy Linux install command');
    expect(trigger.type).toBe('button');
    expect(trigger.querySelector('code.ocx-cmdbar__text')?.textContent?.trim()).toBe(install[0]!.command);
    // The icons are decorative: the button's name is the label, not the two glyphs.
    const icons = trigger.querySelector('.ocx-cmdbar__icons')!;
    expect(icons.getAttribute('aria-hidden')).toBe('true');
    expect([...icons.querySelectorAll('svg')].map((s) => s.dataset['icon'])).toEqual(['copy', 'check']);
  });

  it('the scrolling box holds the button (a scroller with a focusable child adds no tab stop)', async () => {
    const { doc } = await render({ choices: scope });
    expect(doc.querySelector('.ocx-cmdbar__field > button[data-part="trigger"]')).not.toBeNull();
    expect(doc.querySelector('.ocx-cmdbar__copy [tabindex]')).toBeNull();
  });

  it('a live status region sits beside the button, empty until a copy', async () => {
    const { doc } = await render({ choices: scope });
    const status = doc.querySelector('.ocx-cmdbar__status')!;
    expect(status.getAttribute('role')).toBe('status');
    expect(status.textContent).toBe('');
    expect(status.closest('button')).toBeNull();
  });

  it('the copy root is the clipboard machine: root and trigger equal connect() for the same props, value = first command', async () => {
    const { doc } = await render({ choices: scope, noun: 'add command', zag: { timeout: 900 } });
    const root = doc.querySelector<HTMLElement>('[data-zag-root="clipboard"]')!;
    expect(root.dataset['zagState']).toBe('idle');
    expect(root.dataset['label']).toBe('Global add command');
    const props = JSON.parse(root.dataset['zagProps']!) as Record<string, unknown>;
    // `defaultValue`, not `value`: a pick moves the running machine through setValue.
    expect(props).toEqual({ timeout: 900, defaultValue: scope[0]!.command });
    const api = ssrApi(clipboard.machine, clipboard.connect, { ...props, id: root.dataset['zagId'] });
    expect(api.value).toBe(scope[0]!.command);
    // Scoped to the copy root: the picker's Select has parts of its own with the same names.
    const attrs = (el: Element) =>
      Object.fromEntries(
        [...el.attributes]
          .filter((a) => a.name !== 'class' && !a.name.startsWith('data-astro-'))
          .map((a) => [a.name, a.value]),
      );
    expect(attrs(root)).toEqual(
      domAttrs({
        ...api.getRootProps(),
        'data-zag-root': 'clipboard',
        'data-zag-state': 'idle',
        'data-zag-id': root.dataset['zagId'],
        'data-zag-props': root.dataset['zagProps'],
        'data-label': 'Global add command',
      }),
    );
    expect(attrs(root.querySelector('button')!)).toEqual(
      domAttrs({ ...api.getTriggerProps(), 'aria-label': 'Copy Global add command' }),
    );
  });

  it('choices ride on the bar for the behaviour: value, label and command only (no icon names)', async () => {
    const { doc } = await render({ choices: install, noun: 'install command' });
    const bar = doc.querySelector<HTMLElement>('.ocx-cmdbar')!;
    expect(JSON.parse(bar.dataset['choices']!)).toEqual(
      install.map(({ value, label, command }) => ({ value, label, command })),
    );
    expect(bar.dataset['noun']).toBe('install command');
  });

  it('two bars on one page get distinct machine ids', async () => {
    const a = (await render({ choices: scope })).doc.querySelector<HTMLElement>('[data-zag-root="clipboard"]')!;
    const b = (await render({ choices: scope })).doc.querySelector<HTMLElement>('[data-zag-root="clipboard"]')!;
    expect(a.dataset['zagId']).not.toBe(b.dataset['zagId']);
  });
});

describe('CommandBar SSR: action slot and detect', () => {
  it('an icon-only action (Hint around an iconOnly Button) sits in the segment, named by aria-label', async () => {
    const action =
      '<span class="ocx-ui-hint"><a class="ocx-ui-button" data-icon-only href="#v" aria-label="Open in VS Code"><svg></svg></a></span>';
    const { doc } = await render({ choices: scope }, { action });
    const link = doc.querySelector('.ocx-cmdbar__action a')!;
    expect(link.getAttribute('aria-label')).toBe('Open in VS Code');
    expect(link.textContent).toBe('');
  });

  it('the slot renders last, in its own segment, and only when given', async () => {
    const withAction = (await render({ choices: scope }, { action: '<a class="x" href="#v">VS Code</a>' })).doc;
    const bar = withAction.querySelector('.ocx-cmdbar')!;
    expect(bar.lastElementChild?.classList.contains('ocx-cmdbar__action')).toBe(true);
    expect(bar.querySelector('.ocx-cmdbar__action .x')).not.toBeNull();
    expect((await render({ choices: scope })).doc.querySelector('.ocx-cmdbar__action')).toBeNull();
  });

  it('detect with a picker: the pre-paint script follows the command text directly, after the picker', async () => {
    const { html, doc } = await render({ choices: install, detect: true });
    const script = doc.querySelector<HTMLScriptElement>('.ocx-cmdbar__copy script')!;
    expect(script.textContent).toBe(PRE_PAINT);
    expect(script.hasAttribute('type')).toBe(false); // classic, parser-blocking: runs before paint
    expect(script.hasAttribute('async') || script.hasAttribute('defer')).toBe(false);
    // Nothing between the SSR text and its swap: a parser yield (a paint) cannot fall in between.
    expect(html).toMatch(/<\/code>\s*<script>/);
    expect(script.previousElementSibling?.classList.contains('ocx-cmdbar__text')).toBe(true);
    expect(script.compareDocumentPosition(doc.querySelector('.ocx-cmdbar__picker')!)).toBe(
      doc.DOCUMENT_POSITION_PRECEDING,
    );
  });

  it('no detect, or nothing to pick: no inline script; SSR is the first choice either way', async () => {
    expect((await render({ choices: install })).doc.querySelector('.ocx-cmdbar__copy script')).toBeNull();
    expect(
      (await render({ choices: [scope[0]], detect: true })).doc.querySelector('.ocx-cmdbar__copy script'),
    ).toBeNull();
    const { doc } = await render({ choices: install, detect: true });
    expect(doc.querySelector('.ocx-cmdbar__text')?.textContent?.trim()).toBe(install[0]!.command);
  });
});

describe('CommandBar types', () => {
  it('choices are required, an icon must be a registry name, an empty list is legal', () => {
    const lines = probeErrorLines(
      new URL('../src/components/ui/CommandBar.astro', import.meta.url),
      [
        "const a: Props = { choices: [{ value: 'l', label: 'Linux', command: 'x', icon: 'linux' }], detect: true };",
        'const b: Props = { choices: [] };',
        'const c: Props = {};',
        "const d: Props = { choices: [{ value: 'l', label: 'Linux', command: 'x', icon: 'no-such-icon' }] };",
        "const e: Props = { choices: [{ value: 'l', label: 'Linux' }] };",
        'void [a, b, c, d, e];',
      ].join('\n'),
    );
    expect(lines).toEqual([2, 3, 4]); // c, d, e (0-based probe lines)
  });
});

describe('CommandBar styles (command-bar.css)', () => {
  const css = source('../src/components/ui/command-bar.css');

  it('sit in @layer ocx, tokens only, forced-colors block present', () => {
    expect(css).toMatch(/^@layer ocx\s*\{/m);
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(/i);
    expect(css).toMatch(/@media \(forced-colors: active\)/);
  });

  it('the command scrolls inside the field, never the page: scroller with no bar, contained width', () => {
    expect(css).toMatch(/\.ocx-cmdbar__field \{[^}]*overflow: auto hidden/);
    expect(css).toMatch(/\.ocx-cmdbar__field \{[^}]*scrollbar-width: none/);
    expect(css).toMatch(/\.ocx-cmdbar__copy \{[^}]*contain: inline-size/);
    expect(css).toMatch(/\.ocx-cmdbar__text \{[^}]*white-space: nowrap/);
  });

  it('copy and check share a grid cell and crossfade on the code block duration and curve, state from data-copied', () => {
    expect(css).toMatch(
      /\.ocx-cmdbar__icons > \* \{[^}]*grid-area: 1 \/ 1;[^}]*transition: opacity var\(--ocx-duration-moderate\) var\(--ocx-ease-in-out\)/,
    );
    expect(css).toMatch(/\.ocx-cmdbar__copy\[data-copied\] \.ocx-cmdbar__done \{[^}]*opacity: 1/);
    expect(css).toMatch(/\.ocx-cmdbar__copy\[data-copied\] \.ocx-cmdbar__idle \{[^}]*opacity: 0/);
  });

  it('accent is not used (focus, success and hover tokens only)', () => {
    expect(css).not.toMatch(/--ocx-color-accent/);
  });

  it('the component ships no <style> of its own and imports the sheet', () => {
    const astro = source('../src/components/ui/CommandBar.astro');
    expect(astro).not.toMatch(/<style/);
    expect(astro).toContain("import './command-bar.css';");
  });

  it('Zag is imported only through the clipboard module (no second copy implementation)', () => {
    const astro = source('../src/components/ui/CommandBar.astro');
    const mjs = source('../src/components/ui/command-bar.mjs');
    expect(astro + mjs).not.toMatch(/@zag-js\/(?!clipboard)/);
    expect(mjs).not.toMatch(/navigator\.clipboard|writeText/);
    expect(mjs).toContain("import('../clipboard.zag.mjs')");
  });
});
