// @vitest-environment jsdom
// CopyMenu behaviour under a DOM (D-056, D-083, D-131, D-143): a live machine on the SSR anatomy
// (components-copy-menu.test.ts checks the markup itself). copy.mjs and copy-host.mjs are covered here too.
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as copyMenu from '../src/components/copy-menu.zag.mjs';
import { copyMap, holdEarlyContextMenu, hostOf } from '../src/components/copy-host.mjs';
import { toastCopy, writeClipboard } from '../src/components/copy.mjs';
import { parts } from '../src/components/ui/menu.zag.mjs';
import { ssrApi, ssrAttrs } from '../src/components/ui/zag-runtime.mjs';
import { mount } from '../src/components/ui/zag.mjs';
import type { ZagModule } from '../src/components/ui/zag.mjs';

const tick = () => new Promise((r) => setTimeout(r, 0));
const until = async (ok: () => boolean, ms = 2000) => {
  for (let t = 0; !ok(); t += 10) {
    if (t > ms) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 10));
  }
};
const attrs = (a: Record<string, unknown>) =>
  Object.entries(ssrAttrs(a))
    .map(([k, v]) => (v === true ? k : `${k}="${v.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"`))
    .join(' ');
const json = (value: unknown) => JSON.stringify(value).replaceAll('&', '&amp;').replaceAll("'", '&#39;');

const ITEMS = [
  { value: 'identifier', label: 'Copy identifier' },
  { value: 'tag', label: 'Copy tag' },
  { value: 'link', label: 'Copy link' },
];

/** Every `ocx:*` event that reaches the document. */
function recordEvents() {
  const seen: { type: string; detail: unknown }[] = [];
  const on = (e: Event) => seen.push({ type: e.type, detail: (e as CustomEvent).detail });
  for (const type of ['ocx:toast', 'ocx:menu:select', 'ocx:menu:change']) document.addEventListener(type, on);
  return seen;
}

/** The SSR anatomy of a context CopyMenu around `hostsHtml`; the machine is not started. */
function place(
  hostsHtml: string,
  { context = true, texts = {} }: { context?: boolean; texts?: Record<string, string> } = {},
) {
  const props = { 'aria-label': 'Version actions', positioning: { placement: 'bottom-start', strategy: 'fixed' } };
  const p = parts(ssrApi(copyMenu.machine, copyMenu.connect, { ...props, id: 'cm1' }), ITEMS);
  const rows = ITEMS.map(
    ({ value, label }) =>
      `<div ${attrs(p[`item:${value}`] ?? {})} data-copy-text="${texts[value] ?? ''}" data-copy-meaning="${label.replace(/^Copy /, '')}">${label}</div>`,
  ).join('');
  document.body.innerHTML = `<button id="before">before</button>
    <div id="root" ${context ? 'data-context' : ''} data-zag-root="copy-menu" data-zag-state="idle" data-zag-id="cm1" data-zag-props='${json(props)}'>
      ${hostsHtml}${context ? '' : `<button ${attrs(p['trigger']!)}>Copy</button>`}
      <div ${attrs(p['positioner']!)}><div ${attrs(p['content']!)}>${rows}</div></div>
    </div><button id="after">after</button>`;
  const root = document.getElementById('root') as HTMLElement;
  return { root };
}

const HOSTS = `<ul id="list">
  <li id="t1" tabindex="0" data-copy='${json({ identifier: 'ocx.sh/node:24', tag: '24', link: 'https://x/n/24' })}'>24</li>
  <li id="t2" tabindex="0" data-copy='${json({ identifier: 'ocx.sh/node:22', link: 'https://x/n/22' })}'>22</li>
  <li id="plain" tabindex="0">no data</li>
</ul><p id="gap">empty space</p>`;

async function liveMenu(html = HOSTS) {
  const { root } = place(html);
  const handle = await start(root);
  const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
  const contextmenu = (target: Element, init: MouseEventInit = { clientX: 40, clientY: 50 }) => {
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(event);
    return event;
  };
  const content = () => root.querySelector<HTMLElement>('[data-part="content"]')!;
  const items = () => [...root.querySelectorAll<HTMLElement>('[data-part="item"]')];
  const visible = () =>
    items()
      .filter((i) => !i.hidden)
      .map((i) => i.dataset['value']);
  return { root, handle, el, contextmenu, content, items, visible };
}

/** Machines started by a test; stopped after it, or an open menu of one test reacts in the next. */
const handles: { destroy: () => void }[] = [];
const start = async (root: HTMLElement) => {
  const handle = mount(root, { load: () => Promise.resolve(copyMenu as unknown as ZagModule) });
  handles.push(handle);
  await handle.start();
  return handle;
};

afterEach(() => {
  for (const handle of handles.splice(0)) handle.destroy();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('D-084 writeClipboard', () => {
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
  ])('D-084 %s resolves false and throws nothing', async (_, nav) => {
    vi.stubGlobal('navigator', nav());
    await expect(writeClipboard('x')).resolves.toBe(false);
  });

  it('D-084 a good write resolves true with the text on the clipboard', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    await expect(writeClipboard('ocx add uv')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('ocx add uv');
  });
});

describe('D-131 D-143 toastCopy', () => {
  it('D-131 D-143 a success is "Copied — <meaning>" for 2000 ms in the copy slot', () => {
    const seen = recordEvents();
    toastCopy(document, true, 'identifier');
    expect(seen).toEqual([
      { type: 'ocx:toast', detail: { title: 'Copied — identifier', duration: 2000, slot: 'copy' } },
    ]);
  });

  it('D-084 D-143 a failure is the danger "Copy failed" in the same slot', () => {
    const seen = recordEvents();
    toastCopy(document, false, 'identifier');
    expect(seen).toEqual([{ type: 'ocx:toast', detail: { title: 'Copy failed', tone: 'danger', slot: 'copy' } }]);
  });
});

describe('D-083 hosts: data on the element', () => {
  const host = (data: string) => {
    document.body.innerHTML = `<div id="root" data-zag-root="copy-menu"><div id="h" data-copy='${data}'><b id="in">x</b></div><p id="gap">gap</p></div>`;
    return { root: document.getElementById('root')!, h: document.getElementById('h')! };
  };

  it('D-083 copyMap keeps the string texts of a JSON object', () => {
    const { h } = host(json({ a: 'x', b: 2, c: 'z' }));
    expect(copyMap(h)).toEqual({ a: 'x', c: 'z' });
  });

  it.each([
    ['malformed', '{nope'],
    ['an array', '["a"]'],
    ['null', 'null'],
    ['no string text', '{"a":1}'],
    ['empty', '{}'],
  ])('D-083 copyMap is null for %s data', (_, data) => {
    expect(copyMap(host(data).h)).toBeNull();
  });

  it('D-083 copyMap is null without a data-copy attribute', () => {
    document.body.innerHTML = '<div id="h"></div>';
    expect(copyMap(document.getElementById('h')!)).toBeNull();
  });

  it('D-083 hostOf finds the host from a child, and gives null on empty space', () => {
    const { root, h } = host(json({ a: 'x' }));
    expect(hostOf(root, document.getElementById('in'))?.host).toBe(h);
    expect(hostOf(root, document.getElementById('gap'))).toBeNull();
    expect(hostOf(root, null)).toBeNull();
    expect(hostOf(root, document)).toBeNull(); // not an element
  });

  it('D-083 hostOf ignores a host of a nested widget and a host outside the root', () => {
    document.body.innerHTML = `<div data-copy='{"a":"x"}' id="outside"><div id="root" data-zag-root="copy-menu">
      <div data-zag-root="other"><span id="nested" data-copy='{"a":"y"}'>n</span></div></div></div>`;
    const root = document.getElementById('root')!;
    expect(hostOf(root, document.getElementById('nested'))).toBeNull();
    expect(hostOf(root, document.getElementById('outside'))).toBeNull();
  });
});

describe('D-083 the context menu opens on a host only', () => {
  it("D-083 a context event on a host opens the menu with that host's items", async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: () => Promise.resolve() } });
    const { root, el, contextmenu, visible } = await liveMenu();
    const event = contextmenu(el('t2'));
    expect(event.defaultPrevented, 'the browser menu is replaced').toBe(true);
    await until(() => !root.querySelector<HTMLElement>('[data-part="content"]')!.hidden);
    expect(visible()).toEqual(['identifier', 'link']); // t2 has no tag text
  });

  it('an item whose value is an Object.prototype name has no text and stays hidden', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: () => Promise.resolve() } });
    const { root, el, contextmenu, items, visible } = await liveMenu();
    items()[1]!.dataset['value'] = 'toString';
    items()[2]!.dataset['value'] = 'constructor';
    contextmenu(el('t1'));
    await until(() => !root.querySelector<HTMLElement>('[data-part="content"]')!.hidden);
    expect(visible()).toEqual(['identifier']);
    expect(items()[2]!.hasAttribute('data-copy-text')).toBe(false);
  });

  it('D-083 empty space and a plain element open nothing and leave the browser menu alone', async () => {
    const { content, el, contextmenu } = await liveMenu();
    for (const target of ['gap', 'plain', 'list']) {
      expect(contextmenu(el(target)).defaultPrevented, target).toBe(false);
    }
    await tick();
    expect(content().hidden).toBe(true);
  });

  it('D-083 a long-press on a gap opens nothing (touch pointer, 700 ms)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { content, el } = await liveMenu();
    const down = (id: string) =>
      el(id).dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 5, clientY: 5 }));
    Object.defineProperty(MouseEvent.prototype, 'pointerType', { value: 'touch', configurable: true });
    try {
      down('gap');
      await vi.advanceTimersByTimeAsync(1000);
      expect(content().hidden).toBe(true);
      down('t1');
      await vi.advanceTimersByTimeAsync(1000);
      expect(content().hidden).toBe(false);
    } finally {
      Reflect.deleteProperty(MouseEvent.prototype, 'pointerType');
    }
  });

  it('D-083 a held mouse pointerdown on a host does not open the menu (long-press is touch only)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { content, el } = await liveMenu();
    Object.defineProperty(MouseEvent.prototype, 'pointerType', { value: 'mouse', configurable: true });
    try {
      el('t1').dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 5, clientY: 5 }));
      await vi.advanceTimersByTimeAsync(1000);
      expect(content().hidden).toBe(true);
    } finally {
      Reflect.deleteProperty(MouseEvent.prototype, 'pointerType');
    }
  });

  it('D-083 hosts appended after the menu is live work too (delegation, no per-host wiring)', async () => {
    const { root, contextmenu, visible } = await liveMenu();
    const late = document.createElement('li');
    late.dataset['copy'] = JSON.stringify({ tag: '99' });
    late.textContent = '99';
    root.querySelector('#list')!.append(late);
    contextmenu(late);
    await until(() => !root.querySelector<HTMLElement>('[data-part="content"]')!.hidden);
    expect(visible()).toEqual(['tag']);
  });

  it('D-083 a keyboard-opened menu (no pointer position) anchors under the host', async () => {
    const { root, el, contextmenu } = await liveMenu();
    vi.spyOn(el('t1'), 'getBoundingClientRect').mockReturnValue({ left: 12, bottom: 34 } as DOMRect);
    const spy = vi.fn();
    root.addEventListener('ocx:menu:change', spy);
    expect(contextmenu(el('t1'), { clientX: 0, clientY: 0 }).defaultPrevented).toBe(true);
    await until(() => spy.mock.calls.length > 0);
    expect((spy.mock.calls[0]![0] as CustomEvent).detail).toEqual({ open: true });
  });
});

describe('D-083 where the context menu anchors', () => {
  /** render() with Zag's context trigger replaced by a spy, and the host handlers it spreads on the root. */
  function renderWithSpy() {
    const { root } = place(HOSTS);
    const oncontextmenu = vi.fn();
    const onpointerdown = vi.fn();
    const api = {
      ...ssrApi(copyMenu.machine, copyMenu.connect, { id: 'cm1' }),
      getContextTriggerProps: () => ({ oncontextmenu, onpointerdown }),
    };
    const spread = vi.fn();
    copyMenu.render(api, root, spread);
    const handlers = spread.mock.calls.find(([el]) => el === root)![1] as Record<string, (e: unknown) => void>;
    return { handlers, oncontextmenu, onpointerdown };
  }
  const aim = (id: string, init: MouseEventInit) => {
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, ...init });
    Object.defineProperty(event, 'target', { value: document.getElementById(id) });
    return event;
  };

  it('D-083 a keyboard-opened menu anchors at the host left edge and bottom, and keeps preventDefault', () => {
    const { handlers, oncontextmenu } = renderWithSpy();
    vi.spyOn(document.getElementById('t1')!, 'getBoundingClientRect').mockReturnValue({
      left: 12,
      bottom: 34,
    } as DOMRect);
    const event = aim('t1', { clientX: 0, clientY: 0 });
    handlers['oncontextmenu']!(event);
    const passed = oncontextmenu.mock.calls[0]![0] as { clientX: number; clientY: number; preventDefault: () => void };
    expect([passed.clientX, passed.clientY]).toEqual([12, 34]);
    passed.preventDefault();
    expect(event.defaultPrevented).toBe(true);
  });

  it('D-083 only a touch pointerdown on a host reaches the long-press; a mouse one never does', () => {
    const { handlers, onpointerdown } = renderWithSpy();
    const down = (id: string, pointerType: string) => {
      const event = new MouseEvent('pointerdown', { bubbles: true });
      Object.defineProperty(event, 'pointerType', { value: pointerType });
      Object.defineProperty(event, 'target', { value: document.getElementById(id) });
      handlers['onpointerdown']!(event);
    };
    down('t1', 'mouse');
    down('gap', 'touch');
    expect(onpointerdown).not.toHaveBeenCalled();
    down('t1', 'touch');
    expect(onpointerdown).toHaveBeenCalledTimes(1);
  });

  it('D-083 a pointer-opened menu passes the event through at its own position', () => {
    const { handlers, oncontextmenu } = renderWithSpy();
    const event = aim('t1', { clientX: 40, clientY: 50 });
    handlers['oncontextmenu']!(event);
    expect(oncontextmenu).toHaveBeenCalledWith(event);
  });
});

describe('D-083 D-131 a selection copies the item on the host that opened it', () => {
  it("D-083 D-131 D-143 picks the second host's own text and toasts its meaning", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const seen = recordEvents();
    const { root, el, contextmenu, items } = await liveMenu();
    contextmenu(el('t1'));
    await until(() => !root.querySelector<HTMLElement>('[data-part="content"]')!.hidden);
    // A different host takes the menu over while it is open.
    contextmenu(el('t2'));
    await tick();
    items()
      .find((i) => i.dataset['value'] === 'identifier')!
      .click();
    await until(() => seen.some((e) => e.type === 'ocx:toast'));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith('ocx.sh/node:22');
    expect(seen.filter((e) => e.type !== 'ocx:menu:change')).toEqual([
      { type: 'ocx:menu:select', detail: { value: 'identifier' } },
      { type: 'ocx:toast', detail: { title: 'Copied — identifier', duration: 2000, slot: 'copy' } },
    ]);
  });

  it('D-084 a refused write on a selection toasts "Copy failed", throws nothing', async () => {
    vi.stubGlobal('navigator', {});
    const seen = recordEvents();
    const { root, el, contextmenu, items } = await liveMenu();
    contextmenu(el('t1'));
    await until(() => !root.querySelector<HTMLElement>('[data-part="content"]')!.hidden);
    items()
      .find((i) => i.dataset['value'] === 'tag')!
      .click();
    await until(() => seen.some((e) => e.type === 'ocx:toast'));
    expect(seen.at(-1)).toEqual({
      type: 'ocx:toast',
      detail: { title: 'Copy failed', tone: 'danger', slot: 'copy' },
    });
  });
});

describe('D-083 a right-click on another host is not an outside dismissal', () => {
  it('D-083 a context pointerdown on a host keeps the open menu; a left click or empty space still dismisses', async () => {
    const { root, el } = await liveMenu();
    const { onPointerDownOutside } = copyMenu.readDom(root) as unknown as {
      onPointerDownOutside: (event: unknown) => void;
    };
    const outside = (target: Element, contextmenu: boolean) => {
      const event = { detail: { contextmenu, originalEvent: { target } }, preventDefault: vi.fn() };
      onPointerDownOutside(event);
      return event.preventDefault.mock.calls.length;
    };
    expect(outside(el('t2'), true)).toBe(1);
    expect(outside(el('t2'), false)).toBe(0);
    expect(outside(el('gap'), true)).toBe(0);
  });
});

describe('D-056 one Tab stop per host, focus returns to the host', () => {
  it('D-056 the menu adds no tab stop: only the hosts are tabbable', async () => {
    const { root } = await liveMenu();
    // The menu's own content takes focus while open; closed it is `hidden`, so not a stop.
    const stops = [...root.querySelectorAll('[tabindex="0"]')].filter((e) => !e.closest('[hidden]')).map((e) => e.id);
    expect(stops).toEqual(['t1', 't2', 'plain']);
  });

  it('D-056 Escape closes the menu and focus is back on the host that opened it', async () => {
    const { root, el, contextmenu, content } = await liveMenu();
    el('t2').focus();
    contextmenu(el('t2'));
    await until(() => !content().hidden);
    expect(root.contains(document.activeElement) && document.activeElement !== el('t2')).toBe(true);
    await new Promise((r) => setTimeout(r, 50)); // Zag arms its dismissal on the next frame
    content().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await until(() => content().hasAttribute('hidden'));
    await tick();
    expect(document.activeElement).toBe(el('t2'));
  });

  it('D-056 a selection closes the menu and focus is back on the host', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: () => Promise.resolve() } });
    const { el, contextmenu, content, items } = await liveMenu();
    el('t1').focus();
    contextmenu(el('t1'));
    await until(() => !content().hidden);
    items()[0]!.click();
    await until(() => content().hasAttribute('hidden'));
    await tick();
    expect(document.activeElement).toBe(el('t1'));
  });

  it('D-056 a close that moved focus on purpose is left alone', async () => {
    const { el, contextmenu, content } = await liveMenu();
    el('t1').focus();
    contextmenu(el('t1'));
    await until(() => !content().hidden);
    el('after').focus();
    await new Promise((r) => setTimeout(r, 50)); // Zag arms its dismissal on the next frame
    content().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await until(() => content().hasAttribute('hidden'));
    await tick();
    expect(document.activeElement).toBe(el('after'));
  });
});

describe('button mode', () => {
  it("D-131 a selection copies the item's own text and toasts its meaning", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    // jsdom has no ResizeObserver; the popper's autoUpdate needs one.
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    const seen = recordEvents();
    const { root } = place('', { context: false, texts: { identifier: 'ocx.sh/node:24' } });
    await start(root);
    root.querySelector<HTMLElement>('[data-part="trigger"]')!.click();
    await until(() => !root.querySelector<HTMLElement>('[data-part="content"]')!.hidden);
    root.querySelector<HTMLElement>('[data-part="item"][data-value="identifier"]')!.click();
    await until(() => seen.some((e) => e.type === 'ocx:toast'));
    expect(writeText).toHaveBeenCalledWith('ocx.sh/node:24');
    expect(seen.at(-1)).toEqual({
      type: 'ocx:toast',
      detail: { title: 'Copied — identifier', duration: 2000, slot: 'copy' },
    });
  });
});

describe('D-083 a menu asked for before the island is live', () => {
  it("D-083 is held, then opens at the same spot and copies the right host's text", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const seen = recordEvents();
    const { root } = place(HOSTS);
    let release: () => void = () => {};
    const loaded = new Promise<void>((r) => (release = r));
    const handle = mount(root, { load: () => loaded.then(() => copyMenu as unknown as ZagModule) });
    handles.push(handle);
    holdEarlyContextMenu(root, handle);
    const content = root.querySelector<HTMLElement>('[data-part="content"]')!;

    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 7, clientY: 9 });
    document.getElementById('t2')!.dispatchEvent(event);
    expect(event.defaultPrevented, 'the request is held, the browser menu does not show').toBe(true);
    expect(root.dataset['zagState']).toBe('loading');
    expect(content.hidden).toBe(true);

    release();
    await until(() => !content.hidden);
    root.querySelector<HTMLElement>('[data-part="item"][data-value="identifier"]')!.click();
    await until(() => seen.some((e) => e.type === 'ocx:toast'));
    expect(writeText).toHaveBeenCalledWith('ocx.sh/node:22');
  });

  it('D-083 a failed load is reported with console.warn, not an unhandled rejection', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { root } = place(HOSTS);
    const failure = new Error('chunk 404');
    holdEarlyContextMenu(root, { start: () => Promise.reject(failure) });
    document.getElementById('t1')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    await tick();
    expect(warn).toHaveBeenCalledWith('ocx-theme: the copy menu failed to load', failure);
  });

  it('D-083 empty space is not held: the browser menu shows and nothing loads', async () => {
    const { root } = place(HOSTS);
    const load = vi.fn(() => Promise.resolve(copyMenu as unknown as ZagModule));
    const handle = mount(root, { load });
    handles.push(handle);
    holdEarlyContextMenu(root, handle);
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    document.getElementById('gap')!.dispatchEvent(event);
    await tick();
    expect(event.defaultPrevented).toBe(false);
    expect(load).not.toHaveBeenCalled();
  });

  it('D-083 nothing loads at mount, on a hover over the container, or on a mouse press; focus on a host starts the load', async () => {
    const { root } = place(HOSTS);
    const load = vi.fn(() => Promise.resolve(copyMenu as unknown as ZagModule));
    const handle = mount(root, { load, trigger: 'manual' });
    handles.push(handle);
    holdEarlyContextMenu(root, handle);
    await tick();
    root.dispatchEvent(new Event('pointerenter'));
    document.getElementById('gap')!.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    document.getElementById('plain')!.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    const mouse = new MouseEvent('pointerdown', { bubbles: true });
    Object.defineProperty(mouse, 'pointerType', { value: 'mouse' });
    document.getElementById('t1')!.dispatchEvent(mouse);
    expect(load, 'hover, empty space, a host without data and a mouse press load nothing').not.toHaveBeenCalled();
    document.getElementById('t1')!.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    await until(() => root.dataset['zagState'] === 'live');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('D-083 a touch press on a host starts the load, and a second press does not load again', async () => {
    const { root } = place(HOSTS);
    const load = vi.fn(() => Promise.resolve(copyMenu as unknown as ZagModule));
    const handle = mount(root, { load, trigger: 'manual' });
    handles.push(handle);
    holdEarlyContextMenu(root, handle);
    const press = () => {
      const event = new MouseEvent('pointerdown', { bubbles: true });
      Object.defineProperty(event, 'pointerType', { value: 'touch' });
      document.getElementById('t2')!.dispatchEvent(event);
    };
    press();
    press();
    await until(() => root.dataset['zagState'] === 'live');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('D-083 a failed load from focus is reported with console.warn too', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { root } = place(HOSTS);
    const failure = new Error('chunk 404');
    holdEarlyContextMenu(root, { start: () => Promise.reject(failure) });
    document.getElementById('t1')!.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    await tick();
    expect(warn).toHaveBeenCalledWith('ocx-theme: the copy menu failed to load', failure);
  });

  it("D-083 once live, the early listener steps aside for the machine's own", async () => {
    const { root, el, contextmenu } = await liveMenu();
    holdEarlyContextMenu(root, { start: () => Promise.reject(new Error('must not start again')) });
    contextmenu(el('t1'));
    await until(() => !root.querySelector<HTMLElement>('[data-part="content"]')!.hidden);
  });
});
