// @vitest-environment jsdom
// Deferred's loader (ui/deferred.mjs): fetch, adopt styles and wait for them, insert, re-create scripts,
// announce, fade; error keeps the box and Retry fetches again.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { start } from '../src/components/ui/deferred.mjs';

let n = 0;
const place = () => {
  const src = `/frag/t${++n}/`;
  document.body.innerHTML = `<div class="ocx-swap ocx-deferred" data-ocx-deferred data-src="${src}" data-state="idle" aria-busy="true" tabindex="-1">
    <div data-swap-skeleton aria-hidden="true"></div>
    <div data-deferred-content role="group"></div>
    <div data-deferred-error hidden><p>no</p><button data-deferred-retry>Retry</button></div></div>`;
  const root = document.querySelector<HTMLElement>('[data-ocx-deferred]')!;
  return { root, src, content: root.querySelector<HTMLElement>('[data-deferred-content]')! };
};
const answer = (html: string | number) =>
  vi.fn(() => Promise.resolve(typeof html === 'number' ? new Response('x', { status: html }) : new Response(html)));
const settle = () => new Promise((r) => setTimeout(r, 0));
/** Fires `load` on every stylesheet link the loader added that has not reported yet. */
const sheetsLoad = () => {
  for (const link of document.head.querySelectorAll<HTMLLinkElement>('link[data-added]:not([data-fired])')) {
    link.setAttribute('data-fired', '');
    link.dispatchEvent(new Event('load'));
  }
};
const tag = () =>
  new MutationObserver((records) => {
    for (const r of records)
      for (const el of r.addedNodes) if (el instanceof HTMLLinkElement) el.setAttribute('data-added', '');
  }).observe(document.head, { childList: true });

beforeEach(() => {
  document.head.innerHTML = '';
  tag();
});
afterEach(() => {
  vi.restoreAllMocks();
});

const FRAGMENT = `<!doctype html><html><head><style>.f{color:red}</style><link rel="stylesheet" href="/s/a.css"></head>
<body><p id="p">hi</p><script>window.__ran = (window.__ran || 0) + 1;</script><script type="application/json" id="d">{"a":1}</script></body></html>`;

describe('Deferred loader', () => {
  it('a second box that needs a stylesheet the first is still loading waits for it too', async () => {
    const a = place();
    const first = a.content;
    const rootA = a.root;
    const srcA = a.src;
    window.fetch = answer(FRAGMENT);
    rootA.dataset['src'] = srcA;
    start(rootA);
    await settle();
    // A second box in the same document, started while the sheet is in flight.
    const box = rootA.cloneNode(true) as HTMLElement;
    box.removeAttribute('data-loaded');
    document.body.append(box);
    const second = box.querySelector<HTMLElement>('[data-deferred-content]')!;
    start(box);
    await settle();
    expect(second.querySelector('#p')).toBeNull();
    sheetsLoad();
    await settle();
    expect(first.querySelector('#p')?.textContent).toBe('hi');
    expect(second.querySelector('#p')?.textContent).toBe('hi');
  });

  it('waits for the stylesheet, inserts the body, announces, then marks the box loaded', async () => {
    const { root, src, content } = place();
    window.fetch = answer(FRAGMENT);
    const heard: string[] = [];
    document.addEventListener('ocx:inserted', (e) =>
      heard.push((e.target as HTMLElement).dataset['deferredContent'] ?? 'x'),
    );
    root.dataset['src'] = src;
    start(root);
    await settle();
    expect(content.querySelector('#p')).toBeNull(); // sheet still loading
    expect(root.hasAttribute('data-loaded')).toBe(false);
    sheetsLoad();
    await settle();
    expect(content.querySelector('#p')?.textContent).toBe('hi');
    expect(root.hasAttribute('data-loaded')).toBe(true);
    expect(root.dataset['state']).toBe('loaded');
    expect(root.hasAttribute('aria-busy')).toBe(false);
    expect(heard).toEqual(['']);
    expect(document.head.querySelectorAll('link[href$="/s/a.css"]')).toHaveLength(1);
    expect(document.head.querySelectorAll('style')).toHaveLength(1);
    expect(content.querySelector('script[type="application/json"]')).not.toBeNull();
    expect(content.querySelectorAll('link, style')).toHaveLength(0); // adopted into the head, not left in the body
  });

  // jsdom here does not execute scripts, so "runs again" is shown by a fresh script element per load,
  // created by the page's document (a parsed one never runs); the e2e spec covers real execution.
  it('puts a fresh classic inline script in every load, and adds no sheet or style the page has', async () => {
    window.fetch = answer(FRAGMENT);
    const a = place();
    start(a.root);
    await settle();
    sheetsLoad();
    await settle();
    const first = a.content.querySelector('script:not([type])');
    expect(first?.textContent).toContain('__ran');
    expect(first?.ownerDocument).toBe(document);
    const b = place();
    start(b.root);
    await settle();
    sheetsLoad();
    await settle();
    expect(b.content.querySelector('script:not([type])')?.textContent).toContain('__ran');
    expect(document.head.querySelectorAll('link[href$="/s/a.css"]')).toHaveLength(1);
    expect(document.head.querySelectorAll('style')).toHaveLength(1);
  });

  it('skips a module src the page already runs and an inline module with the same text', async () => {
    document.head.innerHTML =
      '<script type="module" src="/m/page.js"></script><script type="module">const k = 1;</script>';
    window.fetch = answer(
      '<html><head><script type="module" src="/m/page.js"></script></head><body><script type="module" src="/m/new.js"></script><script type="module">const k = 1;</script><script type="module">const z = 2;</script></body></html>',
    );
    const { root, content } = place();
    start(root);
    await settle();
    expect(root.dataset['state']).toBe('loaded');
    expect(content.querySelectorAll('script[src$="/m/page.js"]')).toHaveLength(0);
    expect(content.querySelectorAll('script[src$="/m/new.js"]')).toHaveLength(1);
    expect([...content.querySelectorAll('script:not([src])')].map((s) => s.textContent)).toEqual(['const z = 2;']);
    expect(document.head.querySelectorAll('script[src$="/m/page.js"]')).toHaveLength(1);
  });

  it('keeps the box on failure, shows the error, and Retry fetches again', async () => {
    const { root, content } = place();
    window.fetch = answer(500);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const done: boolean[] = [];
    root.addEventListener('ocx:deferred:load', (e) => done.push((e as CustomEvent<{ ok: boolean }>).detail.ok));
    start(root);
    await settle();
    expect(root.dataset['state']).toBe('error');
    expect(root.querySelector<HTMLElement>('[data-deferred-error]')?.hidden).toBe(false);
    expect(root.hasAttribute('aria-busy')).toBe(false);
    expect(root.hasAttribute('data-loaded')).toBe(false);
    window.fetch = answer('<html><body><p id="p">back</p></body></html>');
    root.querySelector<HTMLButtonElement>('[data-deferred-retry]')!.click();
    await settle();
    expect(root.dataset['state']).toBe('loaded');
    expect(root.querySelector<HTMLElement>('[data-deferred-error]')?.hidden).toBe(true);
    expect(content.querySelector('#p')?.textContent).toBe('back');
    expect(done).toEqual([false, true]);
  });

  it('a stylesheet that errors fails the load, is removed, and Retry asks for it again', async () => {
    const { root, content } = place();
    window.fetch = answer(FRAGMENT);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    start(root);
    await settle();
    document.head.querySelector('link[href$="/s/a.css"]')!.dispatchEvent(new Event('error'));
    await settle();
    expect(root.dataset['state']).toBe('error');
    expect(root.querySelector<HTMLElement>('[data-deferred-error]')?.hidden).toBe(false);
    expect(content.querySelector('#p')).toBeNull();
    expect(document.head.querySelectorAll('link[href$="/s/a.css"]')).toHaveLength(0);
    root.querySelector<HTMLButtonElement>('[data-deferred-retry]')!.click();
    await settle();
    expect(document.head.querySelectorAll('link[href$="/s/a.css"]')).toHaveLength(1);
    sheetsLoad();
    await settle();
    expect(root.dataset['state']).toBe('loaded');
    expect(content.querySelector('#p')?.textContent).toBe('hi');
  });

  it('a stylesheet still pending after 10 s no longer holds the content back, and stays in the head', async () => {
    vi.useFakeTimers();
    try {
      const { root, content } = place();
      window.fetch = answer(FRAGMENT);
      start(root);
      await vi.advanceTimersByTimeAsync(9_999);
      expect(content.querySelector('#p')).toBeNull();
      await vi.advanceTimersByTimeAsync(1);
      expect(content.querySelector('#p')?.textContent).toBe('hi');
      expect(root.dataset['state']).toBe('loaded');
      expect(document.head.querySelectorAll('link[href$="/s/a.css"]')).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a request that times out shows the error state', async () => {
    const { root } = place();
    const timeout = new AbortController();
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeout.signal);
    window.fetch = vi.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_, reject) =>
          init?.signal?.addEventListener('abort', () => reject(new DOMException('timed out', 'TimeoutError'))),
        ),
    );
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    start(root);
    await settle();
    expect(root.dataset['state']).toBe('loading');
    timeout.abort();
    await settle();
    expect(root.dataset['state']).toBe('error');
    expect(root.querySelector<HTMLElement>('[data-deferred-error]')?.hidden).toBe(false);
  });

  it.each([
    ['an empty file', ''],
    ['plain text', 'Service unavailable'],
    ['a document without a body element', '<!doctype html><html><head><title>x</title></head></html>'],
  ])('%s is a failed load, not a blank box', async (_, body) => {
    const { root, content } = place();
    window.fetch = answer(body);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    start(root);
    await settle();
    expect(root.dataset['state']).toBe('error');
    expect(root.querySelector<HTMLElement>('[data-deferred-error]')?.hidden).toBe(false);
    expect(content.childNodes).toHaveLength(0);
  });

  it('an empty 200 is not kept: Retry fetches again and shows the valid fragment', async () => {
    const { root, content } = place();
    const fetchMock = answer('');
    window.fetch = fetchMock;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    start(root);
    await settle();
    expect(root.dataset['state']).toBe('error');
    const good = answer('<html><body><p id="p">back</p></body></html>');
    window.fetch = good;
    root.querySelector<HTMLButtonElement>('[data-deferred-retry]')!.click();
    await settle();
    expect(root.dataset['state']).toBe('loaded');
    expect(content.querySelector('#p')?.textContent).toBe('back');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);
  });

  it('loading the same fragment into a box again replaces its content, not appends', async () => {
    const { root, content } = place();
    window.fetch = answer('<html><body><p id="p">once</p></body></html>');
    start(root);
    await settle();
    start(root);
    await settle();
    expect(content.querySelectorAll('#p')).toHaveLength(1);
  });

  it('drops a script or stylesheet from another origin, and resolves a relative script against the fragment', async () => {
    const { root, content } = place();
    window.fetch = answer(
      `<html><head><link rel="stylesheet" href="https://evil.example/x.css"></head><body><p id="p">hi</p>
      <script type="module" src="https://evil.example/x.js"></script><script type="module" src="rel.js"></script></body></html>`,
    );
    start(root);
    await settle();
    expect(root.dataset['state']).toBe('loaded');
    expect(document.head.querySelector('link[href*="evil.example"]')).toBeNull();
    expect(content.querySelector('script[src*="evil.example"]')).toBeNull();
    const rel = content.querySelector<HTMLScriptElement>('script[src$="rel.js"]');
    expect(new URL(rel!.src).pathname).toMatch(/^\/frag\/t\d+\/rel\.js$/);
  });
});
