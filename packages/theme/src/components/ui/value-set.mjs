// Programmatic setters for ToggleGroup and Select: a consumer sets the value from code (a URL, stored
// state) by dispatching `ocx:toggle-group:set` / `ocx:select:set` `{ value }` on the component root
// (`[data-zag-root]`), never by writing its attributes. No change event comes back. This half runs
// while the machine has not started (idle, or still loading): it rewrites the DOM the machine reads
// on start (`data-zag-props`, the native <select>). A live machine moves through its own api in
// toggle-group.zag.mjs / select.zag.mjs through `bindSet`, which skips the change event the same way.

/**
 * @param {Event} event
 * @param {string} scope `data-zag-root` of the component
 * @returns {HTMLElement | null} its root, unless the machine is live (it handles the event itself)
 */
function idleRoot(event, scope) {
  const root = event.target instanceof Element ? event.target.closest(`[data-zag-root="${scope}"]`) : null;
  return root instanceof HTMLElement && root.dataset['zagState'] !== 'live' ? root : null;
}

/** @param {Event} event */
export function onToggleGroupSet(event) {
  const root = idleRoot(event, 'toggle-group');
  if (!root) return;
  const value = [/** @type {CustomEvent<{ value?: string | string[] }>} */ (event).detail?.value ?? []]
    .flat()
    .map(String);
  /** @type {unknown} */
  const parsed = JSON.parse(root.dataset['zagProps'] ?? '{}');
  const props = /** @type {{ multiple?: boolean }} */ (parsed);
  // A machine that starts later boots from this default.
  root.dataset['zagProps'] = JSON.stringify({ ...props, defaultValue: value });
  for (const item of root.querySelectorAll('[data-part="item"]')) {
    if (item.closest('[data-zag-root]') !== root) continue;
    const on = value.includes(item.id.slice(root.id.length + 1));
    item.setAttribute(props.multiple ? 'aria-pressed' : 'aria-checked', String(on));
    item.setAttribute('data-state', on ? 'on' : 'off');
  }
}

/** A value no option carries changes nothing, as with a native select. @param {Event} event */
export function onSelectSet(event) {
  const root = idleRoot(event, 'select');
  const select = root?.querySelector('select');
  const value = String(/** @type {CustomEvent<{ value?: string }>} */ (event).detail?.value);
  const option = select && [...select.options].find((o) => o.value === value);
  if (!root || !select || !option) return;
  select.value = value;
  const text = root.querySelector('[data-part="value-text"]');
  if (text) text.textContent = option.text.trim();
  // The trigger's icon follows the selection; the option carries its markup (Select.astro).
  const glyph = /** @type {HTMLElement | null} */ (root.querySelector('.ocx-ui-select__glyph'));
  if (glyph && option.dataset['icon']) {
    glyph.innerHTML = option.dataset['icon'];
    glyph.dataset['value'] = value;
  }
}

/** @type {WeakMap<HTMLElement, unknown>} latest api per root */
const apis = new WeakMap();
/** @type {WeakSet<HTMLElement>} roots whose set listener is attached */
const listening = new WeakSet();
/** @type {WeakSet<HTMLElement>} roots whose next change report comes from code, not a visitor */
const quiet = new WeakSet();

/**
 * Live half of a set event, zag-free: keeps the latest `api` per root and, once per root, listens for
 * `ocx:<scope>:set`. `apply(latest, value)` (`latest()` is the api, fresh after any machine update) moves the machine and returns whether it did; the next change
 * report is then swallowed (`fromCode`), exactly once.
 * @template A
 * @param {HTMLElement} root
 * @param {string} scope
 * @param {A} api
 * @param {(latest: () => A, value: unknown) => boolean} apply
 */
export function bindSet(root, scope, api, apply) {
  apis.set(root, api);
  if (listening.has(root)) return;
  listening.add(root);
  root.addEventListener(`ocx:${scope}:set`, (event) => {
    // Set before `apply` (Zag may report synchronously). A move that changes nothing reports nothing, so it
    // restores the flag as it was: an earlier move's still-pending flag must survive.
    const pending = quiet.has(root);
    quiet.add(root);
    const { detail } = /** @type {CustomEvent<{ value?: unknown } | null>} */ (event);
    if (!apply(() => /** @type {A} */ (apis.get(root)), detail?.value) && !pending) quiet.delete(root);
  });
}

/** @param {HTMLElement} root @returns {boolean} true once per `bindSet` move: the change report to drop */
export const fromCode = (root) => quiet.delete(root);
