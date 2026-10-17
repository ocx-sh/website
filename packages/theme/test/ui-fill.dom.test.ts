// @vitest-environment jsdom
// fill.mjs (the `src` prop of Popover and Hint): fetch only on an open, loading and error states, Retry,
// a cache shared by URL, a refusal of a cross-origin fragment, events.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fillOnOpen } from '../src/components/ui/fill.mjs';
import { render } from '../src/components/ui/popover.zag.mjs';
import { render as renderHint } from '../src/components/ui/tooltip.zag.mjs';

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();
const ok = (body: string) => Promise.resolve(new Response(body, { status: 200 }));
const flush = () => new Promise((r) => setTimeout(r, 0));

const popover = (src: string) => {
  document.body.innerHTML = `<div class="ocx-ui-popover" data-fill-src="${src}"><div data-part="content" tabindex="-1"><div data-fill data-fill-state="idle"><div data-fill-loading>…</div><div data-fill-error><p>bad</p><button data-fill-retry>Retry</button></div></div></div></div>`;
  const root = document.querySelector<HTMLElement>('.ocx-ui-popover')!;
  const region = root.querySelector<HTMLElement>('[data-fill]')!;
  const events: unknown[] = [];
  root.addEventListener('ocx:popover:fill', (e) => events.push((e as CustomEvent).detail));
  return { root, region, events };
};
const hint = (src: string) => {
  document.body.innerHTML = `<span class="ocx-ui-hint" data-fill-src="${src}"><span data-part="content">label</span></span>`;
  const root = document.querySelector<HTMLElement>('.ocx-ui-hint')!;
  const events: unknown[] = [];
  root.addEventListener('ocx:hint:fill', (e) => events.push((e as CustomEvent).detail));
  return { root, content: root.querySelector('[data-part="content"]')!, events };
};

let n = 0;
// A fresh URL per test: the cache lives for the module's life, like a page's.
const url = () => `/fill/${++n}.html`;

beforeEach(() => {
  fetchMock.mockReset();
  Object.defineProperty(window, 'fetch', { value: fetchMock, configurable: true });
});

describe('fillOnOpen, popover', () => {
  it('fetches nothing on a close, or from a root without src', async () => {
    const { root } = popover(url());
    fillOnOpen(root, 'popover', false);
    fillOnOpen(document.createElement('div'), 'popover', true);
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('the first open loads: aria-busy and state loading, then the fragment replaces the region', async () => {
    fetchMock.mockImplementation(() => ok('<p>1.4.2</p>'));
    const { root, region, events } = popover(url());
    fillOnOpen(root, 'popover', true);
    expect(region.dataset['fillState']).toBe('loading');
    expect(region.getAttribute('aria-busy')).toBe('true');
    await flush();
    expect(region.dataset['fillState']).toBe('ready');
    expect(region.hasAttribute('aria-busy')).toBe(false);
    expect(region.innerHTML).toBe('<p>1.4.2</p>');
    expect(events).toEqual([{ ok: true }]);
  });

  it('a second open (or an open while loading) makes no second request', async () => {
    fetchMock.mockImplementation(() => ok('x'));
    const { root } = popover(url());
    fillOnOpen(root, 'popover', true);
    fillOnOpen(root, 'popover', true);
    await flush();
    fillOnOpen(root, 'popover', true);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a second popover with the same src reuses the cached result', async () => {
    fetchMock.mockImplementation(() => ok('shared'));
    const src = url();
    fillOnOpen(popover(src).root, 'popover', true);
    await flush();
    const second = popover(src);
    fillOnOpen(second.root, 'popover', true);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second.region.textContent).toBe('shared');
  });

  it('a failed response shows the error state; Retry fetches again and recovers', async () => {
    fetchMock.mockImplementationOnce(() => Promise.resolve(new Response('no', { status: 404 })));
    const { root, region, events } = popover(url());
    fillOnOpen(root, 'popover', true);
    await flush();
    expect(region.dataset['fillState']).toBe('error');
    expect(region.hasAttribute('aria-busy')).toBe(false);
    expect(events).toEqual([{ ok: false }]);
    fetchMock.mockImplementationOnce(() => ok('<b>back</b>'));
    region.querySelector<HTMLButtonElement>('[data-fill-retry]')!.click();
    expect(region.dataset['fillState']).toBe('loading');
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(region.dataset['fillState']).toBe('ready');
    expect(region.innerHTML).toBe('<b>back</b>');
    expect(events).toEqual([{ ok: false }, { ok: true }]);
  });

  it('a network error is the error state too', async () => {
    fetchMock.mockImplementation(() => Promise.reject(new TypeError('offline')));
    const { root, region } = popover(url());
    fillOnOpen(root, 'popover', true);
    await flush();
    expect(region.dataset['fillState']).toBe('error');
  });

  it('refuses a fragment from another origin without requesting it', async () => {
    const { root, region } = popover('https://evil.example/x.html');
    fillOnOpen(root, 'popover', true);
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(region.dataset['fillState']).toBe('error');
  });
});

describe('fillOnOpen, popover edge cases', () => {
  it('never inserts a text result a Hint cached from another origin', async () => {
    fetchMock.mockImplementation(() => ok('<img src=x onerror=alert(1)>'));
    const src = 'https://other.example/frag.html';
    fillOnOpen(hint(src).root, 'hint', true);
    await flush();
    const { root, region } = popover(src);
    fillOnOpen(root, 'popover', true);
    await flush();
    expect(region.dataset['fillState']).toBe('error');
    expect(region.querySelector('img')).toBeNull();
  });

  it('a malformed src is the error state, and a Hint tries again', async () => {
    const { root, region } = popover('https://[');
    fillOnOpen(root, 'popover', true);
    await flush();
    expect(region.dataset['fillState']).toBe('error');
    const h = hint('https://[');
    fillOnOpen(h.root, 'hint', true);
    await flush();
    expect(h.root.dataset['fillState']).toBeUndefined();
  });

  it('a request that never answers is aborted by its signal and ends in the error state', async () => {
    const ctl = new AbortController();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(ctl.signal);
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_, reject) => init!.signal!.addEventListener('abort', () => reject(new Error('aborted')))),
    );
    const { root, region } = popover(url());
    fillOnOpen(root, 'popover', true);
    expect(timeout).toHaveBeenCalledWith(10_000);
    await flush();
    expect(region.dataset['fillState']).toBe('loading');
    ctl.abort();
    await flush();
    expect(region.dataset['fillState']).toBe('error');
    timeout.mockRestore();
  });

  it('Retry keeps the focus in the panel', async () => {
    fetchMock.mockImplementationOnce(() => Promise.reject(new TypeError('offline')));
    const { root, region } = popover(url());
    fillOnOpen(root, 'popover', true);
    await flush();
    fetchMock.mockImplementationOnce(() => ok('<b>back</b>'));
    const retry = region.querySelector<HTMLButtonElement>('[data-fill-retry]')!;
    retry.focus();
    retry.click();
    expect(document.activeElement).toBe(root.querySelector('[data-part="content"]'));
    await flush();
    expect(document.activeElement).toBe(root.querySelector('[data-part="content"]'));
  });

  it('a panel that renders open fills once, and an error is not refetched by a later render', async () => {
    fetchMock.mockImplementation(() => Promise.reject(new TypeError('offline')));
    const { root, region } = popover(url());
    const api = {
      open: true,
      getTriggerProps: () => ({}),
      getPositionerProps: () => ({}),
      getContentProps: () => ({}),
    };
    render(api as never, root, () => {});
    render(api as never, root, () => {});
    await flush();
    render(api as never, root, () => {});
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(region.dataset['fillState']).toBe('error');
  });
});

describe('fillOnOpen, hint', () => {
  it('the first show replaces the label with the fetched text, once', async () => {
    fetchMock.mockImplementation(() => ok(' Released 12 Oct\n'));
    const { root, content, events } = hint(url());
    fillOnOpen(root, 'hint', true);
    fillOnOpen(root, 'hint', true);
    await flush();
    fillOnOpen(root, 'hint', true);
    expect(content.textContent).toBe('Released 12 Oct');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(events).toEqual([{ ok: true }]);
  });

  it('keeps the label on failure and tries again on the next show', async () => {
    fetchMock.mockImplementationOnce(() => Promise.reject(new TypeError('offline')));
    const { root, content, events } = hint(url());
    fillOnOpen(root, 'hint', true);
    await flush();
    expect(content.textContent).toBe('label');
    expect(events).toEqual([{ ok: false }]);
    fetchMock.mockImplementationOnce(() => ok('later'));
    fillOnOpen(root, 'hint', true);
    await flush();
    expect(content.textContent).toBe('later');
  });

  it('a hint that renders open fills once, and a later render does not refetch', async () => {
    fetchMock.mockImplementation(() => ok('fetched'));
    const { root, content } = hint(url());
    const api = {
      open: true,
      getTriggerProps: () => ({}),
      getPositionerProps: () => ({}),
      getContentProps: () => ({}),
      setOpen: () => {},
    };
    renderHint(api as never, root, () => {});
    renderHint(api as never, root, () => {});
    await flush();
    expect(content.textContent).toBe('fetched');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
