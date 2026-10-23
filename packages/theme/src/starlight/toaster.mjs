// C-181 / C-182 toaster glue: no Zag until the first `ocx:toast` (D-Z11 manual). The toaster root
// is the Footer override's; this glue runs from Search.astro's every-page script, as the header nav
// does (C-192): a Footer script of its own was one more request before first paint, and with the
// four preloaded fonts holding four of Lighthouse's six simulated connections it pushed LCP on
// code-heavy pages a round trip later (performance 0.99).
import { mount } from '../components/ui/zag.mjs';

/** @typedef {import('../components/toast.mjs').ToastDetail} ToastDetail */

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

  // Expressive Code copy buttons (C-182): the click only says which button; the code that watches EC's
  // feedback and toasts loads on the first one (toaster-code-copy.mjs), so a page without EC pays a
  // listener, not the observer. EC adds its feedback after an async clipboard write; the handler gets
  // the feedback count at click time, so a load that outlasts the feedback still toasts at once.
  doc.addEventListener('click', (event) => {
    const button = /** @type {Element | null} */ (event.target)?.closest?.('.expressive-code .copy button');
    if (!button) return;
    // Counted now, not when the chunk arrives: a feedback EC added in between is this click's.
    const before = button.parentElement?.querySelector('[aria-live]')?.childElementCount ?? 0;
    import('./toaster-code-copy.mjs')
      .then((m) => m.toastCodeCopy(event, before))
      .catch((error) => console.error('[ocx] the Expressive Code copy toast failed to load', error));
  });
}
