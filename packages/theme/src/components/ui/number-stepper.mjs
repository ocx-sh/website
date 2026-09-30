// Number stepper (Input type="number"): two ghost buttons step the input the way the native spin
// buttons would (stepUp / stepDown, then a bubbling `input` and `change`). Keyboard arrows stay native,
// so the buttons are tabindex -1. A button disables at min / max; no machine.
const STEP = '.ocx-ui-stepper [data-step]';

/** @param {Element} el @returns {HTMLInputElement | null} */
function inputFor(el) {
  const input = el.closest('.ocx-ui-input-group')?.querySelector('input[type="number"]');
  return input instanceof HTMLInputElement ? input : null;
}

/** Disable each button that could not move the value: field off, or already at its bound. @param {HTMLInputElement} input */
export function sync(input) {
  const v = input.valueAsNumber;
  const off = input.disabled || input.readOnly;
  for (const button of input.closest('.ocx-ui-input-group')?.querySelectorAll(STEP) ?? []) {
    const down = /** @type {HTMLElement} */ (button).dataset['step'] === 'down';
    const bound = down ? input.min : input.max;
    /** @type {HTMLButtonElement} */ (button).disabled =
      off || (bound !== '' && !Number.isNaN(v) && (down ? v <= Number(bound) : v >= Number(bound)));
  }
}

/** @param {Event} event */
export function onClick(event) {
  const button = event.target instanceof Element ? event.target.closest(STEP) : null;
  const input = button && inputFor(button);
  if (!(button instanceof HTMLButtonElement) || !input || button.disabled) return;
  if (button.dataset['step'] === 'down') input.stepDown();
  else input.stepUp();
  input.focus(); // a button that disables at its bound must not take focus with it
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

/** @param {Event} event */
function onValue(event) {
  const t = event.target;
  if (t instanceof HTMLInputElement && t.type === 'number' && t.closest('.ocx-ui-input-group')) sync(t);
}

/** @param {Document} [doc] */
export function install(doc = document) {
  doc.addEventListener('click', onClick);
  doc.addEventListener('input', onValue);
  doc.addEventListener('change', onValue);
  for (const button of doc.querySelectorAll(STEP)) {
    const input = inputFor(button);
    if (input) sync(input);
  }
}
