/**
 * Writes `text` to the clipboard. Never throws: a page without the async clipboard API (an
 * insecure context, `navigator.clipboard` is undefined), a synchronous throw and a refused write
 * all resolve `false` (D-084).
 * @param {string} text
 * @returns {Promise<boolean>} whether the text is on the clipboard
 */
export function writeClipboard(text: string): Promise<boolean>;
/**
 * Asks the page toaster to confirm a finished copy: "Copied — <meaning>" for 2 s, or the danger
 * "Copy failed". Both take the `copy` slot, so the newest replaces the one showing and a re-copy
 * restarts the window (D-143, D-166).
 * @param {EventTarget} target dispatched from here (bubbles)
 * @param {boolean} ok
 * @param {string} meaning what was copied, in words ("install command"), not the payload
 */
export function toastCopy(target: EventTarget, ok: boolean, meaning: string): void;
/**
 * Copies `text` and toasts the outcome.
 * @param {EventTarget} target
 * @param {string} text
 * @param {string} meaning
 * @returns {Promise<boolean>}
 */
export function copyWithToast(target: EventTarget, text: string, meaning: string): Promise<boolean>;
