// @vitest-environment jsdom
// The lazy Pagefind skin (starlight/search-skin.mjs): both sheets once, resolved when loaded or capped, and a
// failed request is forgotten so the next open tries again.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let failures = 0;
// The module is cached after its first evaluation, so the failure is a read of its export.
vi.mock('@pagefind/default-ui/css/ui.css?url', () => ({
  get default() {
    if (failures-- > 0) throw new Error('chunk failed');
    return '/pagefind-ui.css';
  },
}));

const sheets = () => [...document.head.querySelectorAll('style, link')] as (HTMLStyleElement | HTMLLinkElement)[];
const flush = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  document.head.innerHTML = '';
  failures = 0;
  vi.useFakeTimers();
  vi.resetModules();
});
afterEach(() => vi.useRealTimers());

const fresh = async () => (await import('../src/starlight/search-skin.mjs')).loadSkin;

describe('loadSkin', () => {
  it('adds the UI sheet (an @import into starlight.core) and the skin once, and resolves when both have loaded', async () => {
    const loadSkin = await fresh();
    let done = false;
    void loadSkin().then(() => (done = true));
    await flush();
    const [base, link] = sheets() as [HTMLStyleElement, HTMLLinkElement];
    expect(base.textContent).toBe('@import url("/pagefind-ui.css") layer(starlight.core);');
    expect(link.href).toContain('search-results.css');
    base.dispatchEvent(new Event('load'));
    await flush();
    expect(done).toBe(false);
    link.dispatchEvent(new Event('load'));
    await flush();
    expect(done).toBe(true);
  });

  it('a second call adds nothing', async () => {
    const loadSkin = await fresh();
    const first = loadSkin();
    await flush();
    expect(loadSkin()).toBe(first);
    expect(sheets()).toHaveLength(2);
  });

  it('gives up waiting after 3 s: an unskinned UI beats none', async () => {
    const loadSkin = await fresh();
    let done = false;
    void loadSkin().then(() => (done = true));
    await flush();
    await vi.advanceTimersByTimeAsync(2999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
  });

  it('a rejected request is not kept: the next call tries again', async () => {
    vi.useRealTimers();
    const loadSkin = await fresh();
    failures = 1;
    const first = loadSkin();
    await expect(first).rejects.toThrow('chunk failed');
    const second = loadSkin();
    expect(second).not.toBe(first);
    await vi.waitFor(() => expect(sheets()).toHaveLength(2));
    for (const el of sheets()) el.dispatchEvent(new Event('load'));
    await expect(second).resolves.toBeDefined();
  });
});
