// "Copy code" on every code block in prose (D-064, D-112): README and docs content that arrives as
// plain `<pre>` (a sanitised build-time block cannot carry a button of its own). Zag-free, and one
// small script: buttons are inserted when the script runs (a screen-reader user has no hover or Tab
// to summon them), a single delegated click copies, and the clipboard and toast code (copy.mjs,
// toast.mjs) loads on the first click, or ahead of it on a hover over a block or focus of its button: this eager
// half imports neither, so a page that never copies loads none of it (as copy-host.mjs does for
// CopyMenu). No inline handler, no markup string from content: the only HTML parsed here is the
// two registry glyphs.
import { check, copy } from '../icons/icons.client.generated.mjs';

/** The lazy half; the module cache makes every call after the first free. */
const loadCopy = () => import('./copy.mjs');

/** Prose roots, as base.css styles them. Expressive Code frames bring their own button. */
export const PROSE_PRE = ':is(.ocx-prose, .sl-markdown-content, .vp-doc) pre';
/** What the toast names (D-064). */
export const CODE_MEANING = 'code block';
/** How long the button reads copied; a re-copy restarts it. */
const COPIED_MS = 1500;

/** @param {{ viewBox: string, body: string, stroke?: number }} glyph @param {string} part */
const svg = ({ viewBox, body, stroke }, part) =>
  `<svg data-part="${part}" viewBox="${viewBox}" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;

/** @type {WeakMap<Element, ReturnType<typeof setTimeout>>} */
const timers = new WeakMap();

/** Documents whose delegated listeners are wired. @type {WeakSet<Document>} */
const wired = new WeakSet();

/**
 * Adds the "Copy code" button to one enhanceable `pre` (once) and wires the document's delegated
 * listeners (once).
 * @param {Element} pre
 */
export function enhancePre(pre) {
  const doc = pre.ownerDocument;
  listen(doc);
  if (pre.matches('[data-ocx-code-copy]') || pre.closest('.expressive-code')) return;
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'ocx-prose-copy';
  button.title = 'Copy code';
  button.setAttribute('aria-label', 'Copy code');
  button.innerHTML = svg(copy, 'idle') + svg(check, 'done');
  pre.setAttribute('data-ocx-code-copy', '');
  pre.append(button);
}

/**
 * The delegated half: a prefetch on hover or focus, and the copy click.
 * @param {Document} doc
 */
function listen(doc) {
  if (wired.has(doc)) return;
  wired.add(doc);
  // Start the load when a block is hovered or its button focused, so the click's copy is not left waiting on the network.
  const prefetch = (/** @type {Event} */ event) => {
    if (/** @type {Element | null} */ (event.target)?.closest?.('[data-ocx-code-copy]'))
      void loadCopy()
        .then(() => {
          // Loaded: the listeners have nothing left to do.
          doc.removeEventListener('pointerover', prefetch);
          doc.removeEventListener('focusin', prefetch);
        })
        .catch(() => {});
  };
  doc.addEventListener('pointerover', prefetch);
  doc.addEventListener('focusin', prefetch);
  /** @param {Event} event */
  const copyBlock = async (event) => {
    const button = /** @type {Element | null} */ (event.target)?.closest?.('.ocx-prose-copy');
    const pre = button?.closest('pre');
    if (!button || !pre) return;
    // The code, not the button: the first `code` child when there is one (what a reader sees).
    const text = (pre.querySelector(':scope > code') ?? pre).textContent ?? '';
    let copyWithToast;
    try {
      ({ copyWithToast } = await loadCopy());
    } catch (error) {
      console.warn('ocx-theme: the copy code failed to load', error);
      return;
    }
    if (!(await copyWithToast(button, text.replace(/\n$/, ''), CODE_MEANING))) return;
    button.setAttribute('data-copied', '');
    clearTimeout(timers.get(button));
    timers.set(
      button,
      setTimeout(() => button.removeAttribute('data-copied'), COPIED_MS),
    );
  };
  doc.addEventListener('click', (event) => void copyBlock(event));
}

/**
 * Enhances every code block under `doc` (a consumer that renders prose at once; the page script uses
 * `onRoots(PROSE_PRE, enhancePre)` so blocks inserted later are covered).
 * @param {Document} doc
 */
export function enhanceProseCode(doc) {
  for (const pre of doc.querySelectorAll(PROSE_PRE)) enhancePre(pre);
}
