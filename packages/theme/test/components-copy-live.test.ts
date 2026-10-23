// @vitest-environment jsdom
// Z7 clipboard + toast under a DOM: C-180 CopyButton behaviour (copy, copied state, failure toast),
// C-181 toaster (title, tone, max 3, dismiss, duration, destroy), toast() dispatch, and the
// `spawn` child machines of ui/zag.mjs. Markup mirrors the wrappers' SSR, which
// components-copy.test.ts checks against connect().
import * as clipboard from '@zag-js/clipboard';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as copyModule from '../src/components/clipboard.zag.mjs';
import { copiedTitle, toast } from '../src/components/toast.mjs';
import { ssrApi, ssrAttrs } from '../src/components/ui/zag-runtime.mjs';
import { mount } from '../src/components/ui/zag.mjs';
import type { ZagModule } from '../src/components/ui/zag.mjs';

type Detail = { title: string; tone?: string; duration?: number; slot?: string; persistent?: boolean };
// Time is driven, not waited for: once a toaster is live (liveToaster) the clock is fake and
// `until` steps it 10 ms at a time, so a loaded host cannot race a wall-clock budget. Before that
// (module imports, a bare document) real timers still apply.
const tick = () => (vi.isFakeTimers() ? vi.advanceTimersByTimeAsync(0) : new Promise((r) => setTimeout(r, 0)));
const until = async (ok: () => boolean, ms = 2000) => {
  for (let t = 0; !ok(); t += 10) {
    if (t > ms) throw new Error('timed out');
    await (vi.isFakeTimers() ? vi.advanceTimersByTimeAsync(10) : new Promise((r) => setTimeout(r, 10)));
  }
};
const attrs = (a: Record<string, unknown>) =>
  Object.entries(ssrAttrs(a))
    .map(([k, v]) => (v === true ? k : `${k}="${v.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"`))
    .join(' ');

/** Every `ocx:*` event that reaches the document. */
function recordEvents() {
  const seen: { type: string; detail: unknown }[] = [];
  const on = (e: Event) => seen.push({ type: e.type, detail: (e as CustomEvent).detail });
  for (const type of ['ocx:toast', 'ocx:clipboard:copy', 'ocx:clipboard:error']) document.addEventListener(type, on);
  return seen;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('toast() request', () => {
  it('dispatches a bubbling ocx:toast with the detail', () => {
    document.body.innerHTML = '<p><span></span></p>';
    const seen = recordEvents();
    toast(document.querySelector('span')!, { title: 'Copied x', tone: 'danger' });
    expect(seen).toEqual([{ type: 'ocx:toast', detail: { title: 'Copied x', tone: 'danger' } }]);
  });
});

/** A live CopyButton: the wrapper's markup, mounted on the real clipboard module. */
async function liveCopy({ value, label }: { value: string; label?: string }) {
  const props = { timeout: 1500, value };
  const api = ssrApi(clipboard.machine, clipboard.connect, { ...props, id: 'c1' });
  document.body.innerHTML = `<div ${attrs({ ...api.getRootProps(), 'data-zag-root': 'clipboard', 'data-zag-state': 'idle', 'data-zag-id': 'c1', 'data-zag-props': JSON.stringify(props), 'data-label': label })}>
    <button ${attrs(api.getTriggerProps())}><span ${attrs(api.getIndicatorProps({ copied: false }))}>copy</span><span ${attrs(api.getIndicatorProps({ copied: true }))}>copied</span></button></div>`;
  const root = document.querySelector<HTMLElement>('[data-zag-root]')!;
  const handle = mount(root, { load: () => Promise.resolve(copyModule as unknown as ZagModule) });
  await handle.start();
  return { root, trigger: root.querySelector<HTMLButtonElement>('[data-part="trigger"]')!, handle };
}

describe('C-180 CopyButton behaviour', () => {
  it('D-131 D-143 copies the value, shows copied, then asks for "Copied — <label>" for 2 s', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const seen = recordEvents();
    const { root, trigger } = await liveCopy({ value: 'ocx add uv', label: 'install command' });
    trigger.click();
    await until(() => seen.some((e) => e.type === 'ocx:toast'));
    expect(writeText).toHaveBeenCalledWith('ocx add uv');
    expect(seen).toEqual([
      { type: 'ocx:clipboard:copy', detail: { value: 'ocx add uv' } },
      { type: 'ocx:toast', detail: { title: 'Copied — install command', duration: 2000, slot: 'copy' } },
    ]);
    expect(root.hasAttribute('data-copied')).toBe(true);
    expect(trigger.hasAttribute('data-copied')).toBe(true);
    expect(trigger.getAttribute('aria-label')).toBe('Copied install command');
  });

  it('without a label the toast names the value, cut to 40 characters', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: () => Promise.resolve() } });
    const seen = recordEvents();
    const value = 'curl -fsSL https://setup.ocx.sh/sh | sh -s -- --no-modify-path';
    const { trigger } = await liveCopy({ value });
    trigger.click();
    await until(() => seen.some((e) => e.type === 'ocx:toast'));
    expect(seen.at(-1)).toEqual({
      type: 'ocx:toast',
      detail: { title: copiedTitle(value), duration: 2000, slot: 'copy' },
    });
  });

  it.each([
    ['a denied write', () => ({ clipboard: { writeText: () => Promise.reject(new DOMException('denied')) } })],
    ['no clipboard API (insecure context)', () => ({})],
    [
      'a throwing writeText',
      () => ({
        clipboard: {
          writeText: () => {
            throw new TypeError('boom');
          },
        },
      }),
    ],
  ])('D-084 %s → "Copy failed" danger toast, no copied state, nothing uncaught', async (_, nav) => {
    vi.stubGlobal('navigator', nav());
    const errors: unknown[] = [];
    const onError = (e: unknown) => errors.push(e);
    process.on('unhandledRejection', onError);
    const seen = recordEvents();
    try {
      const { root, trigger } = await liveCopy({ value: 'v' });
      trigger.click();
      await until(() => seen.some((e) => e.type === 'ocx:toast'));
      await tick();
      expect(seen).toEqual([
        { type: 'ocx:clipboard:error', detail: { value: 'v' } },
        { type: 'ocx:toast', detail: { title: 'Copy failed', tone: 'danger', slot: 'copy' } },
      ]);
      expect(root.hasAttribute('data-copied')).toBe(false);
      expect(errors).toEqual([]);
    } finally {
      process.off('unhandledRejection', onError);
    }
  });
});

/** A live toaster: the Footer's region, started manually as the Footer script does. */
async function liveToaster() {
  // The Footer's SSR root (components-copy.test.ts checks it).
  document.body.innerHTML = `<div data-zag-root="toast" data-zag-state="idle" data-zag-trigger="manual" data-zag-id="ocx-toaster" data-zag-props="{}" aria-live="polite"></div>`;
  const root = document.querySelector<HTMLElement>('[data-zag-root="toast"]')!;
  // A fresh module per test: its store is page-wide state, as on a real page.
  vi.resetModules();
  const mod = (await import('../src/components/toast.zag.mjs')) as unknown as ZagModule;
  const handle = mount(root, { load: () => Promise.resolve(mod), trigger: 'manual', replay: false });
  await handle.start();
  vi.useFakeTimers(); // after the real async imports: from here the toaster's clock is ours
  const api = handle.api as { show: (d: Detail) => void };
  return { root, handle, show: (d: Detail) => api.show(d) };
}
const toasts = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('[data-part="root"]')];

describe('C-181 toaster behaviour', () => {
  it('installToaster ignores an ocx:toast without a string title: nothing mounts', async () => {
    // A document of its own: installToaster's listeners outlive the test.
    const doc = document.implementation.createHTMLDocument();
    doc.body.innerHTML = `<div data-zag-root="toast" data-zag-state="idle" data-zag-id="ocx-toaster" data-zag-props="{}"></div>`;
    const root = doc.querySelector<HTMLElement>('[data-zag-root="toast"]')!;
    const { installToaster } = await import('../src/starlight/toaster.mjs');
    installToaster(doc);
    for (const detail of [undefined, null, {}, { title: 42 }])
      doc.dispatchEvent(new CustomEvent('ocx:toast', { detail, bubbles: true }));
    await tick();
    expect(root.dataset.zagState).toBe('idle');
  });

  it('shows a toast with its title, a success icon and a close button, bottom-right', async () => {
    const { root, show } = await liveToaster();
    show({ title: 'Copied ocx add uv' });
    await until(() => toasts(root).length === 1);
    const [el] = toasts(root);
    expect(el?.querySelector('[data-part="title"]')?.textContent).toBe('Copied ocx add uv');
    expect(el?.dataset.type).toBe('success');
    expect(el?.dataset.placement).toBe('bottom-end');
    expect(el?.querySelector('[data-part="close-trigger"]')?.getAttribute('aria-label')).toBe('Dismiss notification');
    expect(root.dataset.placement).toBe('bottom-end');
    expect(root.style.position).toBe('fixed');
    // The group part's attributes arrive on start (C-130a subset at SSR).
    expect(root.getAttribute('role')).toBe('region');
    expect(root.getAttribute('aria-label')).toMatch(/^Notifications/);
    expect(root.dataset.part).toBe('group');
  });

  it('tone danger renders an error toast', async () => {
    const { root, show } = await liveToaster();
    show({ title: 'Copy failed', tone: 'danger' });
    await until(() => toasts(root).length === 1);
    expect(toasts(root)[0]?.dataset.type).toBe('error');
  });

  it('keeps at most 3 visible; a fourth waits in the queue', async () => {
    const { root, show } = await liveToaster();
    for (const n of [1, 2, 3, 4]) show({ title: `t${n}` });
    await until(() => toasts(root).length === 3);
    await tick();
    expect(toasts(root)).toHaveLength(3);
  });

  it('the close button dismisses the toast and removes its markup', async () => {
    const { root, show } = await liveToaster();
    show({ title: 'bye' });
    await until(() => toasts(root).length === 1);
    toasts(root)[0]!.querySelector<HTMLButtonElement>('[data-part="close-trigger"]')!.click();
    await until(() => toasts(root).length === 0, 1000); // removeDelay
  });

  it('dismisses itself after the 2.5 s duration', async () => {
    const { root, show } = await liveToaster();
    show({ title: 'soon gone' });
    await until(() => toasts(root).length === 1);
    await vi.advanceTimersByTimeAsync(2400);
    expect(toasts(root)).toHaveLength(1); // still there just before the duration
    await until(() => toasts(root).length === 0, 1000); // gone once 2.5 s and the removeDelay passed
  });

  it('destroy() stops every child machine and leaves no toast listeners behind', async () => {
    const { root, handle, show } = await liveToaster();
    show({ title: 'a' });
    show({ title: 'b' });
    await until(() => toasts(root).length === 2);
    const close = toasts(root)[0]!.querySelector<HTMLButtonElement>('[data-part="close-trigger"]')!;
    handle.destroy();
    close.click(); // listener removed by the child's spread cleanup: nothing is dismissed
    await vi.advanceTimersByTimeAsync(400); // past removeDelay: a live child would be gone
    expect(root.dataset.zagState).toBe('idle');
    expect(toasts(root)).toHaveLength(2);
    expect(close.getAttribute('aria-label')).toBe('Dismiss notification');
  });
});

describe('D-143 D-166 one copy toast, a re-copy restarts the window', () => {
  const titles = (root: HTMLElement) =>
    toasts(root)
      .filter((el) => el.dataset.state !== 'closed')
      .map((el) => el.querySelector('[data-part="title"]')?.textContent);

  it('D-143 a copy toast with a slot replaces the one showing in that slot, others stack', async () => {
    const { root, show } = await liveToaster();
    show({ title: 'Copied — identifier', duration: 2000, slot: 'copy' });
    await until(() => toasts(root).length === 1);
    show({ title: 'Something else' });
    show({ title: 'Copied — tag', duration: 2000, slot: 'copy' });
    await until(() => titles(root).includes('Copied — tag'));
    await until(() => !titles(root).includes('Copied — identifier'), 1000);
    expect(titles(root)).toHaveLength(2);
    expect(titles(root)).toEqual(expect.arrayContaining(['Copied — tag', 'Something else']));
  });

  it('D-143 under saturation, superseded copy toasts never surface later: the newest per slot enters', async () => {
    const { root, show } = await liveToaster();
    show({ title: 'other 1', persistent: true });
    show({ title: 'other 2', persistent: true });
    show({ title: 'Copied — one', duration: 2000, slot: 'copy' });
    await until(() => toasts(root).length === 3);
    show({ title: 'Copied — two', duration: 2000, slot: 'copy' });
    show({ title: 'Copied — three', duration: 2000, slot: 'copy' });
    const seen = new Set<string>();
    for (let t = 0; t < 4000; t += 10) {
      titles(root).forEach((title) => seen.add(String(title)));
      await vi.advanceTimersByTimeAsync(10);
    }
    expect(seen).toContain('Copied — three');
    expect(seen).not.toContain('Copied — two');
    expect(seen).toContain('other 1');
  });

  it('D-143 a copy toast lasts 2 s, not the default 2.5 s', async () => {
    const { root, show } = await liveToaster();
    show({ title: 'Copied — code block', duration: 2000, slot: 'copy' });
    await until(() => toasts(root).length === 1);
    await vi.advanceTimersByTimeAsync(1900);
    expect(toasts(root)).toHaveLength(1);
    await until(() => toasts(root).length === 0, 600); // 2 s, then the 200 ms exit
  });

  it('D-166 a second copy 1 s into the first starts a full new window', async () => {
    const { root, show } = await liveToaster();
    show({ title: 'Copied — code block', duration: 2000, slot: 'copy' });
    await until(() => toasts(root).length === 1);
    await vi.advanceTimersByTimeAsync(1000);
    show({ title: 'Copied — code block', duration: 2000, slot: 'copy' });
    await until(() => toasts(root).length === 1, 1000); // the first one has left
    await vi.advanceTimersByTimeAsync(1800); // 2.8 s after the first copy: its own window is long over
    expect(titles(root)).toEqual(['Copied — code block']);
    await until(() => toasts(root).length === 0, 800);
  });
});

describe('D-166 CopyButton: a re-copy restarts the copied window', () => {
  it('D-166 a second copy within 1500 ms keeps it copied for a full new window', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: () => Promise.resolve() } });
    const { root, trigger } = await liveCopy({ value: 'v' });
    vi.useFakeTimers();
    trigger.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(root.hasAttribute('data-copied')).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    trigger.click();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000); // 2000 ms: the first window (1500) is over
    expect(root.hasAttribute('data-copied')).toBe(true);
    await vi.advanceTimersByTimeAsync(600); // 2600 ms: past the second window (1000 + 1500)
    expect(root.hasAttribute('data-copied')).toBe(false);
  });

  it('D-166 the default window is 1500 ms', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: () => Promise.resolve() } });
    const { root, trigger } = await liveCopy({ value: 'v' });
    vi.useFakeTimers();
    trigger.click();
    await vi.advanceTimersByTimeAsync(1400);
    expect(root.hasAttribute('data-copied')).toBe(true);
    await vi.advanceTimersByTimeAsync(200);
    expect(root.hasAttribute('data-copied')).toBe(false);
  });
});
