// C-181 / C-182 toaster glue: no Zag until the first `ocx:toast` (D-Z11 manual). The toaster root
// is the Footer override's; this glue runs from Search.astro's every-page script, as the header nav
// does (C-192): a Footer script of its own was one more request before first paint, and with the
// four preloaded fonts holding four of Lighthouse's six simulated connections it pushed LCP on
// code-heavy pages a round trip later (performance 0.99).
import { mount } from '../components/ui/zag.mjs';

/** @typedef {import('../components/toast.mjs').ToastDetail} ToastDetail */

// Same as toast.mjs's helpers, repeated so the every-page script stays one request: importing
// them would split toast.mjs into its own chunk, shared with clipboard.zag.mjs (a chained fetch).
/** @param {string} text */
const copiedTitle = (text) => `Copied ${text.length > 40 ? `${text.slice(0, 39)}…` : text}`;
/** @param {EventTarget} target @param {ToastDetail} detail */
const toast = (target, detail) => target.dispatchEvent(new CustomEvent('ocx:toast', { detail, bubbles: true }));

/**
 * Starts the page toaster on the first `ocx:toast`, and toasts Expressive Code's copy buttons.
 * @param {Document} doc
 */
export function installToaster(doc) {
  /** @type {HTMLElement | null} */
  const root = doc.querySelector('[data-zag-root="toast"]');
  // Out of Starlight's isolated `.main-pane` (else the right sidebar paints over the toasts), and
  // now, long before a toast: a live region moved right before its first message may not announce it.
  if (root) doc.body.append(root);
  /** @type {import('../components/ui/zag.mjs').MountHandle | undefined} */
  let handle;
  doc.addEventListener('ocx:toast', (event) => {
    const { detail } = /** @type {CustomEvent<ToastDetail>} */ (event);
    // Any script can dispatch one: a malformed request is dropped, not a broken toast.
    if (!root || typeof detail?.title !== 'string') return;
    const h = (handle ??= mount(root, {
      load: () => import('../components/toast.zag.mjs'),
      trigger: 'manual',
      replay: false,
    }));
    void h.start().then(() => /** @type {{ show?: (d: ToastDetail) => void } | undefined} */ (h.api)?.show?.(detail));
  });
  // No toast shown yet means nothing to dismiss: never mounts the toaster just to no-op. Once one
  // has, queue behind its start: a dismiss sent while the chunk still loads must not be dropped.
  doc.addEventListener('ocx:toast:dismiss', (event) => {
    const { detail } = /** @type {CustomEvent<{ id?: string }>} */ (event);
    const h = handle;
    if (!h) return;
    void h
      .start()
      .then(() => /** @type {{ dismiss?: (id?: string) => void } | undefined} */ (h.api)?.dismiss?.(detail?.id));
  });

  // Expressive Code copy buttons: EC copies and, only on success, adds its "Copied!" feedback
  // to the frame's live region; that addition is the signal for our toast (first line, C-182).
  doc.addEventListener('click', (event) => {
    const button = /** @type {Element | null} */ (event.target)?.closest?.('.expressive-code .copy button');
    const live = button?.parentElement?.querySelector('[aria-live]');
    if (!(button instanceof HTMLElement) || !live) return;
    const line = (button.dataset['code'] ?? '').split('\u007f').find((l) => l.trim()) ?? '';
    // EC adds no new feedback while an earlier one is still shown or fading: that one means copied.
    const had = live.childElementCount > 0;
    /** @param {boolean} ok */
    const done = (ok) => {
      observer.disconnect();
      clearTimeout(timer);
      toast(button, ok ? { title: copiedTitle(line) } : { title: 'Copy failed', tone: 'danger' });
    };
    const observer = new MutationObserver((records) => records.some((r) => r.addedNodes.length) && done(true));
    observer.observe(live, { childList: true });
    const timer = setTimeout(() => done(had || live.childElementCount > 0), 1000);
  });
}
