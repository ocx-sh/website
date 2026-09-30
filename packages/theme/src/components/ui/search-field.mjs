// SearchField (C-269): two delegated listeners, no machine. Clear button and Escape both empty the
// input the way typing would (a bubbling `input`), keep focus in it and announce `ocx:search-field:clear`.
const ROOT = '.ocx-ui-search-field';
const INPUT = '.ocx-ui-input-group__input';

/** @param {HTMLInputElement} input */
function clear(input) {
  if (input.readOnly) return;
  input.value = '';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.focus();
  input.dispatchEvent(new CustomEvent('ocx:search-field:clear', { bubbles: true }));
}

/** @param {Event} event */
export function onClick(event) {
  const button = event.target instanceof Element ? event.target.closest('.ocx-ui-search-field__clear') : null;
  const input = button?.closest(ROOT)?.querySelector(INPUT);
  if (input instanceof HTMLInputElement) clear(input);
}

/** @param {KeyboardEvent} event */
export function onKeydown(event) {
  if (event.key !== 'Escape' || event.isComposing) return;
  const input = event.target instanceof Element ? event.target.closest(INPUT) : null;
  if (!(input instanceof HTMLInputElement) || !input.closest(ROOT) || !input.value || input.readOnly) return;
  event.preventDefault();
  // Capture phase: stops here, so a surrounding dialog never sees this Escape.
  event.stopPropagation();
  clear(input);
}

/** @param {Document} [doc] */
export function install(doc = document) {
  doc.addEventListener('click', onClick);
  doc.addEventListener('keydown', onKeydown, { capture: true });
}
