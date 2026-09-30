// @vitest-environment jsdom
// CommandBar behaviour (command-bar.mjs) under a DOM: `apply` (one choice shown), `host` (OS from
// the browser), the PRE_PAINT script, and `install` (a pick moves the copy machine; a copy is
// announced). Markup mirrors CommandBar.astro's SSR, which ui-command-bar.test.ts checks; the
// copy is the real clipboard.zag.mjs, so a pick is proven to change what reaches the clipboard.
import { runInNewContext, Script } from 'node:vm';
import * as clipboard from '@zag-js/clipboard';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as copyModule from '../src/components/clipboard.zag.mjs';
import { PRE_PAINT, apply, host, install } from '../src/components/ui/command-bar.mjs';
import { ssrApi, ssrAttrs } from '../src/components/ui/zag-runtime.mjs';
import { mount } from '../src/components/ui/zag.mjs';
import type { ZagModule } from '../src/components/ui/zag.mjs';

const CHOICES = [
  { value: 'linux', label: 'Linux', command: 'curl -fsSL https://setup.ocx.sh/sh | sh' },
  { value: 'macos', label: 'macOS', command: 'curl -fsSL https://setup.ocx.sh/sh | sh' },
  { value: 'windows', label: 'Windows', command: 'irm https://setup.ocx.sh/pwsh | iex' },
];
const NOUN = 'install command';
const icon = (name: string) => `<svg data-icon="${name}"></svg>`;
const until = async (ok: () => boolean, ms = 2000) => {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 10));
  }
};
const attrs = (a: Record<string, unknown>) =>
  Object.entries(ssrAttrs(a))
    .map(([k, v]) => (v === true ? k : `${k}="${v.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"`))
    .join(' ');

/** The bar as CommandBar.astro renders it for `CHOICES` (a bare stand-in for the picker's Select). */
function place({ detect = false }: { detect?: boolean } = {}) {
  const first = CHOICES[0]!;
  const props = { timeout: 1500, defaultValue: first.command };
  const api = ssrApi(clipboard.machine, clipboard.connect, { ...props, id: 'cb1' });
  const label = `${first.label} ${NOUN}`;
  const trigger = { ...api.getTriggerProps(), 'aria-label': `Copy ${label}` };
  document.body.innerHTML = `<div class="ocx-cmdbar" data-noun="${NOUN}" data-picker-icon data-picker-label="Platform" data-choices='${JSON.stringify(CHOICES)}'>
    <div class="ocx-cmdbar__picker" title="Platform: ${first.label}">
      <div class="ocx-ui-select" data-zag-root="select" id="pick">
        <label>Platform: ${first.label}</label>
        <span class="ocx-ui-select__glyph" data-value="${first.value}">${icon(first.value)}</span>
        <span data-part="value-text">${first.label}</span>
        <select>${CHOICES.map((c, i) => `<option value="${c.value}" data-icon="${icon(c.value).replaceAll('"', '&quot;')}"${i ? '' : ' selected'}>${c.label}</option>`).join('')}</select>
      </div>
    </div>
    <div class="ocx-cmdbar__copy" ${attrs({ ...api.getRootProps(), 'data-zag-root': 'clipboard', 'data-zag-state': 'idle', 'data-zag-id': 'cb1', 'data-zag-props': JSON.stringify(props), 'data-label': label })}>
      <div class="ocx-cmdbar__field"><button class="ocx-cmdbar__trigger" ${attrs(trigger)}><code class="ocx-cmdbar__text">${first.command}</code>${detect ? '<script id="pre"></script>' : ''}</button></div>
      <span class="ocx-cmdbar__status" role="status"></span>
    </div></div>`;
  const q = <T extends Element>(sel: string) => document.querySelector<T>(sel)!;
  return {
    bar: q<HTMLElement>('.ocx-cmdbar'),
    root: q<HTMLElement>('[data-zag-root="clipboard"]'),
    trigger: q<HTMLButtonElement>('.ocx-cmdbar__trigger'),
    text: q('.ocx-cmdbar__text'),
    status: q('.ocx-cmdbar__status'),
    select: q<HTMLSelectElement>('select'),
    picker: q<HTMLElement>('#pick'),
  };
}
const pick = (picker: HTMLElement, value: string) =>
  picker.dispatchEvent(new CustomEvent('ocx:select:change', { detail: { value }, bubbles: true }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('host()', () => {
  it.each([
    ['userAgentData Windows', { userAgentData: { platform: 'Windows' } }, 'windows'],
    ['userAgentData macOS', { userAgentData: { platform: 'macOS' } }, 'macos'],
    ['userAgentData Linux', { userAgentData: { platform: 'Linux' } }, 'linux'],
    ['platform Win32', { platform: 'Win32' }, 'windows'],
    ['platform MacIntel', { platform: 'MacIntel' }, 'macos'],
    ['platform Linux x86_64', { platform: 'Linux x86_64' }, 'linux'],
    ['Android is Linux', { platform: 'Linux armv81' }, 'linux'],
    ['userAgentData wins over platform', { userAgentData: { platform: 'Windows' }, platform: 'Linux' }, 'windows'],
    ['falls back to the user agent', { userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' }, 'linux'],
    ['empty userAgentData.platform falls through', { userAgentData: { platform: '' }, platform: 'MacIntel' }, 'macos'],
    ['unknown', { platform: 'PlayStation' }, undefined],
    ['nothing', {}, undefined],
  ])('%s', (_, nav, expected) => {
    expect(host(nav)).toBe(expected);
  });
});

describe('apply()', () => {
  it('shows the choice: text, copy name, accessible name, start value, picker text, glyph, name and tooltip', () => {
    const { bar, root, trigger, text, select, picker } = place();
    expect(apply(bar, 'windows')).toBe('irm https://setup.ocx.sh/pwsh | iex');
    expect(text.textContent).toBe('irm https://setup.ocx.sh/pwsh | iex');
    expect(root.dataset['label']).toBe('Windows install command');
    expect(trigger.getAttribute('aria-label')).toBe('Copy Windows install command');
    expect(JSON.parse(root.dataset['zagProps']!)).toEqual({
      timeout: 1500,
      defaultValue: 'irm https://setup.ocx.sh/pwsh | iex',
    });
    expect(select.value).toBe('windows');
    expect(picker.querySelector('[data-part="value-text"]')?.textContent).toBe('Windows');
    expect(document.querySelector('.ocx-ui-select__glyph svg')?.getAttribute('data-icon')).toBe('windows');
    expect(document.querySelector<HTMLElement>('.ocx-ui-select__glyph')?.dataset['value']).toBe('windows');
    // Icon-only picker: the name (the hidden label) and the tooltip carry the choice.
    expect(picker.querySelector('label')?.textContent).toBe('Platform: Windows');
    expect(document.querySelector('.ocx-cmdbar__picker')?.getAttribute('title')).toBe('Platform: Windows');
  });

  it('is idempotent and reversible', () => {
    const { bar, text, trigger } = place();
    apply(bar, 'windows');
    apply(bar, 'windows');
    apply(bar, 'linux');
    expect(text.textContent).toBe(CHOICES[0]!.command);
    expect(trigger.getAttribute('aria-label')).toBe('Copy Linux install command');
  });

  it('an unknown value changes nothing and returns undefined', () => {
    const { bar, text, root } = place();
    const before = document.body.innerHTML;
    expect(apply(bar, 'freebsd')).toBeUndefined();
    expect(document.body.innerHTML).toBe(before);
    expect(text.textContent).toBe(CHOICES[0]!.command);
    expect(root.dataset['label']).toBe('Linux install command');
  });
});

describe('PRE_PAINT (inline script, runs before the module)', () => {
  /** Runs the shipped source as the browser would: `document.currentScript` is the script inside the bar. */
  const run = (nav: object) => {
    const script = document.getElementById('pre')!;
    runInNewContext(PRE_PAINT, { document: { currentScript: script }, navigator: nav });
  };

  it('is self-contained source: no import, no module syntax, evaluates on its own', () => {
    expect(PRE_PAINT).not.toMatch(/\bimport\b|\bexport\b|__name/);
    expect(() => new Script(PRE_PAINT)).not.toThrow();
  });

  it("swaps to the visitor's platform, with the same result as apply()", () => {
    const { bar, text, trigger, root } = place({ detect: true });
    run({ userAgentData: { platform: 'Windows' } });
    const after = document.body.innerHTML;
    expect(text.textContent).toBe('irm https://setup.ocx.sh/pwsh | iex');
    expect(trigger.getAttribute('aria-label')).toBe('Copy Windows install command');
    expect((JSON.parse(root.dataset['zagProps']!) as { defaultValue: string }).defaultValue).toBe(
      'irm https://setup.ocx.sh/pwsh | iex',
    );
    place({ detect: true });
    apply(document.querySelector<HTMLElement>('.ocx-cmdbar')!, 'windows');
    expect(document.body.innerHTML).toBe(after);
    expect(bar).toBeTruthy();
  });

  it('leaves the first choice for an unknown platform, or one the bar does not offer', () => {
    const { text } = place({ detect: true });
    run({ platform: 'PlayStation' });
    expect(text.textContent).toBe(CHOICES[0]!.command);
    document.querySelector('.ocx-cmdbar')!.setAttribute('data-choices', JSON.stringify(CHOICES.slice(0, 2)));
    run({ platform: 'Win32' });
    expect(text.textContent).toBe(CHOICES[0]!.command);
  });

  it('never throws (a bar that is not there, a navigator that lies)', () => {
    place({ detect: true });
    const script = document.getElementById('pre')!;
    expect(
      () => void runInNewContext(PRE_PAINT, { document: { currentScript: script }, navigator: null }),
    ).not.toThrow();
    expect(
      () => void runInNewContext(PRE_PAINT, { document: { currentScript: { closest: () => null } }, navigator: {} }),
    ).not.toThrow();
  });
});

describe('install(): pick and copy', () => {
  const writeText = () => {
    const fn = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText: fn } });
    return fn;
  };
  /** Wires the bar, then starts its copy machine on the real clipboard module. */
  async function live() {
    const parts = place();
    install(document);
    const handle = mount(parts.root, { load: () => Promise.resolve(copyModule as unknown as ZagModule) });
    await handle.start();
    return { ...parts, handle };
  }

  it('a copy writes the shown command, toasts its name, and is announced in the status', async () => {
    const write = writeText();
    const toasts: unknown[] = [];
    document.addEventListener('ocx:toast', (e) => toasts.push((e as CustomEvent).detail));
    const { trigger, status } = await live();
    trigger.click();
    await until(() => toasts.length > 0);
    expect(write).toHaveBeenCalledWith(CHOICES[0]!.command);
    expect(toasts).toEqual([{ title: 'Copied Linux install command' }]);
    expect(status.textContent).toBe('Copied Linux install command');
    expect(trigger.hasAttribute('data-copied')).toBe(true);
  });

  it('a pick on a live machine changes what is copied, and how it is named', async () => {
    const write = writeText();
    const toasts: { title: string }[] = [];
    document.addEventListener('ocx:toast', (e) => toasts.push((e as CustomEvent<{ title: string }>).detail));
    const { trigger, picker, text, status } = await live();
    pick(picker, 'windows');
    expect(text.textContent).toBe('irm https://setup.ocx.sh/pwsh | iex');
    // The machine settles the new value on a later tick; a person cannot click within it.
    await new Promise((r) => setTimeout(r, 0));
    trigger.click();
    await until(() => toasts.length > 0);
    expect(write).toHaveBeenCalledWith('irm https://setup.ocx.sh/pwsh | iex');
    expect(toasts[0]?.title).toBe('Copied Windows install command');
    expect(status.textContent).toBe('Copied Windows install command');
  });

  it('a pick before the machine starts is what it starts with', async () => {
    const write = writeText();
    const toasts: unknown[] = [];
    document.addEventListener('ocx:toast', (e) => toasts.push(e));
    const { root, trigger, picker } = place();
    install(document);
    pick(picker, 'windows');
    const handle = mount(root, { load: () => Promise.resolve(copyModule as unknown as ZagModule) });
    await handle.start();
    trigger.click();
    await until(() => toasts.length > 0);
    expect(write).toHaveBeenCalledWith('irm https://setup.ocx.sh/pwsh | iex');
  });

  it('a pick, then the first click (it starts the machine and is replayed), copies the pick', async () => {
    const write = writeText();
    const toasts: unknown[] = [];
    document.addEventListener('ocx:toast', (e) => toasts.push(e));
    const { root, trigger, picker } = place();
    install(document); // mounts on first interaction, loading the real clipboard module
    pick(picker, 'windows');
    root.dispatchEvent(new Event('pointerenter'));
    trigger.click();
    expect(root.dataset['zagState']).toBe('loading');
    await until(() => toasts.length > 0);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith('irm https://setup.ocx.sh/pwsh | iex');
  });

  it('a refused write is announced as a failure, with no copied state', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn(() => Promise.reject(new Error('denied'))) } });
    const { trigger, status } = await live();
    trigger.click();
    await until(() => status.textContent === 'Copy failed');
    expect(trigger.hasAttribute('data-copied')).toBe(false);
  });

  it('the status clears after 2 s', async () => {
    writeText();
    const { trigger, status } = await live();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    trigger.click();
    await vi.waitFor(() => expect(status.textContent).toBe('Copied Linux install command'));
    vi.advanceTimersByTime(2000);
    expect(status.textContent).toBe('');
  });

  it('a select change that is not one of the bar choices is ignored', async () => {
    writeText();
    const { picker, text } = await live();
    pick(picker, 'nope');
    expect(text.textContent).toBe(CHOICES[0]!.command);
  });

  it('a bar with no field (action only) is skipped without error', () => {
    document.body.innerHTML = '<div class="ocx-cmdbar"><div class="ocx-cmdbar__action"><a href="#x">x</a></div></div>';
    expect(() => install(document)).not.toThrow();
  });
});
