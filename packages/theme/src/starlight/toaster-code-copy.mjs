// Expressive Code copy buttons -> toast (C-182), loaded by toaster.mjs on the first click on one. EC
// copies and, only on success, adds its "Copied!" feedback to the frame's live region; that addition
// is the signal for our toast (first line of the code, C-182).
import { COPY_TOAST_MS, COPY_TOAST_SLOT, copiedTitle, toast } from '../components/toast.mjs';

/**
 * @param {Event} event a click on `.expressive-code .copy button`
 * @param {number} before the live region's feedback count when the click happened
 */
export function toastCodeCopy(event, before) {
  const button = /** @type {Element | null} */ (event.target)?.closest?.('.expressive-code .copy button');
  const live = button?.parentElement?.querySelector('[aria-live]');
  if (!(button instanceof HTMLElement) || !live) return;
  const line = (button.dataset['code'] ?? '').split('\u007f').find((l) => l.trim()) ?? '';
  // EC adds no new feedback while an earlier one is still shown or fading: that one means copied.
  const had = before > 0;
  /** @param {boolean} ok */
  const done = (ok) => {
    observer.disconnect();
    clearTimeout(timer);
    toast(
      button,
      ok
        ? { title: copiedTitle(line), duration: COPY_TOAST_MS, slot: COPY_TOAST_SLOT }
        : { title: 'Copy failed', tone: 'danger', slot: COPY_TOAST_SLOT },
    );
  };
  const observer = new MutationObserver((records) => records.some((r) => r.addedNodes.length) && done(true));
  observer.observe(live, { childList: true });
  const timer = setTimeout(() => done(had || live.childElementCount > 0), 1000);
  // The chunk loaded after EC already added its feedback: nothing left to observe, toast now.
  if (live.childElementCount > before) done(true);
}
