// @vitest-environment jsdom
// The sidebar's one delegated controller (starlight/sidebar-controller.mjs): toggling, ARIA, the change event the
// persist script listens for, deferred links, and chrome.mjs's lazy wake. No Zag machine runs here.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { start } from '../src/starlight/sidebar-controller.mjs';

const group = (name: string, open: boolean, defer = '') =>
  `<li data-zag-root="collapsible" data-zag-state="idle"><button type="button" data-part="trigger" aria-expanded="${open}">${name}</button>` +
  `<ul data-part="content"${open ? '' : ' hidden'}${defer ? ` data-defer="${defer}" style="--n:1"` : ''}></ul></li>`;
const place = (...groups: string[]) => {
  document.body.innerHTML = `<div id="starlight__sidebar" data-frag="/docs/frag/sidebar/"><ul>${groups.join('')}</ul></div>`;
  return document.querySelector<HTMLElement>('#starlight__sidebar')!;
};
const parts = (i: number) => {
  const g = document.querySelectorAll<HTMLElement>('[data-zag-root]')[i]!;
  return { g, button: g.querySelector('button')!, list: g.querySelector<HTMLElement>('[data-part="content"]')! };
};
const settle = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => vi.restoreAllMocks());

describe('sidebar controller', () => {
  it('start() marks every group live', () => {
    start(place(group('A', false), group('B', true)));
    expect([...document.querySelectorAll<HTMLElement>('[data-zag-root]')].map((g) => g.dataset['zagState'])).toEqual([
      'live',
      'live',
    ]);
  });

  it('a click toggles hidden and aria-expanded both ways and keeps focus on the button', () => {
    start(place(group('A', false)));
    const { button, list } = parts(0);
    button.focus();
    button.click();
    expect([list.hidden, button.getAttribute('aria-expanded')]).toEqual([false, 'true']);
    button.click();
    expect([list.hidden, button.getAttribute('aria-expanded')]).toEqual([true, 'false']);
    expect(document.activeElement).toBe(button);
  });

  it('fires ocx:collapsible:change {open} on the group, bubbling to the sidebar', () => {
    const sidebar = place(group('A', false));
    start(sidebar);
    const seen: unknown[] = [];
    sidebar.addEventListener('ocx:collapsible:change', (e) =>
      seen.push([(e.target as HTMLElement).dataset['zagRoot'], (e as CustomEvent).detail]),
    );
    const { button } = parts(0);
    button.click();
    button.click();
    expect(seen).toEqual([
      ['collapsible', { open: true }],
      ['collapsible', { open: false }],
    ]);
  });

  it('a click on a link inside an open group toggles nothing', () => {
    const sidebar = place(group('A', true));
    start(sidebar);
    const { list } = parts(0);
    list.innerHTML = '<li><a href="#x">x</a></li>';
    list.querySelector('a')!.click();
    expect(list.hidden).toBe(false);
  });

  it('installs one listener per event type on the sidebar, however many groups there are', () => {
    const sidebar = place(group('A', false), group('B', false), group('C', true));
    const spy = vi.spyOn(sidebar, 'addEventListener');
    const others = vi.spyOn(HTMLElement.prototype, 'addEventListener');
    start(sidebar);
    expect(spy.mock.calls.map((c) => c[0]).sort()).toEqual(['click', 'focusin', 'pointerover', 'touchstart']);
    expect(others.mock.calls.filter((c) => c.length && !spy.mock.calls.some((s) => s[0] === c[0])).length).toBe(0);
  });

  it('a touch of a deferred group fetches its links; opening it later fetches nothing more', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response('<ul><li><a href="/c/">C</a></li></ul>')));
    window.fetch = fetchMock;
    start(place(group('A', false, 'k1')));
    const { button, list } = parts(0);
    button.dispatchEvent(new Event('focusin', { bubbles: true }));
    expect(list.getAttribute('aria-busy')).toBe('true');
    await settle();
    expect(list.querySelector('a[href="/c/"]')).not.toBeNull();
    button.click();
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('the group under the touch that loaded the controller prefetches at start: no second pointerover comes', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response('<ul><li><a href="/c/">C</a></li></ul>')));
    window.fetch = fetchMock;
    const sidebar = place(group('A', false, 'k1'), group('B', false, 'k2'));
    start(sidebar, [], parts(1).button);
    await settle();
    expect(parts(1).list.querySelector('a[href="/c/"]')).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('every group restored open fills at once, whichever event woke the controller', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response('<ul><li><a href="/c/">C</a></li></ul>')));
    window.fetch = fetchMock;
    start(place(group('A', true, 'k1'), group('B', false, 'k2'), group('C', true, 'k3')));
    await settle();
    expect(parts(0).list.querySelector('a[href="/c/"]')).not.toBeNull();
    expect(parts(2).list.querySelector('a[href="/c/"]')).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2); // the closed group B waits for a touch
  });

  it('a failed group is not refetched by hover or focus, only by an explicit open', async () => {
    const fetchMock = vi.fn(() => Promise.reject(new TypeError('offline')));
    window.fetch = fetchMock;
    start(place(group('A', false, 'k1')));
    const { button, list } = parts(0);
    button.dispatchEvent(new Event('pointerover', { bubbles: true }));
    await settle();
    expect(list.querySelectorAll('a')).toHaveLength(1);
    for (const type of ['pointerover', 'focusin', 'pointerover'])
      button.dispatchEvent(new Event(type, { bubbles: true }));
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(list.querySelectorAll('a')).toHaveLength(1);
    button.click();
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('hover over a loading or loaded group starts nothing more', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response('<ul><li><a href="/c/">C</a></li></ul>')));
    window.fetch = fetchMock;
    start(place(group('A', false, 'k1')));
    const { button } = parts(0);
    for (let i = 0; i < 3; i++) button.dispatchEvent(new Event('pointerover', { bubbles: true })); // while loading
    await settle();
    for (let i = 0; i < 3; i++) button.dispatchEvent(new Event('pointerover', { bubbles: true })); // loaded
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a failed fetch leaves "All pages" and the next open retries', async () => {
    window.fetch = vi.fn(() => Promise.reject(new TypeError('offline')));
    start(place(group('A', false, 'k1')));
    const { button, list } = parts(0);
    button.click();
    await settle();
    expect(list.querySelector('a')?.getAttribute('href')).toBe('/docs/frag/sidebar/_all/');
    expect(list.hasAttribute('aria-busy')).toBe(false);
    button.click();
    window.fetch = vi.fn(() => Promise.resolve(new Response('<ul><li><a href="/c/">C</a></li></ul>')));
    button.click();
    await settle();
    expect([...list.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual(['/c/']);
  });

  it('clicks that came before the controller was ready toggle on start, one per group', () => {
    const sidebar = place(group('A', false), group('B', false));
    start(sidebar, [parts(0).button, parts(1).button, parts(1).button]);
    expect([parts(0).list.hidden, parts(1).list.hidden]).toEqual([false, true]);
    expect(parts(1).button.getAttribute('aria-expanded')).toBe('false');
  });
});
