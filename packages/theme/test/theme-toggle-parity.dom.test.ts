// @vitest-environment jsdom
// Catalog 0.5.3 parity for the scheme: the pre-paint script and the toggle keep `data-theme` and the `dark`
// class together (D-127), carry a 0.5.x visitor's stored choice over (D-132), follow the OS until a choice
// is pinned (D-133). jsdom has no matchMedia: each window gets a controllable stand-in.
import { createHash } from 'node:crypto';
// @ts-expect-error jsdom ships no types and @types/jsdom is not a dependency
import * as jsdom from 'jsdom';
import { describe, expect, it } from 'vitest';
import { INLINE_SCRIPT_HASHES } from '../src/csp.mjs';
import { THEME_SCRIPT } from '../src/head-scripts.mjs';
import { storedTheme, wireThemeToggles } from '../src/starlight/theme-toggle.mjs';

type Win = Window & typeof globalThis;
const { JSDOM } = jsdom as {
  JSDOM: new (html: string, options?: { url?: string; runScripts?: 'outside-only' }) => { window: Win };
};

const GLYPH = (icon: string, current: boolean) =>
  `<svg data-icon="${icon}" class="ocx-ui-cycle-button__state${current ? ' ocx-ui-cycle-button__current' : ''}"></svg>`;
const CYCLE = JSON.stringify([
  ['light', 'Light mode'],
  ['dark', 'Dark mode'],
]).replaceAll('"', '&quot;');

/**
 * A fresh window (own listeners, own storage) holding the theme toggle, with a stand-in `matchMedia`
 * whose OS scheme `flipOs` changes, firing the registered `change` listeners.
 */
function page(os: 'light' | 'dark', stored: Record<string, string> = {}) {
  const { window: win } = new JSDOM(
    `<!doctype html><html><body><button type="button" class="ocx-ui-cycle-button" data-ocx-theme data-value="light" data-cycle="${CYCLE}">${GLYPH('sun', true)}${GLYPH('moon', false)}</button></body></html>`,
    { url: 'https://ocx.sh/docs/x/', runScripts: 'outside-only' },
  );
  for (const [k, v] of Object.entries(stored)) win.localStorage.setItem(k, v);
  const listeners: (() => void)[] = [];
  const mql = {
    matches: os === 'light',
    addEventListener: (_: string, fn: () => void) => listeners.push(fn),
  };
  win.matchMedia = ((q: string) => (q.includes('light') ? mql : { matches: false })) as typeof win.matchMedia;
  const root = win.document.documentElement;
  return {
    win,
    root,
    btn: win.document.querySelector<HTMLButtonElement>('button[data-ocx-theme]')!,
    run: (): void => void win.eval(THEME_SCRIPT),
    wire: () => wireThemeToggles(win.document),
    state: () => [root.dataset['theme'], root.classList.contains('dark')],
    flipOs(to: 'light' | 'dark') {
      mql.matches = to === 'light';
      listeners.forEach((fn) => fn());
    },
  };
}

describe('pre-paint theme script', () => {
  it('D-127: sets data-theme and the dark class together, in both schemes', () => {
    for (const [os, expected] of [
      ['dark', ['dark', true]],
      ['light', ['light', false]],
    ] as const) {
      const p = page(os);
      p.run();
      expect(p.state()).toEqual(expected);
    }
  });

  it('D-127: a stored starlight-theme wins over the OS, class included', () => {
    const p = page('light', { 'starlight-theme': 'dark' });
    p.run();
    expect(p.state()).toEqual(['dark', true]);
  });

  it('D-132: a 0.5.x visitor keeps the vitepress-theme-appearance choice until the new key has an entry', () => {
    const cases = [
      ['light', { 'vitepress-theme-appearance': 'dark' }, 'dark'],
      ['dark', { 'vitepress-theme-appearance': 'light' }, 'light'],
      ['light', { 'vitepress-theme-appearance': 'dark', 'starlight-theme': 'light' }, 'light'],
    ] as const;
    for (const [os, stored, expected] of cases) {
      const p = page(os, stored);
      p.run();
      expect(p.root.dataset['theme']).toBe(expected);
    }
  });

  it('D-132: the legacy key moves once into starlight-theme and is removed, in the same synchronous run', () => {
    for (const legacy of ['dark', 'light', 'auto']) {
      const p = page('light', { 'vitepress-theme-appearance': legacy });
      p.run();
      expect(p.win.localStorage.getItem('starlight-theme')).toBe(legacy);
      expect(p.win.localStorage.getItem('vitepress-theme-appearance')).toBeNull();
    }
    // An existing starlight-theme entry is left alone, and so is nothing at all.
    const both = page('light', { 'vitepress-theme-appearance': 'dark', 'starlight-theme': 'light' });
    both.run();
    expect(both.win.localStorage.getItem('starlight-theme')).toBe('light');
    // A junk legacy value is dropped, never copied.
    const junk = page('light', { 'vitepress-theme-appearance': 'banana' });
    junk.run();
    expect(junk.win.localStorage.getItem('starlight-theme')).toBeNull();
    expect(junk.win.localStorage.getItem('vitepress-theme-appearance')).toBeNull();
    expect(junk.root.dataset['theme']).toBe('light');
    const none = page('light');
    none.run();
    expect(none.win.localStorage.getItem('starlight-theme')).toBeNull();
  });

  it('D-132 D-133: auto (either key) and an unknown value follow the OS; `auto` shadows the old key; blocked storage is survived', () => {
    const cases = [
      ['dark', { 'starlight-theme': 'auto' }, 'dark'],
      ['dark', { 'vitepress-theme-appearance': 'auto' }, 'dark'],
      ['dark', { 'starlight-theme': 'x' }, 'dark'],
      ['light', { 'vitepress-theme-appearance': 'dark', 'starlight-theme': 'auto' }, 'light'],
    ] as const;
    for (const [os, stored, expected] of cases) {
      const p = page(os, stored);
      p.run();
      expect(p.root.dataset['theme']).toBe(expected);
    }
    const p = page('light');
    p.win.Storage.prototype.getItem = () => {
      throw new p.win.DOMException('blocked', 'SecurityError');
    };
    p.run();
    expect(p.root.dataset['theme']).toBe('light');
  });

  it('D-127: INLINE_SCRIPT_HASHES carries the hash of the script as it now stands', () => {
    const hash = `sha256-${createHash('sha256').update(THEME_SCRIPT).digest('base64')}`;
    expect(INLINE_SCRIPT_HASHES).toContain(hash);
  });
});

describe('storedTheme', () => {
  it('D-132: reads starlight-theme; auto, unknown, absent or blocked storage is undefined', () => {
    const { win } = page('light');
    expect(storedTheme(win.localStorage)).toBeUndefined();
    win.localStorage.setItem('starlight-theme', 'dark');
    expect(storedTheme(win.localStorage)).toBe('dark');
    win.localStorage.setItem('starlight-theme', 'light');
    expect(storedTheme(win.localStorage)).toBe('light');
    win.localStorage.setItem('starlight-theme', 'auto');
    expect(storedTheme(win.localStorage)).toBeUndefined();
    expect(storedTheme(undefined)).toBeUndefined();
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
    } as unknown as Storage;
    expect(storedTheme(blocked)).toBeUndefined();
  });
});

describe('toggle', () => {
  it('D-127: a click flips data-theme and the dark class together', () => {
    const p = page('light');
    p.run();
    p.wire();
    p.btn.click();
    expect(p.state()).toEqual(['dark', true]);
    p.btn.click();
    expect(p.state()).toEqual(['light', false]);
  });

  it('D-133: with no pinned choice the page follows OS changes live, glyph included', () => {
    const p = page('light');
    p.run();
    p.wire();
    p.flipOs('dark');
    expect([...p.state(), p.btn.dataset['value']]).toEqual(['dark', true, 'dark']);
    p.flipOs('light');
    expect(p.state()).toEqual(['light', false]);
  });

  it('D-133: a click away from the OS value pins it (OS changes no longer move the page); a click back is auto again', () => {
    const p = page('light');
    p.run();
    p.wire();
    p.btn.click(); // light OS -> dark: pinned
    expect(p.win.localStorage.getItem('starlight-theme')).toBe('dark');
    p.flipOs('dark');
    p.flipOs('light');
    expect(p.root.dataset['theme']).toBe('dark');
    p.btn.click(); // dark -> light, the OS value: auto
    expect(p.win.localStorage.getItem('starlight-theme')).toBe('auto');
    p.flipOs('dark');
    expect(p.root.dataset['theme']).toBe('dark'); // following the OS again
  });

  it('D-132 D-133: an old vitepress pin holds against OS changes until the visitor clicks', () => {
    const p = page('light', { 'vitepress-theme-appearance': 'dark' });
    p.run();
    p.wire();
    p.flipOs('dark');
    p.flipOs('light');
    expect(p.root.dataset['theme']).toBe('dark');
    p.btn.click(); // dark -> light, the OS value
    expect(p.win.localStorage.getItem('starlight-theme')).toBe('auto');
  });

  it('D-133: blocked storage (the localStorage getter throws) does not break an OS change or a click', () => {
    const p = page('light');
    p.run();
    p.wire();
    Object.defineProperty(p.win, 'localStorage', {
      get() {
        throw new p.win.DOMException('blocked', 'SecurityError');
      },
    });
    expect(() => p.flipOs('dark')).not.toThrow();
    expect(p.root.dataset['theme']).toBe('dark'); // nothing readable is pinned: it follows the OS
    expect(() => p.btn.click()).not.toThrow();
    expect(p.root.dataset['theme']).toBe('light');
  });

  it('D-133: without matchMedia a click pins the choice (nothing to compare with the OS)', () => {
    const p = page('light');
    // @ts-expect-error simulate an environment without matchMedia
    p.win.matchMedia = undefined;
    p.run = () => {};
    p.root.dataset['theme'] = 'light';
    p.wire();
    p.btn.click();
    expect(p.win.localStorage.getItem('starlight-theme')).toBe('dark');
  });
});
