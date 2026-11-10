// @vitest-environment jsdom
// A deferred sidebar group fetches its links (components/ui/deferred-group.mjs, run by the sidebar controller on a touch
// and on opening); a failed fetch leaves one visible way on instead of a blank open group.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fillDeferred } from '../src/components/ui/deferred-group.mjs';
import { start } from '../src/starlight/sidebar-controller.mjs';

const place = () => {
  document.body.innerHTML = `<div data-frag="/docs/frag/sidebar/"><ul>
    <li data-zag-root="collapsible"><button data-part="trigger" aria-expanded="false">Away</button><ul data-part="content" hidden data-defer="k1" style="--n:2"></ul></li></ul></div>`;
  const root = document.querySelector<HTMLElement>('[data-zag-root]')!;
  return { root, list: root.querySelector<HTMLElement>('[data-defer]')! };
};
const settle = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => vi.restoreAllMocks());

describe('fillDeferred', () => {
  it('inserts the fragment list items, and is busy until they are there', async () => {
    const { root, list } = place();
    const fetchMock = vi.fn(() => Promise.resolve(new Response('<html><body><ul><li><a href="/c/">C</a></li></ul>')));
    window.fetch = fetchMock;
    fillDeferred(root)();
    expect(list.getAttribute('aria-busy')).toBe('true');
    await settle();
    expect(list.querySelector('a[href="/c/"]')).not.toBeNull();
    expect(list.hasAttribute('aria-busy')).toBe(false);
    expect(list.hasAttribute('data-defer')).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/docs/frag/sidebar/k1/' }),
      expect.anything(),
    );
  });

  it.each([
    ['a rejected fetch', () => Promise.reject(new TypeError('offline'))],
    ['a 500', () => Promise.resolve(new Response('x', { status: 500 }))],
  ])('%s leaves one visible "All pages" link, not a blank group', async (_, answer) => {
    const { root, list } = place();
    window.fetch = vi.fn(answer);
    fillDeferred(root)();
    await settle();
    const links = list.querySelectorAll('a');
    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute('href')).toBe('/docs/frag/sidebar/_all/');
    expect(links[0]?.textContent).toBe('All pages');
    expect(list.hasAttribute('data-defer')).toBe(true); // the next open fetches again
    expect(list.hasAttribute('data-failed')).toBe(true); // and no height is reserved
    expect(list.hasAttribute('aria-busy')).toBe(false);
  });

  it('a failed group fetches again on the next open and the links replace the fallback', async () => {
    const { root, list } = place();
    const fetchMock = vi.fn(() => Promise.reject(new TypeError('offline')));
    window.fetch = fetchMock;
    const sidebar = root.closest<HTMLElement>('[data-frag]')!;
    start(sidebar);
    root.dispatchEvent(new Event('pointerover', { bubbles: true }));
    await settle();
    expect(list.querySelectorAll('a')).toHaveLength(1);
    const button = root.querySelector('button')!;
    button.click(); // opens: fetches again, and fails again
    await settle();
    button.click(); // closes
    expect(fetchMock).toHaveBeenCalledTimes(2); // closing fetches nothing
    window.fetch = vi.fn(() => Promise.resolve(new Response('<ul><li><a href="/c/">C</a></li></ul>')));
    button.click();
    await settle();
    expect([...list.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual(['/c/']);
    expect(list.hasAttribute('data-defer')).toBe(false);
    expect(list.hasAttribute('data-failed')).toBe(false);
  });

  it('a group without data-defer, or outside a sidebar with data-frag, fetches nothing', () => {
    const { root, list } = place();
    const fetchMock = vi.fn();
    window.fetch = fetchMock;
    list.removeAttribute('data-defer');
    fillDeferred(root)();
    root.closest('[data-frag]')?.removeAttribute('data-frag');
    list.setAttribute('data-defer', 'k1');
    fillDeferred(root)();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
