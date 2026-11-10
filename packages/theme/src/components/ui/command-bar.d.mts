/**
 * Shows choice `value` on `bar`: command text, copy name (toast + accessible name), the machine's
 * start value, the picker's own text, glyph, name and tooltip. Idempotent. Self-contained on purpose (no imports,
 * no free variables, no named inner functions): PRE_PAINT ships its source inline.
 * @param {HTMLElement} bar
 * @param {string} value
 * @returns {string | undefined} the command, or undefined when `value` is not a choice
 */
export function apply(bar: HTMLElement, value: string): string | undefined;
/**
 * The visitor's OS as a choice value: 'windows', 'macos' or 'linux'; undefined when unknown
 * (a phone, a console). Self-contained, see `apply`.
 * @param {{ userAgentData?: { platform?: string }, platform?: string, userAgent?: string }} nav
 * @returns {'windows' | 'macos' | 'linux' | undefined}
 */
export function host(nav: {
    userAgentData?: {
        platform?: string;
    };
    platform?: string;
    userAgent?: string;
}): "windows" | "macos" | "linux" | undefined;
/**
 * Wires one bar: a pick moves the copy machine's value, a copy is announced in the bar's status.
 * @param {HTMLElement} bar
 */
export function wireBar(bar: HTMLElement): void;
/**
 * Inline script of the first detecting bar of a page, placed in the field straight after the command
 * text (the picker is parsed by then) so it runs during parsing, before first paint: SSR renders the
 * first choice, this swaps to the visitor's platform when the bar offers it (a choice whose `value` or
 * `os` is 'linux', 'macos' or 'windows'). It defines the detector once as a global and runs it on its
 * own bar and on every bar queued before it; later bars of the page ship PRE_PAINT_CALL instead. Never throws.
 */
export const PRE_PAINT: string;
/** Inline script of every later detecting bar on the page: runs the detector PRE_PAINT defined, or queues its bar for it. Never throws. */
export const PRE_PAINT_CALL: "try{ocxDetect(document.currentScript)}catch{(globalThis.ocxDetectQ||=[]).push(document.currentScript)}";
export type Choice = {
    value: string;
    label: string;
    command: string;
};
