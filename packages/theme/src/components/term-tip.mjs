// The glossary popover (WCAG 1.4.13: dismissible, hoverable, persistent). A term in prose is a plain link,
// `a.ocx-term`, to its glossary entry; term-touch.mjs loads this module on the first hover or focus of one. It then
// fetches `<base>glossary.json` (`{id: [term, definition]}`, once) and shows the definition in one shared popup.
// A failed load leaves every term the plain link it is: nothing is shown and nothing is reported.
import css from './term-tip.css?inline';

// Equal to tooltip.mjs's, not imported: a module both load makes Rollup split Tooltip's page script into a stub plus a
// second request on every page that has a Tooltip (term-tip.dom.test.ts pins the two together).
export const GRACE_MS = 100;

/** Hover-intent delay in ms before a hovered term opens its popup; focus opens it at once. */
export const HOVER_MS = 400;
const TERM = 'a.ocx-term';
const POPUP_ID = 'ocx-term-tip';
const ANCHOR = '--ocx-term-tip';

/** @typedef {Record<string, [term: string, definition: string]>} Definitions */

/** @type {Promise<Definitions | null> | undefined} */
let definitions;

/**
 * The popup text of every term, fetched once; `null` when the fetch fails (a plain link is the fallback).
 * @param {string} url
 * @returns {Promise<Definitions | null>}
 */
const load = (url) =>
  (definitions ??= fetch(url, { credentials: 'same-origin' })
    .then((res) => (res.ok ? res.json() : null))
    .catch(() => null));

/** Forget the fetched data: tests start from none. */
export function reset() {
  definitions = undefined;
}

/**
 * A definition as nodes: text, with each `code` span between backticks as a <code>.
 * @param {Document} doc
 * @param {string} text
 */
const nodes = (doc, text) =>
  text.split('`').map((part, i) => {
    if (i % 2 === 0) return doc.createTextNode(part);
    const code = doc.createElement('code');
    code.textContent = part;
    return code;
  });

/**
 * Wires every `a.ocx-term` of `doc`, present and later inserted (the listeners are on the document), to the one
 * shared popup, and opens the popup for `first`, the event that loaded this module. Focus opens at once, hover
 * after {@link HOVER_MS}; the pointer may move onto the popup; Escape, blur and pointer leave (unless the term is
 * focused) and a scroll (unless focused) close it; one popup is open at a time; the open term carries
 * `aria-describedby` only while it is open.
 * @param {Document} doc
 * @param {Event} [first]
 * @param {{ url?: string }} [options] `url` of the definitions; default `<base>glossary.json`
 * @returns {() => void} stops listening and closes the popup (a test's cleanup)
 */
export function start(doc, first, { url = `${import.meta.env.BASE_URL.replace(/\/?$/, '/')}glossary.json` } = {}) {
  /** @type {HTMLElement | undefined} */
  let popup;
  /** The term currently showing the popup. @type {HTMLAnchorElement | undefined} */
  let shown;
  /** The term the visitor last pointed at or focused: a slow fetch must not open for one they have left. @type {Element | undefined} */
  let wanted;
  let hovered = false;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  const stop = new AbortController();
  /** @type {AddEventListenerOptions} */
  const scrollOpts = { capture: true, passive: true, signal: stop.signal };

  /** @param {EventTarget | null} node @returns {HTMLAnchorElement | null} */
  const termOf = (node) =>
    node instanceof Element ? /** @type {HTMLAnchorElement | null} */ (node.closest(TERM)) : null;
  /** @param {EventTarget | null} node */
  const inPopup = (node) => node instanceof Node && !!popup?.contains(node);
  /** The term and its popup are one hover target (the popup may sit in the top layer, it is still a descendant of body). @param {EventTarget | null} node */
  const inside = (node) => inPopup(node) || (!!shown && node instanceof Node && shown.contains(node));
  /** @param {() => void} fn @param {number} ms */
  const later = (fn, ms) => {
    clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };

  const close = () => {
    clearTimeout(timer);
    wanted = undefined;
    if (!shown) return;
    doc.removeEventListener('scroll', onScroll, scrollOpts);
    shown.removeAttribute('aria-describedby');
    shown.style.removeProperty('anchor-name');
    shown = undefined;
    popup?.hidePopover();
  };
  // Hover-opened popups close on a scroll (the anchor moved); a focused term keeps its popup, since Tab itself
  // scrolls it into view and the popup follows its anchor.
  const onScroll = () => {
    if (!shown || doc.activeElement !== shown) close();
  };

  /** @param {HTMLAnchorElement} link */
  const open = (link) => {
    clearTimeout(timer);
    if (shown === link) return;
    wanted = link;
    const id = decodeURIComponent(link.hash.slice(1));
    void load(url).then((all) => {
      const entry = all?.[id];
      // Gone by the time the data arrived: the visitor moved on, or the id has no definition.
      if (!entry || wanted !== link || !link.isConnected) return;
      if (!popup) {
        const style = doc.createElement('style');
        style.textContent = css;
        doc.head.append(style);
        popup = doc.createElement('div');
        popup.id = POPUP_ID;
        popup.className = 'ocx-term-tip';
        popup.setAttribute('role', 'tooltip');
        popup.setAttribute('popover', 'manual');
        // Inside the page's landmark: content outside every landmark fails axe's `region` rule.
        (link.closest('main') ?? doc.body).append(popup);
      }
      const [term, definition] = entry;
      const title = doc.createElement('strong');
      title.textContent = term;
      popup.replaceChildren(title, ...nodes(doc, definition));
      if (shown) {
        shown.removeAttribute('aria-describedby');
        shown.style.removeProperty('anchor-name');
      } else popup.showPopover();
      shown = link;
      link.style.setProperty('anchor-name', ANCHOR);
      link.setAttribute('aria-describedby', POPUP_ID);
      doc.addEventListener('scroll', onScroll, scrollOpts);
    });
  };

  doc.addEventListener(
    'focusin',
    (e) => {
      const link = termOf(e.target);
      if (link) open(link);
    },
    { signal: stop.signal },
  );
  doc.addEventListener(
    'focusout',
    (e) => {
      if ((e.target === shown || e.target === wanted) && !hovered) close();
    },
    { signal: stop.signal },
  );
  // pointerover/out with relatedTarget = enter and leave of the term ∪ popup. Touch has no hover: a tap is a click.
  doc.addEventListener(
    'pointerover',
    (e) => {
      if (e.pointerType === 'touch') return;
      const link = termOf(e.target);
      if (!link && !inside(e.target)) return;
      // Moving within the open term or its popup changes nothing; from the open term straight onto another does.
      if (link ? link === termOf(e.relatedTarget) : inside(e.relatedTarget)) return;
      hovered = true;
      if (link && link !== shown) later(() => open(link), HOVER_MS);
      else clearTimeout(timer); // back on the open term or onto its popup: stay open
    },
    { signal: stop.signal },
  );
  doc.addEventListener(
    'pointerout',
    (e) => {
      if (e.pointerType === 'touch') return;
      const link = termOf(e.target);
      if (!link && !inside(e.target)) return;
      if (inside(e.relatedTarget) || (link && link === termOf(e.relatedTarget))) return;
      hovered = false;
      // Persistent: a focused term keeps its popup after the pointer leaves.
      if (shown && doc.activeElement === shown) return;
      later(close, GRACE_MS);
    },
    { signal: stop.signal },
  );
  doc.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape') close(); // also cancels a hover still waiting to open; focus stays where it was
    },
    { signal: stop.signal },
  );

  // The event that loaded this module already happened: act on it as the listeners would have.
  const link = termOf(first?.target ?? null);
  if (link && first?.type === 'focusin') open(link);
  else if (link && first?.type === 'pointerover' && /** @type {PointerEvent} */ (first).pointerType !== 'touch') {
    hovered = true;
    later(() => open(link), HOVER_MS);
  }
  return () => {
    stop.abort();
    close();
  };
}
