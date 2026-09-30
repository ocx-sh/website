// TagGroup removal (C-272, selectionMode 'none'): one delegated listener, no Zag. A remove click
// dispatches a cancelable `ocx:tag-group:remove {value}`; unless prevented, the chip's <li> goes and
// focus moves to the next remove button, else the previous, else the group root (tabindex -1).
const REMOVE = '[data-ocx-tag-group] .ocx-ui-tag__remove:not(:disabled)';

/** @param {Element} button */
function remove(button) {
  const root = /** @type {HTMLElement} */ (button.closest('[data-ocx-tag-group]'));
  const item = button.closest('li');
  if (!item) return;
  const value = /** @type {HTMLElement | null} */ (item.querySelector('[data-value]'))?.dataset['value'];
  const go = button.dispatchEvent(
    new CustomEvent('ocx:tag-group:remove', { detail: { value }, bubbles: true, cancelable: true }),
  );
  if (!go) return;
  const buttons = [...root.querySelectorAll(':scope > li .ocx-ui-tag__remove:not(:disabled)')];
  const i = buttons.indexOf(button);
  const next = /** @type {HTMLElement} */ (buttons[i + 1] ?? buttons[i - 1] ?? root);
  item.remove();
  next.focus();
}

/** @param {Event} event */
function onClick(event) {
  const button = event.target instanceof Element ? event.target.closest(REMOVE) : null;
  if (button) remove(button);
}

/** @param {KeyboardEvent} event */
function onKeydown(event) {
  if (event.key !== 'Backspace' && event.key !== 'Delete') return;
  const button = event.target instanceof Element ? event.target.closest(REMOVE) : null;
  if (!button) return;
  event.preventDefault();
  remove(button);
}

/** @param {Document} [doc] */
export function install(doc = document) {
  doc.addEventListener('click', onClick);
  doc.addEventListener('keydown', onKeydown);
}
