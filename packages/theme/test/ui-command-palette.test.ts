// <CommandPalette>: SSR shape (trigger, dialog parts, combobox attributes, status regions), the dialog
// parts equal to the Zag dialog connect() (C-130a), the stylesheet's layout rules, and the props
// type. Behaviour under a DOM is in ui-command-palette.dom.test.ts.
import { readFileSync } from 'node:fs';
import * as dialog from '@zag-js/dialog';
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
const CommandPalette = ((await import(`../src/components/ui/${'CommandPalette'}.astro`)) as { default: Component })
  .default;
const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});
const render = async (props: Record<string, unknown> = {}) => {
  const html = await container.renderToString(CommandPalette, { props: { id: 'pal', ...props } });
  return { html, doc: new JSDOM(html).window.document };
};

describe('CommandPalette SSR: trigger', () => {
  it('D-097 the trigger is named by an aria-label, so no viewport can reduce it to the keycaps', async () => {
    const { doc } = await render({ triggerLabel: 'Search packages' });
    const trigger = doc.querySelector('[data-cmdpalette-trigger]')!;
    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger.getAttribute('aria-label')).toBe('Search packages');
    expect(trigger.querySelector('.ocx-header__search-label')?.textContent).toBe('Search packages');
    // base.css hides exactly these three below the header breakpoint; the e2e checks it in a real header.
    expect(trigger.classList.contains('ocx-header__search')).toBe(true);
    expect(trigger.querySelector('.ocx-header__search .ocx-kbd-group')).not.toBeNull();
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.getAttribute('aria-keyshortcuts')).toBe('Control+K');
  });

  it('D-107 the Mod+K keycap renders both the Command and the Ctrl variant (CSS shows one per platform)', async () => {
    const { doc } = await render();
    const keys = doc.querySelector('[data-cmdpalette-trigger] .ocx-kbd-group')!;
    expect(keys.querySelector('[data-os="mac"]')?.textContent).toContain('⌘');
    expect(keys.querySelector('[data-os="windows"]')?.textContent).toBe('Ctrl');
    expect(keys.textContent).toContain('K');
  });

  it('carries no Zag trigger props: the script owns the click, a live machine never toggles it twice', async () => {
    const { doc } = await render();
    const trigger = doc.querySelector('[data-cmdpalette-trigger]')!;
    expect(trigger.hasAttribute('id')).toBe(false);
    expect(trigger.hasAttribute('data-part')).toBe(false);
  });
});

describe('CommandPalette SSR: dialog', () => {
  it('is a manual-trigger Zag dialog root, closed, with the trigger and every part inside it', async () => {
    const { doc } = await render();
    const root = doc.querySelector<HTMLElement>('.ocx-cmdpalette')!;
    expect(root.dataset['zagRoot']).toBe('dialog');
    expect(root.dataset['zagId']).toBe('pal');
    expect(root.dataset['zagTrigger']).toBe('manual');
    expect(root.dataset['zagState']).toBe('idle');
    expect(JSON.parse(root.dataset['zagProps']!)).toEqual({ defaultOpen: false, modal: true });
    for (const part of ['backdrop', 'positioner', 'content', 'title'])
      expect(root.querySelector(`[data-part="${part}"]`), part).not.toBeNull();
    expect(root.querySelector('[data-part="content"]')?.hasAttribute('hidden')).toBe(true);
    expect(root.querySelector('[data-part="content"]')?.getAttribute('role')).toBe('dialog');
  });

  it('every part equals the dialog machine connect() output (one source for SSR and the live paint)', async () => {
    const { html } = await render();
    const api = ssrApi(dialog.machine, dialog.connect, { defaultOpen: false, modal: true, id: 'pal' });
    expectSsrMatchesConnect(html, 'backdrop', api.getBackdropProps());
    expectSsrMatchesConnect(html, 'positioner', api.getPositionerProps());
  });

  it('D-096 the dialog is named "Search" by a visually hidden title and described by a hidden description', async () => {
    const { doc } = await render();
    const content = doc.querySelector('[data-part="content"]')!;
    const title = doc.querySelector('[data-part="title"]')!;
    expect(title.textContent).toBe('Search');
    expect(title.classList.contains('ocx-cmdpalette__sr')).toBe(true);
    expect(content.getAttribute('aria-labelledby')).toBe(title.id);
    const description = doc.querySelector('[data-part="description"]')!;
    expect(description.classList.contains('ocx-cmdpalette__sr')).toBe(true);
    expect(description.textContent).toMatch(/arrow keys/);
  });

  it('D-096 label and description are props; an empty description renders none', async () => {
    const named = await render({ label: 'Find', description: 'Find things.' });
    expect(named.doc.querySelector('[data-part="title"]')?.textContent).toBe('Find');
    expect(named.doc.querySelector('[data-part="description"]')?.textContent).toBe('Find things.');
    expect((await render({ description: '' })).doc.querySelector('[data-part="description"]')).toBeNull();
  });
});

describe('CommandPalette SSR: search bar and results', () => {
  it('D-103 the input turns autocomplete, autocorrect and autocapitalize off, spellcheck false, with a configurable placeholder', async () => {
    const { doc } = await render({ placeholder: 'Search packages and docs…' });
    const input = doc.querySelector<HTMLInputElement>('[data-cmdpalette-input]')!;
    expect(input.getAttribute('autocomplete')).toBe('off');
    expect(input.getAttribute('autocorrect')).toBe('off');
    expect(input.getAttribute('autocapitalize')).toBe('off');
    expect(input.getAttribute('spellcheck')).toBe('false');
    expect(input.getAttribute('placeholder')).toBe('Search packages and docs…');
    expect((await render()).doc.querySelector('[data-cmdpalette-input]')?.getAttribute('placeholder')).toBe('Search…');
  });

  it('the input is a combobox over the results listbox, collapsed, auto-focused on open', async () => {
    const { doc } = await render();
    const input = doc.querySelector('[data-cmdpalette-input]')!;
    expect(input.getAttribute('role')).toBe('combobox');
    expect(input.getAttribute('aria-label')).toBe('Search');
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(input.getAttribute('aria-autocomplete')).toBe('list');
    expect(input.hasAttribute('data-autofocus')).toBe(true);
    const list = doc.querySelector('[data-cmdpalette-list]')!;
    expect(input.getAttribute('aria-controls')).toBe(list.id);
    expect(list.getAttribute('role')).toBe('listbox');
    expect(list.getAttribute('aria-label')).toBe('Results');
    // An empty listbox would fail aria-required-children: it stays hidden until rows exist.
    expect(list.hasAttribute('hidden')).toBe(true);
    expect(list.children).toHaveLength(0);
  });

  it('D-104 a visible "Esc" close button follows the input, named "Close (Esc)"', async () => {
    const { doc } = await render();
    const close = doc.querySelector('[data-cmdpalette-close]')!;
    expect(close.tagName).toBe('BUTTON');
    expect(close.textContent?.trim()).toBe('Esc');
    expect(close.getAttribute('aria-label')).toBe('Close (Esc)');
    expect(close.hasAttribute('data-part')).toBe(false);
    const input = doc.querySelector('[data-cmdpalette-input]')!;
    expect(input.compareDocumentPosition(close) & 4).toBe(4); // DOCUMENT_POSITION_FOLLOWING
  });

  it('D-100 the empty-query hint is a prop, hidden when empty', async () => {
    const hint = 'Search packages by name or keyword, or documentation by title.';
    const shown = (await render({ hint })).doc.querySelector('[data-cmdpalette-hint]')!;
    expect(shown.textContent).toBe(hint);
    expect(shown.hasAttribute('hidden')).toBe(false);
    expect((await render()).doc.querySelector('[data-cmdpalette-hint]')?.hasAttribute('hidden')).toBe(true);
  });

  it('the status is a polite live region; the messages travel as data attributes the script fills', async () => {
    const { doc } = await render({ noResults: 'Nothing for {query}', count: '{count} found', error: 'Broke' });
    const status = doc.querySelector('[data-cmdpalette-status]')!;
    expect(status.getAttribute('role')).toBe('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.textContent).toBe('');
    const root = doc.querySelector<HTMLElement>('.ocx-cmdpalette')!;
    expect([root.dataset['noResults'], root.dataset['count'], root.dataset['error']]).toEqual([
      'Nothing for {query}',
      '{count} found',
      'Broke',
    ]);
  });

  it('D-105 the bar is a sibling of the results region, which is the one scroller', async () => {
    const { doc } = await render();
    const content = doc.querySelector('[data-part="content"]')!;
    const bar = content.querySelector('.ocx-cmdpalette__bar')!;
    const results = content.querySelector('.ocx-cmdpalette__results')!;
    expect(bar.parentElement).toBe(content);
    expect(results.parentElement).toBe(content);
    expect(results.contains(doc.querySelector('[data-cmdpalette-list]'))).toBe(true);
    expect(bar.contains(doc.querySelector('[data-cmdpalette-input]'))).toBe(true);
  });
});

describe('CommandPalette stylesheet', () => {
  const css = source('../src/components/ui/command-palette.css');

  it('D-105 the card sits at the palette tokens; only the results region scrolls', () => {
    expect(css).toMatch(/\.ocx-cmdpalette__positioner \{[^}]*padding-block-start: var\(--ocx-palette-top\)/);
    expect(css).toMatch(/\.ocx-cmdpalette__content \{[^}]*inline-size: var\(--ocx-palette-width\)/);
    expect(css).toMatch(/\.ocx-cmdpalette__content \{[^}]*max-block-size: var\(--ocx-palette-height\)/);
    expect(css).toMatch(/\.ocx-cmdpalette__content \{[^}]*overflow: hidden/);
    expect(css).toMatch(/\.ocx-cmdpalette__results \{[^}]*overflow-y: auto/);
    expect(css).toMatch(/\.ocx-cmdpalette__bar \{[^}]*flex: none/);
  });

  it('no raw viewport or tracking value is left in the stylesheet', () => {
    expect(css.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/\d(vh|vw|em)\b/);
  });

  it('D-107 the Command glyph is set in the sans face and the modifier cap has one width for every platform', () => {
    expect(css).toMatch(
      /\.ocx-cmdpalette__trigger \.ocx-kbd-key \[data-os='mac'\] > \[aria-hidden='true'\] \{[^}]*font-family: var\(--ocx-font-sans\)/,
    );
    expect(css).toMatch(/\.ocx-cmdpalette__trigger \.ocx-kbd-key:first-of-type \{[^}]*min-inline-size: 4ch/);
  });

  it('forced colours: the highlighted row and the focused bar get a Highlight outline', () => {
    expect(css).toMatch(
      /@media \(forced-colors: active\) \{[^@]*\.ocx-cmdpalette__option\[aria-selected='true'\] \{[^}]*Highlight/,
    );
    expect(css).toMatch(/\.ocx-cmdpalette__bar:focus-within \{[^}]*Highlight/);
  });

  it('keeps the whole body in @layer ocx and draws colour from tokens only', () => {
    expect(css.trimStart().startsWith('/*')).toBe(true);
    expect(css).toMatch(/^@layer ocx \{/m);
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
  });
});

describe('CommandPalette props type', () => {
  const component = new URL('../src/components/ui/CommandPalette.astro', import.meta.url);

  it('accepts text props and a data-only zag prop, and rejects an unknown prop or a function in zag', () => {
    const probes = [
      "const ok1: Props = { label: 'Search', hint: 'Type', zag: { closeOnEscape: true } };",
      'const bad1: Props = { nope: 1 };',
      'const bad2: Props = { zag: { onOpenChange: () => {} } };',
    ].join('\n');
    const lines = probeErrorLines(component, probes);
    expect(lines).toEqual([1, 2]);
  });
});
