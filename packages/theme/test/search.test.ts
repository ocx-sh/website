// C-210 Search override on Zag dialog: SSR markup equals the machine's connect() (C-130a/b),
// Starlight's hooks are kept (D-Z4), Pagefind options pass through unchanged (mergeIndex
// included) and Pagefind UI is imported on the first open only; S-103 dev note, no console error.
// Browser behaviour (Ctrl/⌘K, focus, Esc, merged results) is tests/e2e/search-dialog.spec.ts.
import { readFileSync } from 'node:fs';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { builtinEnvironments } from 'vitest/runtime';
import { ICONS } from '../src/icons/icons.mjs';
import { ssrApi, ssrAttrs } from '../src/components/ui/zag-runtime.mjs';
import { mount, type ZagModule } from '../src/components/ui/zag.mjs';
import { expectSsrMatchesConnect } from './zag-helpers.ts';

const PagefindUI = vi.fn();
vi.mock('@pagefind/default-ui', () => ({ PagefindUI }));

type Component = Parameters<AstroContainer['renderToString']>[0];
type Dialog = typeof import('../src/starlight/search.zag.mjs');

const t = Object.assign((key: string) => ({ 'search.label': 'Search', 'search.cancelLabel': 'Cancel' })[key] ?? key, {
  all: () => ({ 'pagefind.zero_results': 'No results for [SEARCH_TERM]', 'search.label': 'Search' }),
});
let html = '';
let mod: Dialog;
let teardown: (global: typeof globalThis) => unknown = () => undefined;

// SSR renders under Node; the runtime then runs in jsdom globals (a jsdom test environment would
// compile the .astro file for the client, which the Container API cannot render).
beforeAll(async () => {
  const container = await AstroContainer.create();
  const name = 'Search'; // a template specifier: tsc has no module type for .astro files
  const Search = ((await import(`../src/starlight/${name}.astro`)) as { default: Component }).default;
  html = await container.renderToString(Search, {
    request: new Request('https://ocx.sh/docs/x/'),
    locals: { t, starlightRoute: {} } as unknown as App.Locals,
  });
  mod = await import('../src/starlight/search.zag.mjs');
  ({ teardown } = await builtinEnvironments.jsdom.setup(globalThis, {}));
});
afterAll(() => teardown(globalThis));

afterEach(() => {
  vi.restoreAllMocks();
  PagefindUI.mockClear();
  document.body.innerHTML = '';
  document.body.removeAttribute('data-search-modal-open');
});

const parse = () => {
  document.body.innerHTML = html;
  return document.querySelector<HTMLElement>('site-search')!;
};
const api = () => ssrApi(mod.machine, mod.connect, { 'aria-label': 'Search', id: 'search' });

describe('C-210 Search SSR (C-130 a, b)', () => {
  it('C-130b: the root is a manual Zag dialog root, idle, with its props', () => {
    const root = parse();
    expect(root.dataset).toMatchObject({
      zagRoot: 'dialog',
      zagState: 'idle',
      zagTrigger: 'manual',
      zagId: 'search',
      zagProps: JSON.stringify({ 'aria-label': 'Search' }),
    });
  });

  it('C-130a: the backdrop part equals connect()', () => {
    expectSsrMatchesConnect(html, 'backdrop', api().getBackdropProps());
  });

  // Zag points aria-describedby at a description part that does not exist; SSR and render drop it.
  it('C-130a: the content part equals connect() without the dangling aria-describedby', () => {
    expect(api().getContentProps()['aria-describedby']).toBe('dialog:search:description');
    expectSsrMatchesConnect(html, 'content', { ...api().getContentProps(), 'aria-describedby': undefined });
  });

  it('every id reference in the SSR markup resolves', () => {
    const root = parse();
    for (const el of root.querySelectorAll('[aria-controls], [aria-labelledby], [aria-describedby]'))
      for (const attr of ['aria-controls', 'aria-labelledby', 'aria-describedby'])
        for (const ref of el.getAttribute(attr)?.split(' ') ?? [])
          expect(document.getElementById(ref), ref).not.toBeNull();
  });

  it.each([
    ['trigger', () => api().getTriggerProps()],
    ['close-trigger', () => api().getCloseTriggerProps()],
  ] as const)('C-130a: the %s part carries every connect() attribute', (part, props) => {
    const el = parse().querySelector(`[data-part="${part}"]`)!;
    for (const [name, value] of Object.entries(ssrAttrs(props()))) expect(el.getAttribute(name), name).toBe(value);
  });

  it('C-130a: no data-focus* at SSR; the dialog is hidden until open', () => {
    expect(html).not.toMatch(/data-focus/);
    const root = parse();
    expect(root.querySelector('[data-part="content"]')!.hasAttribute('hidden')).toBe(true);
    expect(root.querySelector('[data-part="backdrop"]')!.hasAttribute('hidden')).toBe(true);
  });

  it("D-Z4: Starlight's search hooks stay (site-search, data-open-modal, data-close-modal, translations)", () => {
    const root = parse();
    const trigger = root.querySelector('button[data-open-modal]')!;
    expect(trigger.getAttribute('data-part')).toBe('trigger');
    expect(trigger.getAttribute('aria-label')).toBe('Search');
    expect(trigger.getAttribute('aria-keyshortcuts')).toBe('Control+K');
    expect(trigger.querySelector('kbd kbd')).not.toBeNull();
    expect(root.querySelector('button[data-close-modal]')?.getAttribute('data-part')).toBe('close-trigger');
    expect(JSON.parse(root.dataset['translations']!)).toEqual({
      placeholder: 'Search',
      zero_results: 'No results for [SEARCH_TERM]',
    });
  });

  it('S-103: in dev the dialog holds the "search works in builds" note instead of #starlight__search', () => {
    const root = parse();
    expect(root.querySelector('#starlight__search')).toBeNull();
    expect(root.querySelector('[data-part="content"]')!.textContent).toContain('search.devWarning');
  });
});

describe('C-210 Pagefind options', () => {
  const mergeIndex = [
    { bundlePath: '/pagefind/', mergeFilter: { section: 'ocx' }, indexWeight: 1 },
    { bundlePath: '/integrations/bazel/pagefind/', mergeFilter: { section: 'Bazel' }, indexWeight: 1 },
  ];
  const context = { base: '/docs/', translations: { placeholder: 'Search' }, stripTrailingSlash: false };

  it("passes Starlight's config through unchanged, mergeIndex included", () => {
    const config = { ranking: { termFrequency: 0.5 }, indexWeight: 2, mergeIndex };
    const options = mod.pagefindOptions(config, context);
    expect(options).toMatchObject({
      ranking: { termFrequency: 0.5 },
      indexWeight: 2,
      element: '#starlight__search',
      baseUrl: '/docs/',
      bundlePath: '/docs/pagefind/',
      showImages: false,
      showSubResults: true,
      translations: { placeholder: 'Search' },
    });
    expect(options['mergeIndex']).toBe(mergeIndex);
    expect(mod.pagefindOptions({}, { ...context, base: '/' })['bundlePath']).toBe('/pagefind/');
  });

  it.each([
    [false, '/docs/a/', '/docs/a/#h'],
    [true, '/docs/a', '/docs/a#h'],
  ])('processResult with stripTrailingSlash=%s → %s', (strip, url, sub) => {
    const { processResult } = mod.pagefindOptions({}, { ...context, stripTrailingSlash: strip }) as {
      processResult: (r: { url: string; sub_results: { url: string }[] }) => void;
    };
    const result = { url: '/docs/a/', sub_results: [{ url: '/docs/a/#h' }] };
    processResult(result);
    expect(result).toEqual({ url, sub_results: [{ url: sub }] });
  });
});

describe('C-210 dialog runtime', () => {
  const start = async (prod: boolean) => {
    const root = parse();
    if (prod)
      root
        .querySelector('[data-part="content"]')!
        .insertAdjacentHTML('beforeend', '<div id="starlight__search"></div>');
    const load = vi.fn(() => Promise.resolve(mod as unknown as ZagModule));
    const handle = mount(root, { load, trigger: 'manual', replay: false });
    await handle.start();
    const dialog = () => handle.api as { open: boolean; setOpen: (o: boolean) => void };
    return { root, handle, dialog, load };
  };
  const settle = () => new Promise((r) => setTimeout(r, 20));

  it('opens and closes through the api: content shown, body hook and ocx:search:change', async () => {
    const { root, dialog } = await start(false);
    const events: unknown[] = [];
    root.addEventListener('ocx:search:change', (e) => events.push((e as CustomEvent).detail));
    expect(root.dataset['zagState']).toBe('live');
    const content = root.querySelector('[data-part="content"]')!;
    expect(content.hasAttribute('aria-describedby')).toBe(false);
    dialog().setOpen(true);
    await settle();
    expect(root.querySelector('[data-part="content"]')!.hasAttribute('hidden')).toBe(false);
    expect(root.querySelector('[data-part="trigger"]')!.getAttribute('aria-expanded')).toBe('true');
    expect(document.body.hasAttribute('data-search-modal-open')).toBe(true);
    dialog().setOpen(false);
    await settle();
    expect(root.querySelector('[data-part="content"]')!.hasAttribute('hidden')).toBe(true);
    expect(document.body.hasAttribute('data-search-modal-open')).toBe(false);
    expect(events).toEqual([{ open: true }, { open: false }]);
  });

  it('the close trigger closes the dialog', async () => {
    const { root, dialog } = await start(false);
    dialog().setOpen(true);
    await settle();
    root.querySelector<HTMLButtonElement>('[data-close-modal]')!.click();
    await settle();
    expect(dialog().open).toBe(false);
  });

  it('Pagefind UI is constructed on the first open only, once, with the Pagefind options', async () => {
    const { dialog } = await start(true);
    await settle();
    expect(PagefindUI).not.toHaveBeenCalled();
    dialog().setOpen(true);
    await vi.waitFor(() => expect(PagefindUI).toHaveBeenCalledTimes(1));
    expect(PagefindUI.mock.calls[0]![0]).toMatchObject({ element: '#starlight__search', showSubResults: true });
    dialog().setOpen(false);
    dialog().setOpen(true);
    await settle();
    expect(PagefindUI).toHaveBeenCalledTimes(1);
  });

  it('S-103: without a Pagefind bundle (dev) opening loads nothing and logs no error', async () => {
    const error = vi.spyOn(console, 'error');
    const { dialog } = await start(false);
    dialog().setOpen(true);
    await settle();
    expect(PagefindUI).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});

// D-P11 / C-274: Pagefind's input wears the SearchField look through CSS only (the c-input box of
// ui/field.css). A cascade cannot run in jsdom, so this pins the source: tokens, the focus rule and
// that both glyphs are the registry's own paths inline (a data URI is no late request).
describe('C-274 Pagefind input wears the SearchField look', () => {
  const source = readFileSync(new URL('../src/starlight/Search.astro', import.meta.url), 'utf8');
  const rules = (selector: string) => {
    const at = source.lastIndexOf(`${selector} {`);
    return at < 0 ? '' : source.slice(at, source.indexOf('}', at));
  };
  const input = rules('#starlight__search .pagefind-ui__search-input');
  const clear = rules('#starlight__search .pagefind-ui__search-clear');
  const withoutData = (css: string) => css.replace(/url\("data:[^"]*"\)/g, 'url()');

  it('the input is the c-input box on tokens, mono text-sm, 2xl high', () => {
    for (const decl of [
      'block-size: var(--_h, var(--ocx-control-2xl))',
      'font-family: var(--ocx-font-mono)',
      'font-size: var(--ocx-text-sm)',
      'background: var(--ocx-color-surface)',
      'border: var(--ocx-border-width) solid var(--ocx-color-border)',
      'border-radius: var(--ocx-radius-md)',
    ])
      expect(input, decl).toContain(decl);
  });

  it('focus is a border colour, no ring', () => {
    const focus = rules('#starlight__search .pagefind-ui__search-input:focus');
    expect(focus).toContain('border-color: var(--ocx-color-focus)');
    expect(focus).toContain('outline: none');
  });

  it('forced colours give the focused input an outline', () => {
    expect(source).toMatch(
      /forced-colors: active\)\s*\{\s*#starlight__search \.pagefind-ui__search-input:focus-visible\s*\{\s*outline:[^;]*Highlight/,
    );
  });

  it('the clear is a ghost icon button: fg-subtle, neutral hover, square ring on focus-visible', () => {
    expect(clear).toContain('color: var(--ocx-color-fg-subtle)');
    expect(clear).toContain('background: none');
    expect(rules('#starlight__search .pagefind-ui__search-clear:hover')).toContain('color: var(--ocx-color-fg)');
    expect(rules('#starlight__search .pagefind-ui__search-clear:focus-visible')).toContain(
      'outline: var(--ocx-focus-ring)',
    );
  });

  it('every rule of the block uses tokens: no raw colour, length or opacity dial', () => {
    const block = source.slice(source.indexOf("Pagefind's input wears the SearchField look"));
    const css = withoutData(block.slice(block.indexOf('@layer ocx')));
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(|\b\d+(\.\d+)?(px|rem|em)\b/i);
    expect(css).toMatch(/color: var\(--ocx-color-fg-subtle\)/);
  });

  it.each(['search', 'close'] as const)('the %s mask is the registry path, inline (inline data URI)', (name) => {
    const masks = [...source.matchAll(/mask: url\("(data:image\/svg\+xml,[^"]*)"\)/g)]
      .map((m) => decodeURIComponent(m[1]!))
      .filter((uri) => uri.includes(name === 'search' ? 'circle' : 'M18 6L6 18'));
    expect(masks.length).toBeGreaterThan(0);
    // ICONS body attributes are double-quoted; the data URI single-quotes them.
    for (const [, attr, value] of ICONS[name].body.matchAll(/(\w+)="([^"]*)"/g))
      for (const uri of masks) expect(uri).toContain(`${attr}='${value}'`);
  });
});
