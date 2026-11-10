/** Disable each button that could not move the value: field off, or already at its bound. @param {HTMLInputElement} input */
export function sync(input: HTMLInputElement): void;
/** @param {Event} event */
export function onClick(event: Event): void;
/** @param {Document} [doc] */
export function install(doc?: Document): void;
/**
 * Disables a step button that starts at its bound.
 * @param {Element} button
 */
export function syncButton(button: Element): void;
/** The step buttons the page script syncs once each (`onRoots`). */
export const STEP_BUTTON: ".ocx-ui-stepper [data-step]";
