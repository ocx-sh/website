// CycleButton: one delegated click listener advances every cycle button to its next state (wrapping).
// SSR already carries the final state; `data-cycle` lists the states (`[value, label]`, in order), one
// glyph each (`.ocx-ui-cycle-button__state`, same order), the current one `__current`. No machine,
// so Enter and Space work natively. The first click sets `data-live`, under which the glyphs
// crossfade (cycle-button.css); `setValue` alone never does, so a state set before paint stays instant.

/**
 * The states and the index of `value` (-1 when unknown).
 * @param {HTMLElement} button @param {string | undefined} value
 * @returns {[[string, string][], number]}
 */
const find = (button, value) => {
  // SSR writes `data-cycle` (CycleButton.astro): trusted, never user input.
  const parse = /** @type {(text: string) => unknown} */ (JSON.parse);
  const states = /** @type {[string, string][]} */ (parse(/** @type {string} */ (button.dataset['cycle'])));
  return [states, states.findIndex((s) => s[0] === value)];
};

/**
 * Show state `value` on `button`: current glyph, `data-value`, the name "<label> (click for <next>)",
 * the visible label and the hidden form input. No event; an unknown value changes nothing.
 * @param {Element} button
 * @param {string} value
 * @returns {boolean} whether the state exists
 */
export function setValue(button, value) {
  const el = /** @type {HTMLElement} */ (button);
  const [states, at] = find(el, value);
  const label = states[at]?.[1];
  if (label === undefined) return false;
  // The glyphs are the button's only svgs (CycleButton.astro has no slot).
  el.querySelectorAll('svg').forEach((g, i) => g.classList.toggle('ocx-ui-cycle-button__current', i === at));
  el.dataset['value'] = value;
  el.setAttribute('aria-label', `${label} (click for ${states[(at + 1) % states.length]?.[1]})`);
  const text = el.querySelector('.ocx-ui-cycle-button__label');
  if (text) text.textContent = label;
  const input = el.querySelector('input');
  if (input) input.value = value;
  return true;
}

/** @param {Event} event */
export function onClick(event) {
  // No `instanceof`: the target may live in another window (tests, iframes), with its own globals.
  const button = /** @type {HTMLElement | null | undefined} */ (
    /** @type {Element | null} */ (event.target)?.closest?.('.ocx-ui-cycle-button:not(:disabled)')
  );
  if (!button) return;
  const previous = button.dataset['value'];
  const [states, at] = find(button, previous);
  const value = /** @type {string} */ (states[(at + 1) % states.length]?.[0]); // two states or more (SSR)
  const Custom = button.ownerDocument.defaultView?.CustomEvent ?? CustomEvent;
  if (
    button.dispatchEvent(
      new Custom('ocx:cycle-button:change', { detail: { value, previous }, bubbles: true, cancelable: true }),
    )
  ) {
    button.toggleAttribute('data-live', true);
    setValue(button, value);
  }
}

/** Idempotent: the same listener added twice is one listener. @param {Document} [doc] */
export function install(doc = document) {
  doc.addEventListener('click', onClick);
}
