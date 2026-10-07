// @vitest-environment jsdom
// D-Z12/C-181 toast made a first-class component: the public `toast()` helper (toast.mjs, the
// title/options form — the legacy `toast(target, detail)` form is covered by
// components-copy-live.test.ts) and the richer `ocx:toast` contract it dispatches (description,
// tone, duration, persistent, action, id) as toast.zag.mjs's `show`/`dismiss` and `render` handle it.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toast } from '../src/components/toast.mjs';
import { ICONS } from '../src/icons/icons.mjs';
import { mount } from '../src/components/ui/zag.mjs';
import type { ZagModule } from '../src/components/ui/zag.mjs';

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

function recordEvents(types: string[]) {
  const seen: { type: string; detail: unknown }[] = [];
  const on = (e: Event) => seen.push({ type: e.type, detail: (e as CustomEvent).detail });
  for (const type of types) document.addEventListener(type, on);
  return seen;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('toast(title, options) public API', () => {
  it('dispatches ocx:toast on document with a generated id', () => {
    const seen = recordEvents(['ocx:toast']);
    const id = toast('Saved');
    expect(id).toMatch(/^ocx-toast-/);
    expect(seen).toEqual([{ type: 'ocx:toast', detail: { title: 'Saved', id } }]);
  });

  it('merges options and keeps a given id', () => {
    const seen = recordEvents(['ocx:toast']);
    const id = toast('Uh oh', { tone: 'error', description: 'try again', id: 'fixed-1' });
    expect(id).toBe('fixed-1');
    expect(seen).toEqual([
      { type: 'ocx:toast', detail: { title: 'Uh oh', tone: 'error', description: 'try again', id: 'fixed-1' } },
    ]);
  });

  it('dispatches from a given target so it bubbles through a container too', () => {
    document.body.innerHTML = '<div id="demo"><button></button></div>';
    const button = document.querySelector('button')!;
    const seenOnDiv: Event[] = [];
    document.querySelector('#demo')!.addEventListener('ocx:toast', (e) => seenOnDiv.push(e));
    toast('Saved', {}, button);
    expect(seenOnDiv).toHaveLength(1);
  });

  it('toast.dismiss dispatches ocx:toast:dismiss with the id', () => {
    const seen = recordEvents(['ocx:toast:dismiss']);
    toast.dismiss('abc');
    expect(seen).toEqual([{ type: 'ocx:toast:dismiss', detail: { id: 'abc' } }]);
  });

  it('toast.dismiss with no id dismisses every toast', () => {
    const seen = recordEvents(['ocx:toast:dismiss']);
    toast.dismiss();
    expect(seen).toEqual([{ type: 'ocx:toast:dismiss', detail: { id: undefined } }]);
  });
});

describe('toast.promise', () => {
  it('shows a persistent loading toast, then updates it to success in place', async () => {
    const seen = recordEvents(['ocx:toast']);
    let resolve!: (v: string) => void;
    const p = new Promise<string>((r) => (resolve = r));
    const done = toast.promise(p, { loading: 'Saving…', success: (v) => `Saved ${v}`, error: 'Failed' });
    resolve('x');
    await done;
    expect(seen).toHaveLength(2);
    const [loading, success] = seen;
    expect(loading!.detail).toMatchObject({ title: 'Saving…', tone: 'loading', persistent: true });
    expect(success!.detail).toMatchObject({ title: 'Saved x', tone: 'success' });
    expect(success!.detail).toMatchObject({ id: (loading!.detail as { id: string }).id });
  });

  it('updates the same toast to error and rethrows', async () => {
    const seen = recordEvents(['ocx:toast']);
    const err = new Error('boom');
    await expect(
      toast.promise(Promise.reject(err), {
        loading: 'Saving…',
        success: 'ok',
        error: (e) => `Failed: ${(e as Error).message}`,
      }),
    ).rejects.toBe(err);
    const [loading, failure] = seen;
    expect(failure!.detail).toMatchObject({
      title: 'Failed: boom',
      tone: 'error',
      id: (loading!.detail as { id: string }).id,
    });
  });
});

/** A live toaster, mounted manually as the Footer script does. */
async function liveToaster() {
  document.body.innerHTML = `<div data-zag-root="toast" data-zag-state="idle" data-zag-trigger="manual" data-zag-id="ocx-toaster" data-zag-props="{}" aria-live="polite"></div>`;
  const root = document.querySelector<HTMLElement>('[data-zag-root="toast"]')!;
  vi.resetModules();
  const mod = (await import('../src/components/toast.zag.mjs')) as unknown as ZagModule;
  const handle = mount(root, { load: () => Promise.resolve(mod), trigger: 'manual', replay: false });
  await handle.start();
  vi.useFakeTimers(); // after the real async imports: from here the toaster's clock is ours
  const api = handle.api as {
    show: (d: Parameters<typeof toast>[1] & { title: string; id?: string }) => void;
    dismiss: (id?: string) => void;
  };
  return { root, handle, api };
}
/** A registry body as the DOM serialises it (jsdom rewrites self-closing tags). */
const parsed = (body: string) => {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  el.innerHTML = body;
  return el.innerHTML;
};
const toasts = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('[data-part="root"]')];
/** Each showing toast's resolved duration, as the store holds it. */
const durations = (api: unknown) =>
  (api as { getToasts: () => { duration?: number }[] }).getToasts().map((t) => t.duration);

describe('toast.zag.mjs show()/render(): the richer ocx:toast contract', () => {
  it.each([
    ['info', 'info'],
    ['success', 'success'],
    ['warning', 'warning'],
    ['error', 'error'],
    ['loading', 'loading'],
    ['danger', 'error'], // legacy tone, still supported
    [undefined, 'success'], // no tone at all: the pre-existing ocx:toast default
  ] as const)('tone %s → data-type %s', async (tone, type) => {
    const { root, api } = await liveToaster();
    api.show({ title: 't', ...(tone && { tone }) });
    await until(() => toasts(root).length === 1);
    expect(toasts(root)[0]?.dataset.type).toBe(type);
  });

  it.each([
    ['success', 'success'],
    ['error', 'error'],
    ['warning', 'warning'],
    ['info', 'info'],
  ] as const)('the %s icon and the close glyph are registry icons at the shared size token', async (tone, name) => {
    const { root, api } = await liveToaster();
    api.show({ title: 't', tone });
    await until(() => toasts(root).length === 1);
    const el = toasts(root)[0]!;
    const status = el.querySelector(':scope > svg')!;
    expect(status.getAttribute('class')).toBe('ocx-icon');
    expect(status.getAttribute('data-size')).toBe('md');
    expect(status.getAttribute('width')).toBeNull(); // sized by the token in toast.css, no own wrapper
    expect(status.innerHTML).toBe(parsed(ICONS[name].body));
    const close = el.querySelector('[data-part="close-trigger"] > svg')!;
    expect(close.getAttribute('class')).toBe('ocx-icon');
    expect(close.innerHTML).toBe(parsed(ICONS.close.body));
  });

  // toast.css selects `[data-scope='toast'][data-part=…]`: a part without the scope (the body is
  // ours, not Zag's) gets none of its rules, and the close button stops hugging the right edge.
  it('every part carries data-scope="toast", so toast.css reaches it', async () => {
    const { root, api } = await liveToaster();
    api.show({ title: 't' });
    await until(() => toasts(root).length === 1);
    const parts = [...toasts(root)[0]!.querySelectorAll('[data-part]')];
    expect(parts.map((p) => p.getAttribute('data-part'))).toContain('body');
    expect(parts.filter((p) => p.getAttribute('data-scope') !== 'toast')).toEqual([]);
  });

  it('renders a description, hidden when absent', async () => {
    const { root, api } = await liveToaster();
    api.show({ title: 'Saved', description: 'All changes are on disk.' });
    await until(() => toasts(root).length === 1);
    const description = toasts(root)[0]!.querySelector('[data-part="description"]')!;
    expect(description.textContent).toBe('All changes are on disk.');
    expect(description.hasAttribute('hidden')).toBe(false);
    api.show({ title: 'No description' });
    await until(() => toasts(root).length === 2);
    const other = toasts(root)[1]!.querySelector('[data-part="description"]')!;
    expect(other.hasAttribute('hidden')).toBe(true);
  });

  it('persistent: true never auto-dismisses (duration Infinity)', async () => {
    const { root, api } = await liveToaster();
    api.show({ title: 'stays', persistent: true });
    await until(() => toasts(root).length === 1);
    await vi.advanceTimersByTimeAsync(10_000); // far past the default duration
    expect(toasts(root)).toHaveLength(1);
  });

  it('an action renders its label, dispatches the named event on click, and dismisses the toast', async () => {
    const { root, api } = await liveToaster();
    const events: Event[] = [];
    document.addEventListener('demo:undo', (e) => events.push(e));
    api.show({ title: 'Deleted', action: { label: 'Undo', event: 'demo:undo' } });
    await until(() => toasts(root).length === 1);
    const trigger = toasts(root)[0]!.querySelector<HTMLButtonElement>('[data-part="action-trigger"]')!;
    expect(trigger.hidden).toBe(false);
    expect(trigger.textContent).toBe('Undo');
    trigger.click();
    expect(events).toHaveLength(1);
    await until(() => toasts(root).length === 0, 1000);
  });

  it.each(['success', 'error'] as const)(
    'id lets a later show() update the same toast in place, loading → %s, icon included',
    async (tone) => {
      const { root, api } = await liveToaster();
      const icon = () => toasts(root)[0]!.querySelector(':scope > svg')!;
      api.show({ id: 'job-1', title: 'Uploading…', tone: 'loading', persistent: true });
      await until(() => toasts(root).length === 1);
      const spinner = icon().innerHTML;
      api.show({ id: 'job-1', title: 'Done', tone });
      await until(() => toasts(root)[0]?.dataset.type === tone);
      expect(toasts(root)).toHaveLength(1);
      expect(toasts(root)[0]?.querySelector('[data-part="title"]')?.textContent).toBe('Done');
      await until(() => icon().innerHTML !== spinner);
      expect(icon().innerHTML).toBe(parsed(ICONS[tone].body));
      expect(toasts(root)[0]!.querySelectorAll(':scope > svg')).toHaveLength(1);
      // Settling ends loading's persistence: the toast now leaves after the default duration.
      expect(durations(api)).toEqual([2500]);
    },
  );

  describe('loading ring (ProgressCircle) and progress', () => {
    const ring = (root: HTMLElement) => toasts(root)[0]!.querySelector(':scope > svg')!;
    const fill = (root: HTMLElement) => ring(root).querySelector('[data-part="fill"]')!;

    it('a loading toast draws the shared indeterminate ring, aria-hidden, at size s', async () => {
      const { root, api } = await liveToaster();
      api.show({ title: 'Working…', tone: 'loading' });
      await until(() => toasts(root).length === 1);
      const r = ring(root);
      expect(r.classList.contains('ocx-ui-progress-circle__ring')).toBe(true);
      expect(r.getAttribute('data-state')).toBe('indeterminate');
      expect(r.getAttribute('data-size')).toBe('s');
      expect(r.getAttribute('aria-hidden')).toBe('true');
      expect(toasts(root)[0]!.querySelectorAll(':scope > svg')).toHaveLength(1);
    });

    it('progress 40 draws a determinate fill; an update by id moves it', async () => {
      const { root, api } = await liveToaster();
      api.show({ id: 'up', title: 'Uploading…', tone: 'loading', persistent: true, progress: 40 });
      await until(() => toasts(root).length === 1);
      expect(ring(root).getAttribute('data-state')).toBe('determinate');
      expect(fill(root).getAttribute('stroke-dasharray')).toBe('40 100');
      api.show({ id: 'up', title: 'Uploading…', progress: 75 });
      await until(() => fill(root).getAttribute('stroke-dasharray') === '75 100');
      expect(toasts(root)).toHaveLength(1);
      expect(toasts(root)[0]!.dataset.type).toBe('loading');
      expect(toasts(root)[0]!.querySelectorAll(':scope > svg')).toHaveLength(1);
      // An update that leaves progress out keeps the ring where it was.
      api.show({ id: 'up', title: 'Still uploading…' });
      await until(() => toasts(root)[0]!.querySelector('[data-part="title"]')!.textContent === 'Still uploading…');
      expect(fill(root).getAttribute('stroke-dasharray')).toBe('75 100');
    });

    it('progress is clamped to 0–100', async () => {
      const { root, api } = await liveToaster();
      api.show({ id: 'c', title: 'x', tone: 'loading', persistent: true, progress: 250 });
      await until(() => toasts(root).length === 1);
      expect(fill(root).getAttribute('stroke-dasharray')).toBe('100 100');
    });

    it('loading → success swaps the ring for the success icon, and progress on it is ignored', async () => {
      const { root, api } = await liveToaster();
      api.show({ id: 'j', title: 'Working', tone: 'loading', persistent: true, progress: 90 });
      await until(() => toasts(root).length === 1);
      api.show({ id: 'j', title: 'Done', tone: 'success', progress: 100 });
      await until(() => toasts(root)[0]?.dataset.type === 'success');
      await until(() => ring(root).getAttribute('class') === 'ocx-icon');
      expect(ring(root).innerHTML).toBe(parsed(ICONS.success.body));
      expect(toasts(root)[0]!.querySelector('.ocx-ui-progress-circle__ring')).toBeNull();
    });

    it('a non-loading toast given progress draws its icon, not a ring', async () => {
      const { root, api } = await liveToaster();
      api.show({ title: 'Saved', tone: 'success', progress: 50 });
      await until(() => toasts(root).length === 1);
      expect(ring(root).getAttribute('class')).toBe('ocx-icon');
    });

    it('the ring styles inline with the toast sheet; the old spinner is gone', () => {
      // vitest stubs `?inline` css, so the wiring is read from source.
      const read = (f: string) => readFileSync(`${process.cwd()}/packages/theme/src/components/${f}`, 'utf8');
      const chunk = read('toast.zag.mjs');
      expect(chunk).toContain("from './ui/progress-circle.css?inline'");
      expect(chunk).not.toContain('M21 12a9 9 0 1 1-6.219-8.56'); // Lucide loader-circle literal
      expect(read('toast.css')).not.toContain('ocx-toast-spin');
    });
  });

  it('a toast with no duration lasts the store default 2.5 s (not Zag per-type 2 s / 5 s)', async () => {
    const { root, api } = await liveToaster();
    api.show({ title: 'success' });
    api.show({ title: 'error', tone: 'error' });
    await until(() => toasts(root).length === 2);
    expect(durations(api)).toEqual([2500, 2500]);
  });

  it('an action toast never auto-dismisses (WCAG 2.2.1)', async () => {
    const { root, api } = await liveToaster();
    api.show({ title: 'Deleted', action: { label: 'Undo', event: 'demo:undo' }, duration: 1000 });
    await until(() => toasts(root).length === 1);
    expect(durations(api)).toEqual([Infinity]);
  });

  it('an update by id changes only what it passes: tone, description, action and persistence stay', async () => {
    const { root, api } = await liveToaster();
    api.show({
      id: 'net',
      title: 'Offline',
      tone: 'warning',
      persistent: true,
      description: 'Changes are kept locally.',
      action: { label: 'Retry', event: 'demo:retry' },
    });
    await until(() => toasts(root).length === 1);
    api.show({ id: 'net', title: 'Reconnecting (2/5)…' });
    await until(() => toasts(root)[0]?.querySelector('[data-part="title"]')?.textContent === 'Reconnecting (2/5)…');
    const el = toasts(root)[0]!;
    expect(el.dataset.type).toBe('warning');
    expect(el.querySelector('[data-part="description"]')?.textContent).toBe('Changes are kept locally.');
    expect(el.querySelector('[data-part="action-trigger"]')?.textContent).toBe('Retry');
    expect(durations(api)).toEqual([Infinity]);
  });

  it('dismiss(id) removes one toast; dismiss() with no id removes every toast', async () => {
    const { root, api } = await liveToaster();
    api.show({ id: 'a', title: 'a' });
    api.show({ id: 'b', title: 'b' });
    await until(() => toasts(root).length === 2);
    api.dismiss('a');
    await until(() => toasts(root).length === 1, 1000);
    expect(toasts(root)[0]?.querySelector('[data-part="title"]')?.textContent).toBe('b');
    api.dismiss();
    await until(() => toasts(root).length === 0, 1000);
  });
});

describe('toaster.mjs: ocx:toast:dismiss', () => {
  it('is a no-op before any toast has shown (never mounts the toaster to handle it)', async () => {
    const doc = document.implementation.createHTMLDocument();
    doc.body.innerHTML = `<div data-zag-root="toast" data-zag-state="idle" data-zag-id="ocx-toaster" data-zag-props="{}"></div>`;
    const root = doc.querySelector<HTMLElement>('[data-zag-root="toast"]')!;
    const { installToaster } = await import('../src/starlight/toaster.mjs');
    installToaster(doc);
    doc.dispatchEvent(new CustomEvent('ocx:toast:dismiss', { detail: { id: 'nope' } }));
    await tick();
    expect(root.dataset.zagState).toBe('idle');
  });

  it('dismisses a toast shown through toast(), via document', async () => {
    const doc = document;
    doc.body.innerHTML = `<div data-zag-root="toast" data-zag-state="idle" data-zag-id="ocx-toaster" data-zag-props="{}" aria-live="polite"></div>`;
    vi.resetModules();
    const { installToaster } = await import('../src/starlight/toaster.mjs');
    installToaster(doc);
    const root = doc.querySelector<HTMLElement>('[data-zag-root="toast"]')!;
    toast('bye', { id: 'x' });
    await until(() => toasts(root).length === 1, 4000);
    toast.dismiss('x');
    await until(() => toasts(root).length === 0, 1000);
  });

  it('toast(title) sends no tone and renders the success default', async () => {
    document.body.innerHTML = `<div data-zag-root="toast" data-zag-state="idle" data-zag-id="ocx-toaster" data-zag-props="{}" aria-live="polite"></div>`;
    vi.resetModules();
    const { installToaster } = await import('../src/starlight/toaster.mjs');
    installToaster(document);
    const root = document.querySelector<HTMLElement>('[data-zag-root="toast"]')!;
    const seen = recordEvents(['ocx:toast']);
    toast('plain');
    expect(seen[0]?.detail).not.toHaveProperty('tone');
    await until(() => toasts(root).length === 1, 4000);
    expect(toasts(root)[0]?.dataset.type).toBe('success');
  });

  it('a dismiss sent while the toaster chunk still loads is not dropped', async () => {
    document.body.innerHTML = `<div data-zag-root="toast" data-zag-state="idle" data-zag-id="ocx-toaster" data-zag-props="{}" aria-live="polite"></div>`;
    vi.resetModules();
    const { installToaster } = await import('../src/starlight/toaster.mjs');
    installToaster(document);
    const root = document.querySelector<HTMLElement>('[data-zag-root="toast"]')!;
    toast('gone', { id: 'race' });
    toast.dismiss('race'); // same task: the chunk has not loaded yet
    await until(() => root.dataset.zagState === 'live', 4000);
    await new Promise((r) => setTimeout(r, 300));
    expect(root.querySelectorAll('[data-part="root"][data-state="open"]')).toHaveLength(0);
  });
});
