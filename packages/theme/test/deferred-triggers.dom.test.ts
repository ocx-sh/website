// @vitest-environment jsdom
// Deferred's `input` and `panel` triggers (ui/deferred-triggers.mjs). The module keeps the first-input state for the
// page, so each test imports a fresh copy.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fresh = async () => import('../src/components/ui/deferred-triggers.mjs');
const fire = (type: string, extra: Record<string, unknown> = {}) =>
  window.dispatchEvent(Object.assign(new Event(type, { bubbles: true }), extra));
const box = (html: string) => {
  document.body.innerHTML = html;
  return document.querySelector<HTMLElement>('[data-ocx-deferred]')!;
};

beforeEach(() => {
  vi.resetModules();
  document.body.innerHTML = '';
});

describe('whenInput', () => {
  it.each(['wheel', 'keydown', 'pointerdown', 'touchstart', 'focusin'])(
    '%s starts every waiting box, once',
    async (type) => {
      const { whenInput } = await fresh();
      const a = vi.fn();
      const b = vi.fn();
      whenInput(a);
      whenInput(b);
      fire(type);
      fire(type);
      expect([a.mock.calls.length, b.mock.calls.length]).toEqual([1, 1]);
    },
  );

  it('a pointermove without movement is ignored, one with movement starts', async () => {
    const { whenInput } = await fresh();
    const start = vi.fn();
    whenInput(start);
    fire('pointermove', { movementX: 0, movementY: 0 });
    expect(start).not.toHaveBeenCalled();
    fire('pointermove', { movementX: 0, movementY: -2 });
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('the listeners are gone after the first input', async () => {
    const { whenInput } = await fresh();
    const remove = vi.spyOn(window, 'removeEventListener');
    whenInput(() => {});
    fire('keydown');
    expect(remove.mock.calls.map(([type]) => type).sort()).toEqual(
      ['focusin', 'keydown', 'pointerdown', 'pointermove', 'touchstart', 'wheel'].sort(),
    );
  });

  it('a box that arrives after the first input starts at once, without adding listeners', async () => {
    const { whenInput } = await fresh();
    whenInput(() => {});
    fire('wheel');
    const add = vi.spyOn(window, 'addEventListener');
    const late = vi.fn();
    whenInput(late);
    expect(late).toHaveBeenCalledTimes(1);
    expect(add).not.toHaveBeenCalled();
  });

  it('nothing starts before an input', async () => {
    const { whenInput } = await fresh();
    const start = vi.fn();
    whenInput(start);
    fire('scroll');
    fire('pointerover');
    expect(start).not.toHaveBeenCalled();
  });
});

describe('whenShown', () => {
  it('waits for a hidden panel to be shown, then starts once', async () => {
    const { whenShown } = await fresh();
    const root = box('<div role="tabpanel" hidden><div data-ocx-deferred data-trigger="panel"></div></div>');
    const panel = root.parentElement!;
    const start = vi.fn();
    whenShown(panel, start);
    expect(start).not.toHaveBeenCalled();
    panel.hidden = false;
    await new Promise((r) => setTimeout(r, 0));
    panel.hidden = true;
    panel.hidden = false;
    await new Promise((r) => setTimeout(r, 0));
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('a panel that is already visible starts at once', async () => {
    const { whenShown } = await fresh();
    const start = vi.fn();
    const panel = document.createElement('div');
    whenShown(panel, start);
    expect(start).toHaveBeenCalledTimes(1);
  });
});

describe('whenIdle', () => {
  const readyState = (value: string) =>
    Object.defineProperty(document, 'readyState', { configurable: true, get: () => value });
  afterEach(() => {
    delete (document as { readyState?: string }).readyState;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('starts after the load event, in the idle slot, not before', async () => {
    vi.stubGlobal('requestIdleCallback', (cb: () => void) => setTimeout(cb, 0));
    vi.useFakeTimers();
    readyState('loading');
    const { whenIdle } = await fresh();
    const start = vi.fn();
    whenIdle(start);
    vi.advanceTimersByTime(50);
    expect(start).not.toHaveBeenCalled();
    window.dispatchEvent(new Event('load'));
    expect(start).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(start).toHaveBeenCalledTimes(1);
    fire('keydown');
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('an input before load starts it at once, once', async () => {
    readyState('loading');
    const { whenIdle } = await fresh();
    const start = vi.fn();
    whenIdle(start);
    fire('keydown');
    fire('pointerover');
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('a page that has already loaded starts in the idle slot', async () => {
    vi.useFakeTimers();
    readyState('complete');
    vi.stubGlobal('requestIdleCallback', undefined);
    const { whenIdle } = await fresh();
    const start = vi.fn();
    whenIdle(start);
    expect(start).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(start).toHaveBeenCalledTimes(1);
  });
});

describe('arm', () => {
  it('`input` waits for the first input; `panel` in a visible tabpanel starts at once', async () => {
    const { arm } = await fresh();
    const input = box('<div data-ocx-deferred data-trigger="input"></div>');
    const a = vi.fn();
    arm(input, a);
    expect(a).not.toHaveBeenCalled();
    fire('wheel');
    expect(a).toHaveBeenCalledTimes(1);
    const inPanel = box('<div role="tabpanel"><div data-ocx-deferred data-trigger="panel"></div></div>');
    const b = vi.fn();
    arm(inPanel, b);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('`panel` outside a tabpanel acts as idle', async () => {
    const { arm } = await fresh();
    const root = box('<div data-ocx-deferred data-trigger="panel"></div>');
    const start = vi.fn();
    arm(root, start);
    fire('wheel'); // not the input trigger
    expect(start).not.toHaveBeenCalled();
    fire('keydown'); // an idle box's early start
    expect(start).toHaveBeenCalledTimes(1);
  });
});

describe('loader', () => {
  it('a failed import of the loader shows the error block, and Retry reloads the page', async () => {
    vi.doMock('../src/components/ui/deferred.mjs', () => {
      throw new Error('chunk 404');
    });
    const { loader } = await fresh();
    const root = box(`<div data-ocx-deferred data-state="loading" aria-busy="true" tabindex="-1">
      <div data-deferred-error hidden><button data-deferred-retry>Retry</button></div></div>`);
    const reload = vi.fn();
    await expect(loader(root, reload)()).rejects.toThrow();
    expect(root.dataset['state']).toBe('error');
    expect(root.hasAttribute('aria-busy')).toBe(false);
    expect(root.querySelector<HTMLElement>('[data-deferred-error]')?.hidden).toBe(false);
    root.querySelector<HTMLButtonElement>('[data-deferred-retry]')!.click();
    expect(reload).toHaveBeenCalledTimes(1);
    vi.doUnmock('../src/components/ui/deferred.mjs');
  });
});
