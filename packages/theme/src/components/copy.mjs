// Stable public API, exported as `@ocx-sh/theme/copy`.
// Copy-to-clipboard plus its confirmation, shared by every copy control (D-131, D-143, D-084):
// CopyButton (clipboard.zag.mjs), CopyMenu (copy-menu.zag.mjs) and the prose code-block button
// (prose-code-copy.mjs). Zag-free, and imports only toast.mjs: every user loads it lazily on a first
// interaction, the prose script included. CopyMenu's eager half is copy-host.mjs, so a page that
// only has context menus loads none of this before input.
import { COPY_TOAST_MS, COPY_TOAST_SLOT, copiedTitle, toast } from './toast.mjs';

/**
 * Writes `text` to the clipboard. Never throws: a page without the async clipboard API (an
 * insecure context, `navigator.clipboard` is undefined), a synchronous throw and a refused write
 * all resolve `false` (D-084).
 * @param {string} text
 * @returns {Promise<boolean>} whether the text is on the clipboard
 */
export async function writeClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Asks the page toaster to confirm a finished copy: "Copied — <meaning>" for 2 s, or the danger
 * "Copy failed". Both take the `copy` slot, so the newest replaces the one showing and a re-copy
 * restarts the window (D-143, D-166).
 * @param {EventTarget} target dispatched from here (bubbles)
 * @param {boolean} ok
 * @param {string} meaning what was copied, in words ("install command"), not the payload
 */
export function toastCopy(target, ok, meaning) {
  toast(
    target,
    ok
      ? { title: copiedTitle(meaning), duration: COPY_TOAST_MS, slot: COPY_TOAST_SLOT }
      : { title: 'Copy failed', tone: 'danger', slot: COPY_TOAST_SLOT },
  );
}

/**
 * Copies `text` and toasts the outcome.
 * @param {EventTarget} target
 * @param {string} text
 * @param {string} meaning
 * @returns {Promise<boolean>}
 */
export async function copyWithToast(target, text, meaning) {
  const ok = await writeClipboard(text);
  toastCopy(target, ok, meaning);
  return ok;
}
