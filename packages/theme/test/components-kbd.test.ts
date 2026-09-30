// Kbd (owner ask 2026-09-28): SSR of every OS variant (no host-dependent render), the Mod
// mapping, and a forced `platform` prop. Container API + JSDOM, as components-avatar.test.ts.
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
// @ts-expect-error jsdom ships no types and @types/jsdom is not a dependency
import * as jsdom from 'jsdom';
import { beforeAll, describe, expect, it } from 'vitest';

type Component = Parameters<AstroContainer['renderToString']>[0];
const { JSDOM } = jsdom as { JSDOM: new (html: string) => { window: Window } };
const Kbd = ((await import(`../src/components/ui/${'Kbd'}.astro`)) as { default: Component }).default;

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});
const render = async (props: Record<string, unknown> = {}, slots?: Record<string, string>) =>
  new JSDOM(await container.renderToString(Kbd, { props, ...(slots ? { slots } : {}) })).window.document;

// The glyph is aria-hidden; the accessible name is a visually-hidden text span.
const glyph = (el: Element | null | undefined) => el?.querySelector('[aria-hidden="true"]')?.textContent;
const label = (el: Element | null | undefined) => el?.querySelector('.ocx-kbd-label')?.textContent;

describe('Kbd SSR', () => {
  it('a single key via the default slot renders one <kbd>', async () => {
    const doc = await render({}, { default: 'K' });
    const keys = doc.querySelectorAll('kbd.ocx-kbd-key');
    expect(keys.length).toBe(1);
    expect(keys[0]?.textContent?.trim()).toBe('K');
  });

  it('`keys` splits on "+" into one <kbd> per key with a separator between', async () => {
    const doc = await render({ keys: 'Mod+Shift+K' });
    expect(doc.querySelectorAll('kbd.ocx-kbd-key').length).toBe(3);
    expect(doc.querySelectorAll('.ocx-kbd-sep').length).toBe(2);
    expect(doc.querySelectorAll('.ocx-kbd-sep')[0]?.getAttribute('aria-hidden')).toBe('true');
    // The plain, non-adaptive key renders as-is, no OS variants.
    const last = doc.querySelectorAll('kbd.ocx-kbd-key')[2];
    expect(last?.querySelector('[data-os]')).toBeNull();
    expect(last?.textContent?.trim()).toBe('K');
  });

  it('Mod renders all three OS variants server-side: Cmd (mac), Ctrl (windows/linux)', async () => {
    const doc = await render({ keys: 'Mod' });
    const kbd = doc.querySelector('kbd.ocx-kbd-key');
    const mac = kbd?.querySelector('[data-os="mac"]');
    const windows = kbd?.querySelector('[data-os="windows"]');
    const linux = kbd?.querySelector('[data-os="linux"]');
    expect(glyph(mac)).toBe('⌘');
    expect(label(mac)).toBe('Command');
    expect(windows?.textContent).toBe('Ctrl');
    expect(linux?.textContent).toBe('Ctrl');
  });

  it('Super/Cmd/Meta/Win are aliases for the same adaptive key', async () => {
    for (const alias of ['Super', 'Cmd', 'Meta', 'Win']) {
      const doc = await render({ keys: alias });
      const windows = doc.querySelector('[data-os="windows"]');
      expect(glyph(windows), alias).toBe('⊞');
      expect(label(windows), alias).toBe('Windows');
    }
  });

  it('Alt/Option render ⌥ Option on mac, "Alt" elsewhere', async () => {
    for (const alias of ['Alt', 'Option']) {
      const doc = await render({ keys: alias });
      const mac = doc.querySelector('[data-os="mac"]');
      expect(glyph(mac), alias).toBe('⌥');
      expect(label(mac), alias).toBe('Option');
      expect(doc.querySelector('[data-os="linux"]')?.textContent, alias).toBe('Alt');
    }
  });

  it('arrow keys render a hidden glyph plus a text label with no OS variants', async () => {
    const doc = await render({ keys: 'Up+Down+Left+Right' });
    const keys = [...doc.querySelectorAll('kbd.ocx-kbd-key')];
    expect(keys.map((k) => glyph(k))).toEqual(['↑', '↓', '←', '→']);
    expect(keys.map((k) => label(k))).toEqual(['Up arrow', 'Down arrow', 'Left arrow', 'Right arrow']);
    expect(doc.querySelector('kbd.ocx-kbd-key [data-os]')).toBeNull();
  });

  it('the `platform` prop forces one variant only, no siblings', async () => {
    const doc = await render({ keys: 'Mod+Alt', platform: 'mac' });
    expect(doc.querySelector('[data-os]')).toBeNull();
    expect([...doc.querySelectorAll('kbd.ocx-kbd-key')].map((k) => glyph(k))).toEqual(['⌘', '⌥']);

    const win = await render({ keys: 'Mod+Alt', platform: 'windows' });
    expect([...win.querySelectorAll('kbd.ocx-kbd-key')].map((k) => k.textContent?.trim())).toEqual(['Ctrl', 'Alt']);
  });

  it('no aria-label remains on a role-less span', async () => {
    const doc = await render({ keys: 'Mod+Super+Alt+Up' });
    expect(doc.querySelector('[aria-label]')).toBeNull();
  });

  it('a hidden variant hides glyph and label together: data-os wraps both', async () => {
    const doc = await render({ keys: 'Mod' });
    for (const os of ['mac']) {
      const el = doc.querySelector(`[data-os="${os}"]`);
      expect(el?.querySelector('[aria-hidden="true"]')).not.toBeNull();
      expect(el?.querySelector('.ocx-kbd-label')).not.toBeNull();
    }
  });

  it('extra class lands on the group root', async () => {
    const doc = await render({ keys: 'K', class: 'extra' });
    expect(doc.querySelector('.ocx-kbd-group')?.classList.contains('extra')).toBe(true);
  });
});
