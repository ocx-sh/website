// C-024 theme toggle: one component in the header and the mobile menu; a click
// flips html[data-theme] and writes localStorage['starlight-theme'], and still
// flips when storage throws. Runs in the node environment (the Container API
// cannot render under vitest's jsdom environment), so the DOM half drives the
// injectable toggle against its own JSDOM window.
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
// @ts-expect-error jsdom ships no types and @types/jsdom is not a dependency
import * as jsdom from 'jsdom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { wireThemeToggles } from '../src/starlight/theme-toggle.mjs';

type Component = Parameters<AstroContainer['renderToString']>[0];
type Win = Window & typeof globalThis;
const { JSDOM } = jsdom as { JSDOM: new (html: string, options?: { url?: string }) => { window: Win } };
const load = async (name: string): Promise<Component> =>
  ((await import(`../src/starlight/${name}.astro`)) as { default: Component }).default;

const t = Object.assign((key: string) => key, { all: () => ({}) });
let container: AstroContainer;

async function renderHtml(name: string): Promise<string> {
  return container.renderToString(await load(name), {
    request: new Request('https://ocx.sh/docs/x/'),
    locals: { t, starlightRoute: { locale: undefined } } as unknown as App.Locals,
  });
}

/** A same-origin window (opaque origins have no localStorage) holding `body`. */
function windowWith(body: string, theme: 'light' | 'dark'): Win {
  const { window } = new JSDOM(`<!doctype html><html data-theme="${theme}"><body>${body}</body></html>`, {
    url: 'https://ocx.sh/docs/x/',
  });
  return window;
}

/** Accessible name: the current state's label, then the next-state hint. */
const nameOf = (btn: HTMLElement): string => btn.getAttribute('aria-label') ?? '';

const toggleButton = (doc: Document): HTMLButtonElement => {
  const btn = doc.querySelector<HTMLButtonElement>('button[data-ocx-theme]');
  if (!btn) throw new Error('no [data-ocx-theme] button');
  return btn;
};

beforeAll(async () => {
  container = await AstroContainer.create();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('C-024 toggle behaviour', () => {
  it('C-024: click flips html[data-theme] dark → light → dark and persists each flip', async () => {
    const win = windowWith(await renderHtml('ThemeSelect'), 'dark');
    wireThemeToggles(win.document);
    const btn = toggleButton(win.document);

    btn.click();
    expect(win.document.documentElement.dataset.theme).toBe('light');
    expect(win.localStorage.getItem('starlight-theme')).toBe('light');

    btn.click();
    expect(win.document.documentElement.dataset.theme).toBe('dark');
    expect(win.localStorage.getItem('starlight-theme')).toBe('dark');
  });

  it('C-024: the button follows the page theme on wire-up and after each click (state, glyph, name)', async () => {
    const win = windowWith(await renderHtml('ThemeSelect'), 'dark');
    wireThemeToggles(win.document);
    const btn = toggleButton(win.document);
    const current = () => btn.querySelector('.ocx-ui-cycle-button__current')?.getAttribute('data-icon');
    expect(btn.dataset.value).toBe('dark');
    expect(current()).toBe('moon');
    expect(nameOf(btn)).toBe('Dark mode (click for Light mode)');
    btn.click();
    expect(btn.dataset.value).toBe('light');
    expect(current()).toBe('sun');
    expect(nameOf(btn)).toBe('Light mode (click for Dark mode)');
  });

  it('C-024: a click on one toggle syncs the others (header and mobile menu)', async () => {
    const one = await renderHtml('ThemeSelect');
    const win = windowWith(one + one, 'light');
    wireThemeToggles(win.document);
    const [first, second] = [...win.document.querySelectorAll<HTMLButtonElement>('button[data-ocx-theme]')];
    first!.click();
    expect(win.document.documentElement.dataset.theme).toBe('dark');
    expect(second!.dataset.value).toBe('dark');
  });

  it('C-024: wiring twice does not advance a click twice', async () => {
    const win = windowWith(await renderHtml('ThemeSelect'), 'light');
    wireThemeToggles(win.document);
    wireThemeToggles(win.document);
    toggleButton(win.document).click();
    expect(win.document.documentElement.dataset.theme).toBe('dark');
  });

  it('C-024: still flips when localStorage.setItem throws', async () => {
    const win = windowWith(await renderHtml('ThemeSelect'), 'light');
    const setItem = vi.spyOn(win.Storage.prototype, 'setItem').mockImplementation(() => {
      throw new win.DOMException('blocked', 'SecurityError');
    });
    wireThemeToggles(win.document);

    expect(() => toggleButton(win.document).click()).not.toThrow();
    expect(setItem).toHaveBeenCalled();
    expect(win.document.documentElement.dataset.theme).toBe('dark');
  });

  it('D-R9: a view transition wraps the flip, and the switch attribute holds until it finishes', async () => {
    const win = windowWith(await renderHtml('ThemeSelect'), 'light');
    const root = win.document.documentElement;
    root.style.setProperty('--ocx-duration-moderate', '0.2s');
    let update: (() => void) | undefined;
    let finish: () => void = () => {};
    const finished = new Promise<void>((resolve) => (finish = resolve));
    Object.assign(win.document, {
      startViewTransition: (cb: () => void) => ((update = cb), { ready: Promise.resolve(), finished }),
    });
    wireThemeToggles(win.document);
    toggleButton(win.document).click();
    expect(root.dataset.theme).toBe('light'); // the flip waits for the old snapshot
    expect(root.dataset.ocxThemeSwitch).toBe('');
    update?.();
    expect(root.dataset.theme).toBe('dark');
    finish();
    await finished;
    await Promise.resolve();
    expect(root.dataset.ocxThemeSwitch).toBeUndefined();
  });

  it('D-R9: with the motion tokens zeroed (reduced motion) the flip is instant and leaves no attribute', async () => {
    const win = windowWith(await renderHtml('ThemeSelect'), 'light');
    const startViewTransition = vi.fn();
    Object.assign(win.document, { startViewTransition });
    wireThemeToggles(win.document);
    toggleButton(win.document).click();
    expect(win.document.documentElement.dataset.theme).toBe('dark');
    expect(startViewTransition).not.toHaveBeenCalled();
    expect(win.document.documentElement.dataset.ocxThemeSwitch).toBeUndefined();
  });
});

describe('C-024 markup', () => {
  it('C-024: ThemeSelect renders a button with an accessible name and the data-ocx-theme hook', async () => {
    const btn = toggleButton(new JSDOM(await renderHtml('ThemeSelect')).window.document);
    expect(btn.getAttribute('type')).toBe('button');
    expect(nameOf(btn)).toBe('Light mode (click for Dark mode)');
    expect(btn.classList.contains('ocx-ui-cycle-button')).toBe(true);
  });

  it('C-112: each toggle is the button and its two glyphs, nothing else (it renders twice per page)', async () => {
    const btn = toggleButton(new JSDOM(await renderHtml('ThemeSelect')).window.document);
    expect([...btn.children].map((c) => c.getAttribute('data-icon'))).toEqual(['sun', 'moon']);
    expect(btn.querySelectorAll('*')).toHaveLength(5); // two svgs, three shape children (sun 2, moon 1)
  });

  it.each(['Header', 'MobileMenuFooter'])('C-024: %s contains exactly one ThemeSelect toggle', async (name) => {
    const doc = new JSDOM(await renderHtml(name)).window.document;
    expect(doc.querySelectorAll('button[data-ocx-theme]')).toHaveLength(1);
    expect(doc.querySelector('starlight-theme-select, select')).toBeNull();
  });

  it('C-024: Header and MobileMenuFooter render the same toggle markup', async () => {
    const markup = async (name: string) => toggleButton(new JSDOM(await renderHtml(name)).window.document).outerHTML;
    expect(await markup('MobileMenuFooter')).toBe(await markup('Header'));
  });
});
