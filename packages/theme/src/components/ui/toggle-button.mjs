// ToggleButton (C-267, D-P5): one delegated click listener flips aria-pressed on every native
// toggle button. Zag toggle-group items carry data-scope and keep their machine's state.
const SELECTOR = '.ocx-ui-toggle-button:not([data-scope]):not(:disabled)';

/** @param {Event} event */
export function onClick(event) {
  const button = event.target instanceof Element ? event.target.closest(SELECTOR) : null;
  if (!button) return;
  const pressed = button.getAttribute('aria-pressed') !== 'true';
  button.setAttribute('aria-pressed', String(pressed));
  button.dispatchEvent(
    new CustomEvent('ocx:toggle-button:change', {
      detail: { pressed, value: /** @type {HTMLElement} */ (button).dataset['value'] },
      bubbles: true,
    }),
  );
}

/** @param {Document} [doc] */
export const install = (doc = document) => doc.addEventListener('click', onClick);
