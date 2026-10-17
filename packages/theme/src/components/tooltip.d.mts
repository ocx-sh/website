/**
 * Wire one inline tooltip (DOC-EX-34): focus opens it at once, hover opens it
 * after `data-delay` ms, moving the pointer onto the popup keeps it open,
 * Escape / blur / pointer leave (unless focused) / scroll close it, and only one
 * tooltip is open at a time. A tap or click focuses the trigger.
 * Focus may move from the trigger into the popup (e.g. a link) without closing it.
 * @param {HTMLElement} root a `[data-ocx-tooltip]` span holding the trigger
 *   `<button aria-describedby>` and the `popover="manual"` `[role="tooltip"]` it names
 * @returns {void}
 */
export function initTooltip(root: HTMLElement): void;
/** Grace period (ms) that keeps an open tooltip open while the pointer travels from the trigger onto the popup. */
export const GRACE_MS: 100;
export function nextTooltipId(): string;
