// @vitest-environment jsdom
// Zag glue (packages/theme/src/components/ui/zag{,-runtime}.mjs): C-102 ssrAttrs, C-103 ssrApi,
// C-104 mount, C-105 emit, C-106 ZagProps, C-108 expectSsrMatchesConnect.
// mount runs a real VanillaMachine over a two-state fake machine, so the replay tests
// prove the widget acts on the re-dispatched (untrusted) event.
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Props as AccordionProps } from '@zag-js/accordion';
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { emit, ssrAttrs } from '../src/components/ui/zag-runtime.mjs';
import { mount } from '../src/components/ui/zag.mjs';
import type { ZagModule, ZagProps } from '../src/components/ui/zag.mjs';
import { expectSsrMatchesConnect } from './zag-helpers.ts';

describe('C-102 ssrAttrs', () => {
  const fn = () => undefined;
  it.each([
    ['drops a function', { onClick: fn, id: 'a' }, { id: 'a' }],
    ['drops undefined', { title: undefined, id: 'a' }, { id: 'a' }],
    ['true → ""', { hidden: true }, { hidden: '' }],
    [
      'boolean attribute true → true (Astro drops an empty checked/disabled)',
      { checked: true, disabled: true },
      { checked: true, disabled: true },
    ],
    ['false → omitted', { hidden: false, disabled: false }, {}],
    ['aria-* false → "false"', { 'aria-expanded': false }, { 'aria-expanded': 'false' }],
    ['aria-* true → "true"', { 'aria-selected': true }, { 'aria-selected': 'true' }],
    ['number → string', { tabindex: -1 }, { tabindex: '-1' }],
    ['style object → CSS text', { style: { zIndex: 3, '--x': '1px' } }, { style: 'z-index:3;--x:1px;' }],
    [
      'strips data-focus',
      { 'data-focus': '', 'data-focus-visible': '', 'data-state': 'open' },
      { 'data-state': 'open' },
    ],
  ] as const)('%s', (_, input, output) => {
    expect(ssrAttrs(input)).toEqual(output);
  });
});

describe('C-103 ssrApi', () => {
  it('connects dialog, navigation-menu, accordion and tabs in Node with no DOM globals', () => {
    const zag = pathToFileURL(join(import.meta.dirname, '../src/components/ui/zag-runtime.mjs')).href;
    const script = `
      if (typeof document !== 'undefined' || typeof window !== 'undefined') throw new Error('DOM globals present');
      const { ssrApi, ssrAttrs } = await import(${JSON.stringify(zag)});
      const [dialog, nav, accordion, tabs] = await Promise.all(
        ['dialog', 'navigation-menu', 'accordion', 'tabs'].map((n) => import('@zag-js/' + n)),
      );
      const out = {
        dialog: ssrAttrs(ssrApi(dialog.machine, dialog.connect, { id: 'd' }).getTriggerProps()),
        nav: ssrAttrs(ssrApi(nav.machine, nav.connect, { id: 'n' }).getRootProps()),
        accordion: ssrAttrs(ssrApi(accordion.machine, accordion.connect, { id: 'a', defaultValue: ['x'] }).getItemTriggerProps({ value: 'x' })),
        tabs: ssrAttrs(ssrApi(tabs.machine, tabs.connect, { id: 't', defaultValue: 'x' }).getTriggerProps({ value: 'x' })),
      };
      process.stdout.write(JSON.stringify(out));
    `;
    const stdout = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: join(import.meta.dirname, '..'),
      encoding: 'utf8',
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    });
    expect(JSON.parse(stdout)).toMatchObject({
      dialog: { 'data-part': 'trigger', 'aria-haspopup': 'dialog', 'aria-expanded': 'false' },
      nav: { 'data-scope': 'navigation-menu', 'data-part': 'root' },
      accordion: { 'data-part': 'item-trigger', 'aria-expanded': 'true' },
      tabs: { 'data-part': 'trigger', 'aria-selected': 'true' },
    });
  });
});

// A two-state disclosure: the trigger toggles on click, opens on ArrowDown.
type Service = {
  state: { matches: (s: string) => boolean };
  send: (e: { type: string }) => void;
  scope: { id?: string };
  prop: (k: string) => unknown;
};
type Normalize = { button: (p: Record<string, unknown>) => Record<string, unknown> };
type Api = { open: boolean; label: unknown; trigger: Record<string, unknown> };

function fakeModule(extra: Partial<ZagModule> = {}): ZagModule {
  const machine = {
    props: ({ props }: { props: Record<string, unknown> }) => ({ open: false, ...props }),
    initialState: ({ prop }: { prop: (k: string) => unknown }) => (prop('open') ? 'open' : 'closed'),
    states: {
      closed: { on: { TOGGLE: { target: 'open' }, OPEN: { target: 'open' } } },
      open: { on: { TOGGLE: { target: 'closed' } } },
    },
    implementations: {},
  };
  const connect = (service: Service, normalize: Normalize): Api => {
    const open = service.state.matches('open');
    return {
      open,
      label: service.prop('label'),
      trigger: normalize.button({
        id: `${service.scope.id}:trigger`,
        'aria-expanded': open,
        onClick: () => service.send({ type: 'TOGGLE' }),
        onKeyDown: (e: KeyboardEvent) => e.key === 'ArrowDown' && service.send({ type: 'OPEN' }),
      }),
    };
  };
  const render: ZagModule['render'] = (api: Api, root, spread) => {
    spread(root.querySelector('button')!, api.trigger);
  };
  return { machine, connect, render, ...extra } as unknown as ZagModule;
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeRoot(inner = '<button type="button" data-part="trigger">t</button>', props = '{}'): HTMLElement {
  document.body.innerHTML = `<div data-zag-root="fake" data-zag-state="idle" data-zag-id="z1" data-zag-props='${props}'>${inner}</div>`;
  return document.querySelector('[data-zag-root]')!;
}

const tick = () => new Promise((r) => setTimeout(r, 0));
const button = (root: HTMLElement) => root.querySelector('button')!;
const hover = (root: HTMLElement) => root.dispatchEvent(new Event('pointerenter'));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('C-104 mount', () => {
  it('imports nothing before the trigger; interaction trigger goes idle → loading → live', async () => {
    const root = makeRoot();
    const d = deferred<ZagModule>();
    const load = vi.fn(() => d.promise);
    const h = mount(root, { load });
    await tick();
    expect(load).not.toHaveBeenCalled();
    expect(root.dataset.zagState).toBe('idle');
    hover(root);
    expect(load).toHaveBeenCalledTimes(1);
    expect(root.dataset.zagState).toBe('loading');
    d.resolve(fakeModule());
    await h.ready;
    expect(root.dataset.zagState).toBe('live');
  });

  it.each([
    ['focusin', () => new FocusEvent('focusin', { bubbles: true })],
    ['touchstart', () => new Event('touchstart', { bubbles: true })],
  ])('starts on %s', async (_, make) => {
    const root = makeRoot();
    const load = vi.fn(() => Promise.resolve(fakeModule()));
    const h = mount(root, { load });
    button(root).dispatchEvent(make());
    await h.ready;
    expect(load).toHaveBeenCalledTimes(1);
    expect(root.dataset.zagState).toBe('live');
  });

  it('C-150 re-announces focus that arrived before start, so focus-driven machine state catches up (Z4)', async () => {
    const root = makeRoot();
    const seen: string[] = [];
    const h = mount(root, {
      load: () =>
        Promise.resolve(
          fakeModule({
            render: (_api, r, spread) =>
              spread(r.querySelector('button')!, {
                onFocusin: (e: FocusEvent) => seen.push(`${e.type}:${e.isTrusted}`),
              }),
          }),
        ),
    });
    button(root).focus();
    await h.ready;
    expect(document.activeElement).toBe(button(root));
    expect(seen).toEqual(['focusin:false']);
  });

  it('C-150 leaves focus inside a nested Zag root alone', async () => {
    const root = makeRoot('<div data-zag-root="inner"><button type="button">n</button></div>');
    const seen: string[] = [];
    const h = mount(root, {
      load: () =>
        Promise.resolve(
          fakeModule({
            render: (_api, r, spread) =>
              spread(r.querySelector('button')!, { onFocusin: (e: FocusEvent) => seen.push(e.type) }),
          }),
        ),
    });
    button(root).focus();
    await h.ready;
    expect(seen).toEqual([]);
  });

  it('is idempotent per root: a second mount returns the same handle and loads once', async () => {
    const root = makeRoot();
    const load = vi.fn(() => Promise.resolve(fakeModule()));
    const h = mount(root, { load });
    expect(mount(root, { load })).toBe(h);
    hover(root);
    hover(root);
    await h.ready;
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('manual: only start() loads, and a second start() loads nothing more', async () => {
    const root = makeRoot();
    const load = vi.fn(() => Promise.resolve(fakeModule()));
    const h = mount(root, { load, trigger: 'manual' });
    hover(root);
    button(root).dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    await tick();
    expect(load).not.toHaveBeenCalled();
    await h.start();
    await h.start();
    expect(load).toHaveBeenCalledTimes(1);
    expect(root.dataset.zagState).toBe('live');
  });

  it('visible: loads when the root intersects', async () => {
    let fire: ((entries: { isIntersecting: boolean }[]) => void) | undefined;
    const disconnect = vi.fn();
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
          fire = cb;
        }
        observe() {}
        disconnect = disconnect;
      },
    );
    const root = makeRoot();
    const load = vi.fn(() => Promise.resolve(fakeModule()));
    const h = mount(root, { load, trigger: 'visible' });
    hover(root);
    fire?.([{ isIntersecting: false }]);
    expect(load).not.toHaveBeenCalled();
    fire?.([{ isIntersecting: true }]);
    await h.ready;
    expect(load).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalled();
  });

  it('machine props = data-zag-props + the SSR id; readDom wins over data-zag-props', async () => {
    const root = makeRoot('<button type="button">t</button>', '{"open":true,"label":"ssr"}');
    const readDom = vi.fn(() => ({ label: 'dom' }));
    const h = mount(root, { load: () => Promise.resolve(fakeModule({ readDom })), trigger: 'manual' });
    await h.start();
    expect(readDom).toHaveBeenCalledWith(root, expect.any(Function));
    expect(h.api).toMatchObject({ open: true, label: 'dom' });
    expect(button(root).id).toBe('z1:trigger');
    expect(button(root).getAttribute('aria-expanded')).toBe('true');
  });

  it('focus that started the machine is handed to it: one untrusted focusin on the focused part after start', async () => {
    const root = makeRoot();
    const seen: boolean[] = [];
    button(root).addEventListener('focusin', (e) => seen.push(e.isTrusted));
    const h = mount(root, { load: () => Promise.resolve(fakeModule()) });
    button(root).focus();
    await h.ready;
    expect(seen).toHaveLength(2);
    expect(seen[1]).toBe(false);
  });

  it('readDom gets an update() that merges props into the running machine and is a no-op after destroy', async () => {
    const root = makeRoot();
    let update: (p: Record<string, unknown>) => void = () => undefined;
    const readDom = (_: HTMLElement, u: typeof update) => ((update = u), { label: 'dom' });
    const h = mount(root, { load: () => Promise.resolve(fakeModule({ readDom })), trigger: 'manual' });
    await h.start();
    update({ label: 'later' });
    expect(h.api).toMatchObject({ label: 'later' });
    h.destroy();
    expect(() => update({ label: 'gone' })).not.toThrow();
  });

  it('removes popovertarget on the trigger and restores it on error', async () => {
    const root = makeRoot('<button type="button" popovertarget="pane">t</button>');
    const d = deferred<ZagModule>();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const h = mount(root, { load: () => d.promise });
    expect(button(root).getAttribute('popovertarget')).toBe('pane');
    hover(root);
    expect(button(root).hasAttribute('popovertarget')).toBe(false);
    d.reject(new Error('chunk failed'));
    await h.ready;
    expect(button(root).getAttribute('popovertarget')).toBe('pane');
  });

  it('load rejection: data-zag-state=error, one console.error, SSR markup kept, nothing thrown', async () => {
    // popovertarget last: restoring re-appends the attribute, and innerHTML is order-sensitive.
    const root = makeRoot('<button type="button" aria-expanded="false" popovertarget="pane">t</button>');
    const before = root.innerHTML;
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const h = mount(root, { load: () => Promise.reject(new Error('chunk failed')) });
    hover(root);
    await expect(h.ready).resolves.toBeUndefined();
    expect(root.dataset.zagState).toBe('error');
    expect(error).toHaveBeenCalledTimes(1);
    expect(root.innerHTML).toBe(before);
  });

  it('a throwing render counts as a failed start: error state, one console.error, fallback restored', async () => {
    const root = makeRoot('<button type="button" popovertarget="pane">t</button>');
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const render = () => {
      throw new Error('render bug');
    };
    const h = mount(root, { load: () => Promise.resolve(fakeModule({ render })), trigger: 'manual' });
    await h.start();
    expect(root.dataset.zagState).toBe('error');
    expect(error).toHaveBeenCalledTimes(1);
    expect(button(root).getAttribute('popovertarget')).toBe('pane');
  });

  /** Counts click/keydown events reaching the root after the originals were dispatched. */
  function counter(root: HTMLElement) {
    const seen = { click: 0, keydown: 0, trusted: 0 };
    for (const type of ['click', 'keydown'] as const)
      root.addEventListener(type, (e) => {
        seen[type] += 1;
        if (e.isTrusted) seen.trusted += 1;
      });
    return seen;
  }

  it('replays a keydown followed by its click exactly once, as the click, and the widget acts on it', async () => {
    const root = makeRoot();
    const d = deferred<ZagModule>();
    const h = mount(root, { load: () => d.promise });
    hover(root);
    button(root).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    button(root).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const seen = counter(root);
    d.resolve(fakeModule());
    await h.ready;
    await tick();
    expect(seen).toEqual({ click: 1, keydown: 0, trusted: 0 });
    expect(h.api).toMatchObject({ open: true });
  });

  it('replays an activating keydown when no click came', async () => {
    const root = makeRoot();
    const d = deferred<ZagModule>();
    const h = mount(root, { load: () => d.promise });
    button(root).dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    button(root).dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    button(root).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    const seen = counter(root);
    d.resolve(fakeModule());
    await h.ready;
    await tick();
    expect(seen).toEqual({ click: 0, keydown: 1, trusted: 0 });
    expect(h.api).toMatchObject({ open: true });
  });

  it.each([
    ['a link', '<a href="#x">l</a>'],
    ['a submit button', '<form><button type="submit">s</button></form>'],
    ['a native checkbox', '<input type="checkbox">'],
    ['a summary', '<details><summary>s</summary></details>'],
    ['a copy button inside a part', '<div data-part="content"><button type="button">copy</button></div>'],
    [
      'a part of a nested root',
      '<div data-zag-root="inner"><button type="button" data-part="trigger">n</button></div>',
    ],
  ])('never replays a click on %s: its native action already ran', async (_, inner) => {
    const root = makeRoot(`<button type="button" data-part="trigger">t</button>${inner}`);
    const d = deferred<ZagModule>();
    const h = mount(root, { load: () => d.promise });
    hover(root);
    const target = root.querySelector(
      'a, [type=submit], input, summary, [data-part=content] button, [data-zag-root] [data-zag-root] button',
    )!;
    target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const seen = counter(root);
    d.resolve(fakeModule());
    await h.ready;
    await tick();
    expect(seen).toEqual({ click: 0, keydown: 0, trusted: 0 });
  });

  it.each([
    ['a submit button', '<button type="submit">s</button>'],
    ['a typeless button (submits by default)', '<button>s</button>'],
    ['a submit button that is a part', '<button type="submit" data-part="trigger">s</button>'],
  ])('submits a form once for a click on %s', async (_, inner) => {
    const root = makeRoot(`<form>${inner}<span>x</span></form>`);
    let submits = 0;
    root.querySelector('form')!.addEventListener('submit', (e) => {
      e.preventDefault();
      submits += 1;
    });
    const d = deferred<ZagModule>();
    const h = mount(root, { load: () => d.promise });
    hover(root);
    button(root).click();
    const seen = counter(root);
    d.resolve(fakeModule());
    await h.ready;
    await tick();
    expect(submits).toBe(1);
    expect(seen.click).toBe(0);
  });

  it('replays a click on a typeless button outside a form (no native action)', async () => {
    const root = makeRoot('<button data-part="trigger">t</button><button class="more">m</button>');
    const d = deferred<ZagModule>();
    const h = mount(root, { load: () => d.promise });
    hover(root);
    root.querySelector('.more')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const seen = counter(root);
    d.resolve(fakeModule());
    await h.ready;
    await tick();
    expect(seen.click).toBe(1);
  });

  it('replays a click on plain text inside a part', async () => {
    const root = makeRoot('<button type="button" data-part="trigger"><span>t</span></button>');
    const d = deferred<ZagModule>();
    const h = mount(root, { load: () => d.promise });
    hover(root);
    root.querySelector('span')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const seen = counter(root);
    d.resolve(fakeModule());
    await h.ready;
    await tick();
    expect(seen.click).toBe(1);
    expect(h.api).toMatchObject({ open: true });
  });

  it('replays a click on the root own button without a data-part (List Load more, header trigger)', async () => {
    const root = makeRoot(
      '<button type="button" data-part="trigger">t</button><button type="button" class="more">m</button>',
    );
    const d = deferred<ZagModule>();
    const h = mount(root, { load: () => d.promise });
    hover(root);
    root.querySelector('.more')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const seen = counter(root);
    d.resolve(fakeModule());
    await h.ready;
    await tick();
    expect(seen.click).toBe(1);
  });

  it('replay: false re-dispatches nothing', async () => {
    const root = makeRoot();
    const d = deferred<ZagModule>();
    const h = mount(root, { load: () => d.promise, replay: false });
    hover(root);
    button(root).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const seen = counter(root);
    d.resolve(fakeModule());
    await h.ready;
    await tick();
    expect(seen).toEqual({ click: 0, keydown: 0, trusted: 0 });
    expect(h.api).toMatchObject({ open: false });
  });

  it('destroy before the trigger removes the listeners and never imports', async () => {
    const root = makeRoot();
    const load = vi.fn(() => Promise.resolve(fakeModule()));
    const h = mount(root, { load });
    h.destroy();
    hover(root);
    button(root).dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    await tick();
    expect(load).not.toHaveBeenCalled();
    expect(root.dataset.zagState).toBe('idle');
    expect(mount(root, { load })).not.toBe(h);
  });

  it('destroy while loading never starts the machine', async () => {
    const root = makeRoot();
    const d = deferred<ZagModule>();
    const h = mount(root, { load: () => d.promise });
    hover(root);
    h.destroy();
    d.resolve(fakeModule());
    await h.ready;
    await tick();
    expect(h.api).toBeUndefined();
    expect(button(root).hasAttribute('aria-expanded')).toBe(false);
  });

  it('destroy after start removes spread listeners and stops the machine; a second destroy is a no-op', async () => {
    const root = makeRoot();
    const h = mount(root, { load: () => Promise.resolve(fakeModule()), trigger: 'manual' });
    await h.start();
    const off = vi.spyOn(button(root), 'removeEventListener');
    h.destroy();
    expect(off).toHaveBeenCalledWith('click', expect.any(Function));
    button(root).click();
    await tick();
    expect(button(root).getAttribute('aria-expanded')).toBe('false');
    expect(h.api).toBeUndefined();
    expect(root.dataset.zagState).toBe('idle');
    off.mockClear();
    h.destroy();
    expect(off).not.toHaveBeenCalled();
    expect(mount(root, { load: () => Promise.resolve(fakeModule()) })).not.toBe(h);
  });
});

describe('C-105 emit', () => {
  it('dispatches a bubbling ocx:<scope>:<name> CustomEvent carrying detail', () => {
    const root = makeRoot();
    const seen = vi.fn();
    document.addEventListener('ocx:tabs:change', seen);
    emit(root, 'tabs', 'change', { value: 'b' });
    document.removeEventListener('ocx:tabs:change', seen);
    const event = seen.mock.calls[0]?.[0] as CustomEvent;
    expect(event).toBeInstanceOf(CustomEvent);
    expect(event.bubbles).toBe(true);
    expect(event.detail).toEqual({ value: 'b' });
  });
});

describe('C-106 ZagProps', () => {
  type P = {
    value?: string[];
    multiple?: boolean;
    onValueChange?: (d: { value: string[] }) => void;
    id: string;
    ids?: Record<string, string>;
    getRootNode?: () => Node;
    dir?: 'ltr' | 'rtl';
  };
  it('keeps data props and drops function-typed keys, id, ids, getRootNode, dir', () => {
    expectTypeOf<ZagProps<P>>().toEqualTypeOf<{ value?: string[]; multiple?: boolean }>();
    expectTypeOf<ZagProps<AccordionProps>>().not.toHaveProperty('onValueChange');
    expectTypeOf<ZagProps<AccordionProps>>().toHaveProperty('multiple');
    // @ts-expect-error a function-typed key is not a pass-through prop
    const bad: ZagProps<P> = { onValueChange: () => undefined };
    expect(bad).toBeTruthy();
  });
});

describe('C-108 expectSsrMatchesConnect', () => {
  const attrs = { id: 'a', 'data-part': 'trigger', 'aria-expanded': false, onClick: () => undefined };
  it('passes when the part carries exactly ssrAttrs(attrs), ignoring class and data-astro-*', () => {
    const html =
      '<div><button data-part="trigger" aria-expanded="false" id="a" class="x" data-astro-cid-1></button></div>';
    expectSsrMatchesConnect(html, 'trigger', attrs);
  });
  it.each([
    ['a value differs', '<button data-part="trigger" id="a" aria-expanded="true"></button>'],
    ['an attribute is extra', '<button data-part="trigger" id="a" aria-expanded="false" data-focus></button>'],
    ['the part is missing', '<button id="a"></button>'],
  ])('fails when %s', (_, html) => {
    expect(() => expectSsrMatchesConnect(html, 'trigger', attrs)).toThrow();
  });
});
