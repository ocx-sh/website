/**
 * Show state `value` on `button`: current glyph, `data-value`, the name "<label> (click for <next>)",
 * the visible label and the hidden form input. No event; an unknown value changes nothing.
 * @param {Element} button
 * @param {string} value
 * @returns {boolean} whether the state exists
 */
export function setValue(button: Element, value: string): boolean;
/** @param {Event} event */
export function onClick(event: Event): void;
/** Idempotent: the same listener added twice is one listener. @param {Document} [doc] */
export function install(doc?: Document): void;
