// Scroll-spy table of contents on Zag `toc` (C-201). The only `trigger: 'visible'` component
// (D-Z11): it must act without input, so Toc.astro mounts it when it scrolls into view.
import { connect, machine } from '@zag-js/toc';
import { probe } from './toc-probe.mjs';
import { emit } from './ui/zag-runtime.mjs';

export { connect, machine };

/** @typedef {import('@zag-js/toc').Api} Api */

/**
 * Root → its latest api and the last id the spy emitted, so the one scroll listener installed per
 * root always reads current state.
 * @type {WeakMap<HTMLElement, { api: Api, id?: string | undefined }>}
 */
const spy = new WeakMap();

/**
 * Spreads the api onto the SSR items and links, the only parts that change: root, title and list
 * carry ids alone (the root's rect vars feed an indicator part this Toc does not render).
 * ponytail: spread root/title/list too if an indicator part is ever added.
 * @param {Api} api
 * @param {HTMLElement} root
 * @param {(el: Element, attrs: Record<string, unknown>) => void} spread
 */
export function render(api, root, spread) {
  const items = root.querySelectorAll('[data-part="item"]');
  api.items.forEach((item, i) => {
    const el = items[i];
    const link = el?.firstElementChild;
    if (el) spread(el, api.getItemProps({ item }));
    if (link) spread(link, api.getLinkProps({ item }));
  });
  watchTail(api, root);
}

/**
 * The IntersectionObserver machine only sets `activeIds` from headings intersecting its shrunk
 * root, so a short last section (or several) never lights: the previous entry stays. This spy
 * replaces it with `probe`: a line just under where a jump lands a heading (`scroll-padding-top`,
 * the sticky header on a Starlight page) that slides to the viewport bottom over the final screen
 * of scroll, so every entry, the last included, is reached in order, and the `location.hash`
 * target stays active while the view sits where the jump put it. It runs after every state change
 * (an IO callback, landing after the scroll event, cannot undo it), once on wire-up (page opened
 * at the bottom), and on scroll/resize (rAF-throttled).
 * `ocx:toc:change` fires here, once per change of the probe's pick, not from the machine's
 * `onActiveChange` (the IO's transient set).
 * ponytail: ignores the machine's `rootMargin` prop; the probe decides alone.
 * @param {Api} api
 * @param {HTMLElement} root
 */
function watchTail(api, root) {
  spy.set(root, { ...spy.get(root), api });
  const check = () => {
    const cur = spy.get(root);
    if (!cur) return;
    const { items, activeIds } = cur.api;
    const doc = root.ownerDocument;
    const i = probe(
      items.map(({ value }) => doc.getElementById(value)?.getBoundingClientRect().top ?? Infinity),
      parseFloat(getComputedStyle(doc.documentElement).scrollPaddingTop) || 0,
      window.innerHeight,
      doc.documentElement.scrollHeight,
      window.scrollY,
      [...root.querySelectorAll('a')].findIndex((a) => a.hash === location.hash),
    );
    const id = items[i]?.value;
    const next = id === undefined ? [] : [id];
    if (activeIds.length !== next.length || activeIds.some((v, k) => v !== next[k])) cur.api.setActiveIds(next);
    if (id !== cur.id) emit(root, 'toc', 'change', { value: next });
    cur.id = id;
  };
  // Deferred: render runs inside the machine's change notification (and first before it starts).
  queueMicrotask(check);
  if (root.dataset.tocTailWatched) return;
  root.dataset.tocTailWatched = 'true';
  // The runtime gives render no teardown hook: the listener drops itself on the first event after
  // the root left `live` (destroyed or failed); a later remount re-arms it.
  let frame = 0;
  const onScroll = () => {
    if (root.dataset.zagState === 'live') {
      frame ||= requestAnimationFrame(() => {
        frame = 0;
        check();
      });
      return;
    }
    cancelAnimationFrame(frame);
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onScroll);
    delete root.dataset.tocTailWatched;
    spy.delete(root);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
}

/**
 * The items as SSR wrote them (no JSON copy in the page). No `onActiveChange`: `watchTail` emits.
 * @param {HTMLElement} root
 * @returns {Partial<import('@zag-js/toc').Props>}
 */
export function readDom(root) {
  return {
    items: [...root.querySelectorAll('[data-part="item"]')].map((el) => ({
      value: el.getAttribute('data-value') ?? '',
      depth: Number(el.getAttribute('data-depth')),
    })),
  };
}
